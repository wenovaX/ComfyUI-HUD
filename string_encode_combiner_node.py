from .string_node_common import get_node_props, parse_sections, decode_separator, join_sections


class ComfyUI_HUD_StringEncodeCombiner:
    DESCRIPTION = (
        "Combines section text + optional text_in, encodes with CLIP, and optionally merges external conditioning."
    )
    TITLE = "String Encode Combiner"

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "clip": ("CLIP", {"tooltip": "CLIP model used for text encoding."}),
            },
            "optional": {
                "text_in": ("STRING", {"forceInput": True, "tooltip": "Optional upstream text input."}),
                "conditioning_in": ("CONDITIONING", {"tooltip": "Optional external conditioning to merge."}),
            },
            "hidden": {
                "sections_json": ("STRING", {"default": ""}),
                "separator": ("STRING", {"default": ",\\n"}),
                "update_trigger": ("STRING", {"default": ""}),
                "unique_id": "UNIQUE_ID",
                "extra_pnginfo": "EXTRA_PNGINFO",
            },
        }

    RETURN_TYPES = ("CLIP", "STRING", "CONDITIONING")
    RETURN_NAMES = ("clip", "text", "conditioning")
    FUNCTION = "encode"
    CATEGORY = "HUD/Conditioning"

    def encode(
        self,
        clip,
        text_in="",
        conditioning_in=None,
        sections_json="",
        separator="",
        unique_id=None,
        extra_pnginfo=None,
        **kwargs,
    ):
        if clip is None:
            raise RuntimeError("String Encode Combiner: clip input is required.")

        props = get_node_props(unique_id, extra_pnginfo)
        sections = parse_sections(props, "comfyui_hud_encode_sections", sections_json)
        include_titles = bool(props.get("comfyui_hud_encode_include_titles", False))
        sep = decode_separator(props.get("comfyui_hud_encode_separator", separator))

        local_text = join_sections(sections, sep, include_titles)
        incoming_text = str(text_in or "")

        if incoming_text and local_text:
            merged_text = f"{incoming_text}{sep}{local_text}"
        elif local_text:
            merged_text = local_text
        else:
            merged_text = incoming_text

        local_conditioning = clip.encode_from_tokens_scheduled(clip.tokenize(merged_text))

        if conditioning_in is None:
            merged_conditioning = local_conditioning
        elif local_conditioning is None:
            merged_conditioning = conditioning_in
        else:
            merged_conditioning = list(local_conditioning) + list(conditioning_in)

        return (clip, merged_text, merged_conditioning)
