from .string_node_common import get_node_props, parse_sections, decode_separator, join_sections


class ComfyUI_HUD_StringCombiner:
    DESCRIPTION = (
        "Section-based text combiner. Merges stored sections with optional text_in using the configured separator."
    )
    TITLE = "String Combiner"

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {},
            "optional": {
                "text_in": ("STRING", {"forceInput": True, "tooltip": "Optional upstream text input."}),
            },
            "hidden": {
                "sections_json": ("STRING", {"default": ""}),
                "separator": ("STRING", {"default": ",\\n"}),
                "update_trigger": ("STRING", {"default": ""}),
                "unique_id": "UNIQUE_ID",
                "extra_pnginfo": "EXTRA_PNGINFO",
            },
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("text",)
    FUNCTION = "combine"
    CATEGORY = "HUD/Text"

    def combine(
        self,
        text_in="",
        sections_json="",
        separator="",
        unique_id=None,
        extra_pnginfo=None,
        **kwargs,
    ):
        props = get_node_props(unique_id, extra_pnginfo)
        sections = parse_sections(props, "comfyui_hud_sections", sections_json)
        include_titles = bool(props.get("comfyui_hud_include_titles", False))
        sep = decode_separator(props.get("comfyui_hud_separator", separator))

        local_text = join_sections(sections, sep, include_titles)
        incoming_text = str(text_in or "").strip()

        if incoming_text and local_text:
            return (f"{incoming_text}{sep}{local_text}",)
        if local_text:
            return (local_text,)
        return (incoming_text,)
