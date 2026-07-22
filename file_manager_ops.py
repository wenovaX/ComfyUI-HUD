import json
import os
import platform
import shutil
import subprocess
import sys


def list_directory_items(target_path):
    items = []
    for entry in os.scandir(target_path):
        if entry.name.startswith("."):
            continue
        try:
            stat = entry.stat()
            is_dir = entry.is_dir()
            item = {
                "name": entry.name,
                "type": "dir" if is_dir else "file",
                "mtime": stat.st_mtime,
                "size": stat.st_size,
            }
            if not is_dir:
                lower_name = entry.name.lower()
                item["is_image"] = lower_name.endswith((".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp"))
                item["is_video"] = lower_name.endswith((".mp4", ".webm", ".mov", ".m4v"))
            items.append(item)
        except Exception:
            continue

    items.sort(key=lambda value: (value["type"] != "dir", -value["mtime"]))
    return items


def launch_directory_picker():
    py_exe = sys.executable
    initial_dir_json = json.dumps(os.path.expanduser("~"))
    script = (
        "import tkinter as tk; "
        "from tkinter import filedialog; "
        "root=tk.Tk(); root.withdraw(); root.attributes('-topmost', True); "
        f"print(filedialog.askdirectory(initialdir={initial_dir_json}))"
    )

    process = subprocess.Popen([py_exe, "-c", script], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    try:
        stdout, stderr = process.communicate(timeout=60)
    except subprocess.TimeoutExpired:
        process.kill()
        return {"success": False, "error": "Picker timed out"}

    if process.returncode != 0:
        return {"success": False, "error": f"Picker failed: {stderr}"}

    path = stdout.strip()
    if not path:
        return {"success": False, "error": "Cancelled"}
    return {"success": True, "path": path}


def unique_destination_path(target_dir, filename):
    base, ext = os.path.splitext(filename)
    destination = os.path.join(target_dir, filename)
    counter = 1
    while os.path.exists(destination):
        destination = os.path.join(target_dir, f"{base}_{counter}{ext}")
        counter += 1
    return destination


def perform_file_action(action, target, data, resolve_hud_path):
    if action == "delete":
        if os.path.isdir(target):
            shutil.rmtree(target)
        else:
            os.remove(target)
        return {"success": True}

    if action == "rename":
        new_name = data.get("new_name")
        if not new_name:
            return {"success": False, "error": "New name required"}
        os.rename(target, os.path.join(os.path.dirname(target), new_name))
        return {"success": True}

    if action in {"create_folder", "mkdir"}:
        folder_name = data.get("name")
        if not folder_name:
            return {"success": False, "error": "Folder name required"}
        os.makedirs(os.path.join(target, folder_name), exist_ok=True)
        return {"success": True}

    if action in {"copy", "move"}:
        sources = data.get("sources", [])
        if not sources:
            return {"success": False, "error": "Sources required"}

        copied_items = []
        for source_path in sources:
            source_abs = resolve_hud_path(source_path)
            if not source_abs:
                continue
            destination = unique_destination_path(target, os.path.basename(source_abs))
            if action == "copy":
                if os.path.isdir(source_abs):
                    shutil.copytree(source_abs, destination)
                else:
                    shutil.copy2(source_abs, destination)
            else:
                shutil.move(source_abs, destination)
            copied_items.append({
                "source": source_path,
                "source_abs": source_abs,
                "dest_abs": destination,
                "dest_name": os.path.basename(destination),
                "dest_is_dir": os.path.isdir(destination),
            })
        return {"success": True, "items": copied_items}

    if action == "open_os":
        path_to_open = target if os.path.isdir(target) else os.path.dirname(target)
        if platform.system() == "Windows":
            os.startfile(path_to_open)
        elif platform.system() == "Darwin":
            subprocess.run(["open", path_to_open])
        else:
            subprocess.run(["xdg-open", path_to_open])
        return {"success": True}

    return {"success": False, "error": f"Unknown action: {action}"}


async def save_uploaded_files(reader, resolve_hud_path):
    target_path = None
    saved_files = []

    while True:
        part = await reader.next()
        if part is None:
            break

        if part.name == "path":
            raw_path = (await part.text()).strip()
            target_path = resolve_hud_path(raw_path)
            if not target_path:
                return {"success": False, "error": "Unauthorized path", "status": 403}
            continue

        if part.name != "files":
            continue

        if not target_path:
            return {"success": False, "error": "Missing target path", "status": 400}

        filename = os.path.basename(part.filename or "").strip()
        if not filename:
            continue

        destination = unique_destination_path(target_path, filename)
        with open(destination, "wb") as file:
            while True:
                chunk = await part.read_chunk(1024 * 1024)
                if not chunk:
                    break
                file.write(chunk)

        saved_files.append(os.path.basename(destination))

    return {"success": True, "files": saved_files, "status": 200}
