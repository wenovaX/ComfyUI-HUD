import json


def get_node_props(unique_id=None, extra_pnginfo=None):
    try:
        workflow = (extra_pnginfo or {}).get("workflow") or {}
        for node in workflow.get("nodes", []):
            if str(node.get("id")) == str(unique_id):
                return node.get("properties") or {}
    except Exception:
        pass
    return {}


def parse_sections(props, key, fallback_raw=None):
    raw = props.get(key)
    if raw is None and fallback_raw not in (None, ""):
        try:
            raw = json.loads(fallback_raw) if isinstance(fallback_raw, str) else fallback_raw
        except Exception:
            raw = []

    if not isinstance(raw, list):
        return []

    parsed = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        title = str(item.get("title", "") or "").strip()
        value = str(item.get("value", "") or "")
        if not value.strip():
            continue
        parsed.append({"title": title, "value": value})
    return parsed


def decode_separator(value, default=",\\n"):
    sep = str(value if value not in (None, "") else default)
    return sep.replace("\\n", "\n").replace("\\r", "\r").replace("\\t", "\t")


def join_sections(sections, sep, include_titles=False):
    chunks = []
    for section in sections:
        value = str(section.get("value", "") or "")
        if not value.strip():
            continue
        title = str(section.get("title", "") or "").strip()
        if include_titles and title:
            chunks.append(f"[{title}]\n{value}")
        else:
            chunks.append(value)
    return sep.join(chunks)
