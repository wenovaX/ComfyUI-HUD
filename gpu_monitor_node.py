import subprocess
import threading
import time

import torch
from aiohttp import web
from server import PromptServer


REFRESH_INTERVAL = 1.0
_MONITOR_ROUTES_REGISTERED = False


def get_gpu_data():
    try:
        stats = {"devices": [], "timestamp": time.time(), "is_running": False}

        server = PromptServer.instance
        if server and hasattr(server, "prompt_queue"):
            try:
                queue_info = server.prompt_queue.get_queue()
                stats["is_running"] = len(queue_info[0]) > 0 or len(queue_info[1]) > 0
            except Exception:
                pass

        nvidia_smi_data = {}
        try:
            res = subprocess.check_output(
                [
                    "nvidia-smi",
                    "--query-gpu=name,memory.total,memory.used,utilization.gpu",
                    "--format=csv,noheader,nounits",
                ],
                encoding="utf-8",
            )
            for i, line in enumerate(res.strip().split("\n")):
                parts = [part.strip() for part in line.split(",")]
                if len(parts) < 4:
                    continue
                nvidia_smi_data[i] = {
                    "name": parts[0],
                    "total_vram": int(parts[1]) * 1024 * 1024,
                    "used_vram": int(parts[2]) * 1024 * 1024,
                    "utilization": int(parts[3]),
                }
        except Exception:
            pass

        if torch.cuda.is_available():
            for i in range(torch.cuda.device_count()):
                props = torch.cuda.get_device_properties(i)
                free_mem, total_mem = torch.cuda.mem_get_info(i)
                smi_data = nvidia_smi_data.get(i, {})
                reported_total = smi_data.get("total_vram", total_mem)
                reported_used = smi_data.get("used_vram", total_mem - free_mem)
                stats["devices"].append(
                    {
                        "name": smi_data.get("name", props.name),
                        "index": i,
                        "total_vram": reported_total,
                        "used_vram": reported_used,
                        "allocated_vram": torch.cuda.memory_allocated(i),
                        "reserved_vram": torch.cuda.memory_reserved(i),
                        "utilization": smi_data.get("utilization", 0),
                    }
                )
        return stats
    except Exception:
        return None


def _monitor_loop():
    global REFRESH_INTERVAL
    while True:
        try:
            if PromptServer.instance:
                stats = get_gpu_data()
                if stats:
                    PromptServer.instance.send_sync("comfyui_hud_gpu_stats", stats)
        except Exception:
            pass
        time.sleep(REFRESH_INTERVAL)


threading.Thread(target=_monitor_loop, daemon=True).start()


def register_monitor_routes():
    global _MONITOR_ROUTES_REGISTERED
    if _MONITOR_ROUTES_REGISTERED or not getattr(PromptServer, "instance", None):
        return

    routes = PromptServer.instance.routes

    @routes.post("/hud/set_interval")
    async def set_interval(request):
        global REFRESH_INTERVAL
        json_data = await request.json()
        new_val = json_data.get("interval", 1.0)
        REFRESH_INTERVAL = max(0.2, min(10.0, float(new_val)))
        return web.json_response({"status": "ok", "interval": REFRESH_INTERVAL})

    @routes.get("/hud/gpu_stats")
    async def get_gpu_stats(request):
        stats = get_gpu_data()
        return web.json_response(stats) if stats else web.json_response({"error": "Failed"}, status=500)

    _MONITOR_ROUTES_REGISTERED = True


register_monitor_routes()


class ComfyUI_HUD_GPUMonitor:
    DESCRIPTION = "Monitors GPU utilization and VRAM usage in real-time. Data is streamed to the HUD overlay."
    TITLE = "GPU Monitor"
    RETURN_TYPES = ()
    FUNCTION = "monitor"
    CATEGORY = "HUD/Monitoring"
    OUTPUT_NODE = True

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {},
            "optional": {
                "refresh_rate": (
                    "FLOAT",
                    {
                        "default": 1.0,
                        "min": 0.2,
                        "max": 10.0,
                        "step": 0.1,
                        "tooltip": "How often to poll GPU data (in seconds).",
                    },
                )
            },
        }

    def monitor(self, **kwargs):
        register_monitor_routes()
        return {}
