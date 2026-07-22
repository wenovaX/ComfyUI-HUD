import json
import os


USER_DATA_DIR = os.path.join(os.path.dirname(__file__), "user_data")
BOOKMARKS_FILE = os.path.join(USER_DATA_DIR, "bookmarks.json")
HIDDEN_BOOKMARKS_FILE = os.path.join(USER_DATA_DIR, "bookmarks_hidden.json")

_BOOKMARKS_CACHE = None
_BOOKMARKS_CACHE_MTIME = None
_HIDDEN_BOOKMARKS_CACHE = None
_HIDDEN_BOOKMARKS_CACHE_MTIME = None


def _load_cached_list(path, cache_name, mtime_name):
    global _BOOKMARKS_CACHE, _BOOKMARKS_CACHE_MTIME
    global _HIDDEN_BOOKMARKS_CACHE, _HIDDEN_BOOKMARKS_CACHE_MTIME

    cache_value = globals()[cache_name]
    cache_mtime = globals()[mtime_name]

    if not os.path.exists(path):
        globals()[cache_name] = []
        globals()[mtime_name] = None
        return []

    try:
        mtime = os.path.getmtime(path)
        if cache_value is not None and cache_mtime == mtime:
            return list(cache_value)

        with open(path, "r", encoding="utf-8") as file:
            loaded = json.load(file)
        if not isinstance(loaded, list):
            loaded = []

        globals()[cache_name] = loaded
        globals()[mtime_name] = mtime
        return list(loaded)
    except Exception:
        return []


def _save_cached_list(path, values, cache_name, mtime_name):
    os.makedirs(USER_DATA_DIR, exist_ok=True)
    with open(path, "w", encoding="utf-8") as file:
        json.dump(values, file, indent=4)

    try:
        globals()[cache_name] = list(values)
        globals()[mtime_name] = os.path.getmtime(path)
    except Exception:
        globals()[cache_name] = None
        globals()[mtime_name] = None


def get_bookmarks():
    return _load_cached_list(BOOKMARKS_FILE, "_BOOKMARKS_CACHE", "_BOOKMARKS_CACHE_MTIME")


def save_bookmarks(bookmarks):
    _save_cached_list(BOOKMARKS_FILE, bookmarks, "_BOOKMARKS_CACHE", "_BOOKMARKS_CACHE_MTIME")


def get_hidden_bookmarks():
    return _load_cached_list(HIDDEN_BOOKMARKS_FILE, "_HIDDEN_BOOKMARKS_CACHE", "_HIDDEN_BOOKMARKS_CACHE_MTIME")


def save_hidden_bookmarks(bookmarks):
    _save_cached_list(HIDDEN_BOOKMARKS_FILE, bookmarks, "_HIDDEN_BOOKMARKS_CACHE", "_HIDDEN_BOOKMARKS_CACHE_MTIME")
