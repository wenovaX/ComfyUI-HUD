import os
import shutil

import folder_paths


SAMPLE_DIR_NAME = "hud_sample"


def _iter_public_user_directories(user_root):
    try:
        entries = [entry for entry in os.scandir(user_root) if entry.is_dir()]
    except OSError:
        entries = []

    public_directories = [
        entry.path
        for entry in entries
        if not entry.name.startswith(getattr(folder_paths, "SYSTEM_USER_PREFIX", "__"))
    ]
    if public_directories:
        return public_directories

    return [os.path.join(user_root, "default")]


def install_sample_workflows():
    source_root = os.path.join(os.path.dirname(__file__), SAMPLE_DIR_NAME)
    if not os.path.isdir(source_root):
        return 0

    user_root = os.path.abspath(folder_paths.get_user_directory())
    copied_count = 0

    for user_directory in _iter_public_user_directories(user_root):
        destination_root = os.path.join(user_directory, "workflows", SAMPLE_DIR_NAME)

        for current_root, _, filenames in os.walk(source_root):
            relative_root = os.path.relpath(current_root, source_root)
            destination_directory = (
                destination_root
                if relative_root == "."
                else os.path.join(destination_root, relative_root)
            )

            for filename in filenames:
                if not filename.lower().endswith(".json"):
                    continue

                source_path = os.path.join(current_root, filename)
                destination_path = os.path.join(destination_directory, filename)
                if os.path.exists(destination_path):
                    continue

                os.makedirs(destination_directory, exist_ok=True)
                shutil.copy2(source_path, destination_path)
                copied_count += 1

    if copied_count:
        print(f"[ComfyUI-HUD] Installed {copied_count} sample workflow file(s).")
    return copied_count
