from .gpu_monitor_node import register_monitor_routes


class ComfyUI_HUD_LogMonitor:
    DESCRIPTION = "Streams ComfyUI console logs directly to the HUD overlay for real-time debugging."
    TITLE = "Log Monitor"
    RETURN_TYPES = ()
    FUNCTION = "monitor"
    CATEGORY = "HUD/Monitoring"
    OUTPUT_NODE = True

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "max_lines": (
                    "INT",
                    {
                        "default": 50,
                        "min": 10,
                        "max": 500,
                        "step": 10,
                        "tooltip": "Maximum number of log lines to keep in the buffer.",
                    },
                ),
                "font_size": (
                    "INT",
                    {
                        "default": 11,
                        "min": 8,
                        "max": 24,
                        "step": 1,
                        "tooltip": "Font size for the log display.",
                    },
                ),
            },
            "optional": {
                "clear_on_run": (
                    "BOOLEAN",
                    {
                        "default": False,
                        "tooltip": "If enabled, clears the log buffer whenever a new prompt is queued.",
                    },
                ),
            },
        }

    def monitor(self, **kwargs):
        register_monitor_routes()
        return {}
