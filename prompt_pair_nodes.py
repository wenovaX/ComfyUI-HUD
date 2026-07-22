from aiohttp import web
from server import PromptServer


PROMPT_PAIR_TEXTS = {}
PROMPT_PAIR_ROUTES_REGISTERED = False


def _register_prompt_pair_routes():
    global PROMPT_PAIR_ROUTES_REGISTERED
    if PROMPT_PAIR_ROUTES_REGISTERED or not getattr(PromptServer, "instance", None):
        return

    routes = PromptServer.instance.routes

    @routes.post("/hud/prompt-pair-encode/state")
    async def save_prompt_pair_state(request):
        try:
            payload = await request.json()
            node_id = str(payload.get("node_id") or "").strip()
            if not node_id:
                return web.json_response({"success": False, "error": "empty node_id"}, status=400)

            PROMPT_PAIR_TEXTS[node_id] = {
                "positive": str(payload.get("positive_text") or ""),
                "negative": str(payload.get("negative_text") or ""),
            }
            return web.json_response({"success": True})
        except Exception as exc:
            return web.json_response({"success": False, "error": str(exc)}, status=500)

    PROMPT_PAIR_ROUTES_REGISTERED = True


_register_prompt_pair_routes()


class ComfyUI_HUD_PromptPairEncode:
    DESCRIPTION = (
        "Encodes two prompt panels (Positive and Negative) with one CLIP input and outputs "
        "separate conditioning tensors for each side."
    )
    TITLE = "Prompt Pair Encode"

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "clip": ("CLIP", {
                    "tooltip": "CLIP input used to encode the positive and negative prompt panels.",
                }),
            },
            "hidden": {
                "unique_id": "UNIQUE_ID",
            },
        }

    RETURN_TYPES = ("CONDITIONING", "CONDITIONING", "PROMPT_PAIR")
    RETURN_NAMES = ("positive", "negative", "pair")
    OUTPUT_TOOLTIPS = (
        "Positive conditioning output encoded from the Positive panel text.",
        "Negative conditioning output encoded from the Negative panel text.",
    )
    FUNCTION = "encode_pair"
    CATEGORY = "HUD/Conditioning"

    @classmethod
    def IS_CHANGED(cls, unique_id=None, **kwargs):
        _register_prompt_pair_routes()
        state = PROMPT_PAIR_TEXTS.get(str(unique_id or ""), {})
        return f"{state.get('positive', '')}\0{state.get('negative', '')}"

    def encode_pair(self, clip, unique_id=None, **kwargs):
        _register_prompt_pair_routes()
        if clip is None:
            raise RuntimeError("ERROR: clip input is invalid: None")

        state = PROMPT_PAIR_TEXTS.get(str(unique_id or ""), {})
        positive_text = str(state.get("positive") or "")
        negative_text = str(state.get("negative") or "")
        positive = clip.encode_from_tokens_scheduled(clip.tokenize(positive_text))
        negative = clip.encode_from_tokens_scheduled(clip.tokenize(negative_text))
        return (positive, negative, {"positive": positive, "negative": negative})


class ComfyUI_HUD_PromptPairRelay:
    DESCRIPTION = (
        "Relays Positive/Negative conditioning and packs or unpacks them as a PROMPT_PAIR object. "
        "Pair input takes priority when connected."
    )
    TITLE = "Prompt Pair Relay"

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {},
            "optional": {
                "positive": ("CONDITIONING", {
                    "tooltip": "Optional positive conditioning input. Used directly when no pair input is connected.",
                }),
                "negative": ("CONDITIONING", {
                    "tooltip": "Optional negative conditioning input. Used directly when no pair input is connected.",
                }),
                "pair": ("PROMPT_PAIR", {
                    "tooltip": "Optional prompt-pair relay input. When connected, this node forwards its stored positive and negative conditioning outputs.",
                }),
            },
        }

    RETURN_TYPES = ("CONDITIONING", "CONDITIONING", "PROMPT_PAIR")
    RETURN_NAMES = ("positive", "negative", "pair")
    OUTPUT_TOOLTIPS = (
        "Relayed positive conditioning output.",
        "Relayed negative conditioning output.",
        "Combined PROMPT_PAIR output containing relayed positive and negative values.",
    )
    FUNCTION = "relay_pair"
    CATEGORY = "HUD/Conditioning"

    @staticmethod
    def _resolve_pair(pair):
        if not isinstance(pair, dict):
            raise RuntimeError("Prompt Pair Relay: pair input is invalid.")

        return pair.get("positive"), pair.get("negative")

    def relay_pair(self, positive=None, negative=None, pair=None):
        if pair is not None:
            positive_out, negative_out = self._resolve_pair(pair)
        else:
            positive_out, negative_out = positive, negative

        if positive_out is None and negative_out is None:
            raise RuntimeError(
                "Prompt Pair Relay: connect pair or at least one of positive / negative."
            )

        return (
            positive_out,
            negative_out,
            {
                "positive": positive_out,
                "negative": negative_out,
            },
        )


