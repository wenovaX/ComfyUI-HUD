import os

from aiohttp import web
from server import PromptServer

from .file_manager_bookmarks import (
    get_bookmarks,
    get_hidden_bookmarks,
    save_bookmarks,
    save_hidden_bookmarks,
)
from .file_manager_ops import (
    launch_directory_picker,
    list_directory_items,
    perform_file_action,
    save_uploaded_files,
)
from .file_manager_paths import resolve_hud_path, to_hud_bookmark_path


routes = PromptServer.instance.routes


@routes.get("/hud/file-manager/list")
async def list_hud_files(request):
    path_query = request.rel_url.query.get("path", "")
    target_path = resolve_hud_path(path_query)

    if not target_path or not os.path.exists(target_path):
        return web.json_response({"error": f"Access denied or path not found: {path_query}", "path": path_query}, status=403)

    try:
        return web.json_response({"items": list_directory_items(target_path)})
    except Exception as exc:
        return web.json_response({"error": str(exc)}, status=500)


@routes.get("/hud/file-manager/bookmarks")
async def get_hud_bookmarks(request):
    return web.json_response(get_bookmarks())


@routes.post("/hud/file-manager/bookmarks")
async def add_hud_bookmark(request):
    try:
        data = await request.json()
        path = data.get("path", "").strip()
        if not path:
            return web.json_response({"success": False, "error": "Path required"})

        normalized = to_hud_bookmark_path(path)
        bookmarks = get_bookmarks()
        if normalized not in bookmarks:
            bookmarks.append(normalized)
            save_bookmarks(bookmarks)
        return web.json_response({"success": True, "path": normalized})
    except Exception as exc:
        return web.json_response({"success": False, "error": str(exc)})


@routes.delete("/hud/file-manager/bookmarks")
async def remove_hud_bookmark(request):
    try:
        data = await request.json()
        path = data.get("path")
        bookmarks = get_bookmarks()
        if path in bookmarks:
            bookmarks.remove(path)
            save_bookmarks(bookmarks)
        return web.json_response({"success": True})
    except Exception as exc:
        return web.json_response({"success": False, "error": str(exc)})


@routes.post("/hud/file-manager/bookmarks/hidden")
async def add_hidden_hud_bookmark(request):
    try:
        data = await request.json()
        path = data.get("path", "").strip()
        if not path:
            return web.json_response({"success": False, "error": "Path required"})

        normalized = os.path.normpath(os.path.abspath(path))
        if not os.path.exists(normalized):
            os.makedirs(normalized, exist_ok=True)

        bookmarks = get_hidden_bookmarks()
        if normalized not in bookmarks:
            bookmarks.append(normalized)
            save_hidden_bookmarks(bookmarks)
        return web.json_response({"success": True, "path": normalized})
    except Exception as exc:
        return web.json_response({"success": False, "error": str(exc)})


@routes.post("/hud/file-manager/picker")
async def pick_hud_directory(request):
    result = launch_directory_picker()
    status = 200 if result.get("success") else 500
    if result.get("error") == "Cancelled":
        status = 200
    return web.json_response(result, status=status)


@routes.post("/hud/file-manager/action")
async def hud_file_action(request):
    try:
        data = await request.json()
        action = data.get("action")
        path = data.get("path")

        target = resolve_hud_path(path)
        if not target:
            return web.json_response({"success": False, "error": "Unauthorized path"})

        result = perform_file_action(action, target, data, resolve_hud_path)
        status = 200 if result.get("success") else 500
        return web.json_response(result, status=status)
    except Exception as exc:
        return web.json_response({"success": False, "error": str(exc)}, status=500)


@routes.post("/hud/file-manager/upload")
async def hud_file_upload(request):
    try:
        reader = await request.multipart()
        result = await save_uploaded_files(reader, resolve_hud_path)
        status = result.pop("status", 200)
        return web.json_response(result, status=status)
    except Exception as exc:
        return web.json_response({"success": False, "error": str(exc)}, status=500)


@routes.get("/hud/view")
async def hud_view_file(request):
    filename = request.rel_url.query.get("filename")
    subfolder = request.rel_url.query.get("subfolder", "")
    if not filename:
        return web.Response(status=400)

    full_path = resolve_hud_path(os.path.join(subfolder, filename))
    if not full_path or not os.path.exists(full_path):
        return web.Response(status=403)
    return web.FileResponse(full_path)
