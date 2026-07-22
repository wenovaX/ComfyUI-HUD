import json
import os
import platform
import subprocess

import folder_paths
from aiohttp import web
from server import PromptServer


USER_DATA_DIR = os.path.join(os.path.dirname(__file__), "user_data")
STYLISH_NAMING_PRESETS_FILE = os.path.join(USER_DATA_DIR, "stylish_naming_presets.json")
LEGACY_PRESETS_FILE = os.path.join(USER_DATA_DIR, "stylish_label_presets.json")
STYLISH_NAMING_ROUTE_PREFIXES = ("/hud/stylish-naming", "/hud/stylish-label")
STYLISH_NAMING_ROUTES_REGISTERED = False
DEBUG_NEXT_NUMBER = bool(os.environ.get("HUD_DEBUG_NEXT_NUMBER"))
STYLISH_NAMING_PROPERTY_KEY = "comfyui_hud_stylish_naming"
STYLISH_NAMING_RESULTS = {}


def _debug_log(message):
    if DEBUG_NEXT_NUMBER:
        print(message)


def _load_json_file(path, default):
    if not os.path.exists(path):
        return default
    try:
        with open(path, "r", encoding="utf-8") as file:
            return json.load(file)
    except Exception:
        return default


def _load_json_with_legacy(primary_path, legacy_path, default):
    data = _load_json_file(primary_path, None)
    if data is not None:
        return data
    return _load_json_file(legacy_path, default)


def _save_json_file(path, data):
    os.makedirs(USER_DATA_DIR, exist_ok=True)
    with open(path, "w", encoding="utf-8") as file:
        json.dump(data, file, indent=4, ensure_ascii=False)


def _register_json_routes(routes, suffix, load_fn, save_fn):
    for prefix in STYLISH_NAMING_ROUTE_PREFIXES:
        @routes.get(f"{prefix}/{suffix}")
        async def get_json(request, _load_fn=load_fn):
            return web.json_response(_load_fn())

        @routes.post(f"{prefix}/{suffix}")
        async def save_json(request, _save_fn=save_fn):
            try:
                data = await request.json()
                _save_fn(data)
                return web.json_response({"success": True})
            except Exception as exc:
                return web.json_response({"success": False, "error": str(exc)}, status=500)


def _load_presets():
    loaded = _load_json_with_legacy(STYLISH_NAMING_PRESETS_FILE, LEGACY_PRESETS_FILE, [])
    return loaded if isinstance(loaded, list) else []


def _save_presets(data):
    _save_json_file(STYLISH_NAMING_PRESETS_FILE, data if isinstance(data, list) else [])


def _register_stylish_naming_routes():
    global STYLISH_NAMING_ROUTES_REGISTERED
    if STYLISH_NAMING_ROUTES_REGISTERED or not getattr(PromptServer, "instance", None):
        return

    os.makedirs(USER_DATA_DIR, exist_ok=True)
    routes = PromptServer.instance.routes

    _register_json_routes(routes, "presets", _load_presets, _save_presets)

    for prefix in STYLISH_NAMING_ROUTE_PREFIXES:
        @routes.post(f"{prefix}/result")
        async def save_result(request):
            try:
                payload = await request.json()
                node_id = str(payload.get("node_id") or "").strip()
                if not node_id:
                    return web.json_response({"success": False, "error": "empty node_id"}, status=400)

                STYLISH_NAMING_RESULTS[node_id] = str(payload.get("result") or "")
                return web.json_response({"success": True})
            except Exception as exc:
                return web.json_response({"success": False, "error": str(exc)}, status=500)

        @routes.post(f"{prefix}/open-dir")
        async def open_dir(request):
            try:
                payload = await request.json()
                rel_path = str(payload.get("path") or "").strip().replace("\\", "/")
                if not rel_path:
                    return web.json_response({"success": False, "error": "empty path"})

                input_dir = folder_paths.get_input_directory()
                comfy_root = os.path.abspath(os.path.join(input_dir, ".."))
                target_path = os.path.abspath(os.path.join(comfy_root, *rel_path.split("/")))

                if not target_path.startswith(comfy_root):
                    return web.json_response({"success": False, "error": "Access denied"})

                if not os.path.exists(target_path):
                    os.makedirs(target_path, exist_ok=True)

                system = platform.system()
                if system == "Windows":
                    subprocess.Popen(f'explorer /n,"{os.path.normpath(target_path)}"', shell=True)
                elif system == "Darwin":
                    subprocess.Popen(["open", target_path])
                else:
                    subprocess.Popen(["xdg-open", target_path])

                return web.json_response({"success": True})
            except Exception as exc:
                return web.json_response({"success": False, "error": str(exc)}, status=500)

    @routes.get("/hud/img/{name}")
    async def get_image(request):
        name = request.match_info["name"]
        path = os.path.join(os.path.dirname(__file__), "img", name)
        if os.path.exists(path):
            return web.FileResponse(path)
        return web.Response(status=404)

    @routes.post("/hud/next-number")
    async def get_next_number(request):
        try:
            import re

            payload = await request.json()
            path = str(payload.get("path") or "").strip().replace("\\", "/")
            prefix = str(payload.get("prefix") or "").strip() + "_"

            output_dir = folder_paths.get_output_directory()
            full_path = os.path.abspath(os.path.join(output_dir, *path.split("/")))
            _debug_log(f"HUD: Found {full_path}")
            if not os.path.exists(full_path):
                return web.json_response({"next_number": 1})

            files = os.listdir(full_path)
            max_num = 0
            matched_count = 0
            pattern = re.compile(rf"^{re.escape(prefix)}[^\d]*(\d+)")

            _debug_log(f"HUD: Checking next number for prefix '{prefix}' in '{full_path}'")
            for file_name in files:
                _debug_log(f"  - Matched: {file_name}")
                if not file_name.startswith(prefix):
                    continue
                match = pattern.search(file_name)
                if not match:
                    continue
                try:
                    number = int(match.group(1))
                except ValueError:
                    continue
                matched_count += 1
                _debug_log(f"  - Matched: {file_name} (Extracted: {number})")
                if number > max_num:
                    max_num = number

            _debug_log(f"HUD: Found {matched_count} matching files. Max number found: {max_num}. Next: {max_num + 1}")
            return web.json_response({"next_number": max_num + 1})
        except Exception as exc:
            return web.json_response({"error": str(exc)}, status=500)

    STYLISH_NAMING_ROUTES_REGISTERED = True


_register_stylish_naming_routes()


class ComfyUI_HUD_StylishNaming:
    DESCRIPTION = (
        "A stylish naming node for managing formatted string inputs."
    )

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {},
            "hidden": {
                "unique_id": "UNIQUE_ID",
            },
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("string",)
    FUNCTION = "process"
    CATEGORY = "HUD/Text"
    TITLE = "Stylish Naming"

    @classmethod
    def IS_CHANGED(cls, unique_id=None, **kwargs):
        _register_stylish_naming_routes()
        return STYLISH_NAMING_RESULTS.get(str(unique_id or ""), "")

    def process(self, unique_id=None, **kwargs):
        _register_stylish_naming_routes()
        node_id = str(unique_id or "")
        return (STYLISH_NAMING_RESULTS.get(node_id, ""),)
