import os

import folder_paths

from .file_manager_bookmarks import get_bookmarks, get_hidden_bookmarks


def normalize_windows_drive(path):
    if os.name == "nt" and len(path) == 2 and path[1] == ":":
        return path + os.path.sep
    return path


def is_subpath(child, parent):
    try:
        normalized_parent = os.path.normcase(os.path.abspath(normalize_windows_drive(parent)))
        normalized_child = os.path.normcase(os.path.abspath(normalize_windows_drive(child)))
        if normalized_parent == normalized_child:
            return True
        if not normalized_parent.endswith(os.path.sep):
            normalized_parent += os.path.sep
        return normalized_child.startswith(normalized_parent)
    except Exception:
        return False


def resolve_root_alias_path(path_param):
    output_root = os.path.normcase(os.path.abspath(folder_paths.get_output_directory()))
    input_root = os.path.normcase(os.path.abspath(folder_paths.get_input_directory()))

    if path_param == "input":
        return input_root
    if path_param.startswith("input/"):
        return os.path.abspath(os.path.join(folder_paths.get_input_directory(), path_param[6:]))
    if path_param == "output":
        return output_root
    if path_param.startswith("output/"):
        return os.path.abspath(os.path.join(folder_paths.get_output_directory(), path_param[7:]))
    if os.path.isabs(path_param) or (os.name == "nt" and len(path_param) >= 2 and path_param[1] == ":"):
        return os.path.abspath(path_param)
    return os.path.abspath(os.path.join(folder_paths.get_output_directory(), path_param))


def to_hud_bookmark_path(path):
    normalized_path = os.path.normpath(os.path.abspath(path))
    output_root = os.path.normpath(os.path.abspath(folder_paths.get_output_directory()))
    input_root = os.path.normpath(os.path.abspath(folder_paths.get_input_directory()))

    if is_subpath(normalized_path, input_root):
        relative = os.path.relpath(normalized_path, input_root).replace("\\", "/")
        return "input" if relative == "." else f"input/{relative}"
    if is_subpath(normalized_path, output_root):
        relative = os.path.relpath(normalized_path, output_root).replace("\\", "/")
        return "output" if relative == "." else f"output/{relative}"
    return normalized_path


def resolve_bookmark_target(path):
    if path == "input" or path.startswith("input/"):
        return os.path.abspath(os.path.join(folder_paths.get_input_directory(), path[6:])) if path.startswith("input/") else os.path.abspath(folder_paths.get_input_directory())
    if path == "output" or path.startswith("output/"):
        return os.path.abspath(os.path.join(folder_paths.get_output_directory(), path[7:])) if path.startswith("output/") else os.path.abspath(folder_paths.get_output_directory())
    return os.path.abspath(path)


def resolve_hud_path(path_param):
    output_root = os.path.normcase(os.path.abspath(folder_paths.get_output_directory()))
    input_root = os.path.normcase(os.path.abspath(folder_paths.get_input_directory()))
    checkpoint_roots = [
        os.path.normcase(os.path.abspath(path))
        for path in folder_paths.folder_names_and_paths.get("checkpoints", ([], set()))[0]
    ]

    if not path_param:
        return folder_paths.get_output_directory()

    normalized_param = path_param.replace("\\", "/")
    target_abs = resolve_root_alias_path(normalized_param)
    normalized_target = os.path.normcase(target_abs)

    if is_subpath(normalized_target, output_root) or is_subpath(normalized_target, input_root):
        if os.path.exists(target_abs):
            return target_abs

    for checkpoint_root in checkpoint_roots:
        if is_subpath(normalized_target, checkpoint_root) and os.path.exists(target_abs):
            return target_abs

    for bookmark in get_bookmarks() + get_hidden_bookmarks():
        bookmark_abs = resolve_bookmark_target(bookmark)
        if is_subpath(normalized_target, os.path.normcase(bookmark_abs)) and os.path.exists(target_abs):
            return target_abs

    print(f"[HUD DEBUG] Access denied for: {normalized_param} (Resolved to: {target_abs})")
    return None
