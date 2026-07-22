import folder_paths
import comfy.controlnet

from .requirements import log as hud_log


class ComfyUI_HUD_OpenPoseControlNet:
    DESCRIPTION = (
        "Applies ControlNet (designed for OpenPose) directly to a Prompt Pair. "
        "Allows easy ControlNet injection into dual-conditioning (Positive/Negative) workflows."
    )
    TITLE = "OpenPose ControlNet Master"

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "vae": ("VAE", {"tooltip": "VAE used for internal latent scaling in some ControlNet implementations."}),
                "controlnet_model": (folder_paths.get_filename_list("controlnet"), {"tooltip": "Select the ControlNet model (e.g. openpose)."}),
                "strength": ("FLOAT", {"default": 1.0, "min": 0.0, "max": 10.0, "step": 0.01, "tooltip": "ControlNet influence strength."}),
                "start_percent": ("FLOAT", {"default": 0.0, "min": 0.0, "max": 1.0, "step": 0.001, "tooltip": "Diffusion step to start applying ControlNet (0.0 = start)."}),
                "end_percent": ("FLOAT", {"default": 1.0, "min": 0.0, "max": 1.0, "step": 0.001, "tooltip": "Diffusion step to stop applying ControlNet (1.0 = end)."}),
            },
            "optional": {
                "positive": ("CONDITIONING", {"tooltip": "Optional incoming positive conditioning."}),
                "negative": ("CONDITIONING", {"tooltip": "Optional incoming negative conditioning."}),
                "pair": ("PROMPT_PAIR", {"tooltip": "Optional incoming prompt pair. If connected, it takes priority over separate positive/negative inputs."}),
                "image": ("IMAGE", {"tooltip": "The pose map or reference image to use for ControlNet."}),
                "debug_mode": ("BOOLEAN", {"default": False, "tooltip": "When enabled, prints debug info to the console."}),
            }
        }

    RETURN_TYPES = ("CONDITIONING", "CONDITIONING", "PROMPT_PAIR")
    RETURN_NAMES = ("positive", "negative", "pair")
    OUTPUT_TOOLTIPS = (
        "Positive conditioning with ControlNet applied.",
        "Negative conditioning with ControlNet applied.",
        "Relayed PROMPT_PAIR object with ControlNet applied to both sides."
    )
    FUNCTION = "apply_controlnet"
    CATEGORY = "HUD/ControlNet"

    def apply_controlnet(
        self,
        vae,
        controlnet_model,
        strength,
        start_percent,
        end_percent,
        positive=None,
        negative=None,
        pair=None,
        image=None,
        debug_mode=False,
    ):
        # Prefer the prompt pair input when it is connected.
        if pair is not None:
            if debug_mode:
                hud_log("Using conditioning from input PAIR", "ControlNet Master")
            pos_in = pair.get("positive")
            neg_in = pair.get("negative")
        else:
            pos_in = positive
            neg_in = negative

        if pos_in is None or neg_in is None:
            if debug_mode:
                hud_log("Warning: Missing conditioning inputs. Skipping ControlNet application.", "ControlNet Master")
            return (pos_in, neg_in, pair)

        if debug_mode:
            hud_log(f"Loading ControlNet model: {controlnet_model}", "ControlNet Master")

        controlnet_path = folder_paths.get_full_path("controlnet", controlnet_model)
        controlnet = comfy.controlnet.load_controlnet(controlnet_path)

        # Relay the pair unchanged until an image is connected.
        if image is None:
            if debug_mode:
                hud_log("No image/pose map provided. Relaying conditioning without ControlNet.", "ControlNet Master")
            return (pos_in, neg_in, {"positive": pos_in, "negative": neg_in})

        if debug_mode:
            hud_log(f"Applying ControlNet to Prompt Pair (Strength: {strength})", "ControlNet Master")

        import nodes

        apply_node = nodes.ControlNetApplyAdvanced()
        pos_out, neg_out = apply_node.apply_controlnet(
            positive=pos_in,
            negative=neg_in,
            control_net=controlnet,
            image=image,
            strength=strength,
            start_percent=start_percent,
            end_percent=end_percent,
            vae=vae,
        )

        return (
            pos_out,
            neg_out,
            {
                "positive": pos_out,
                "negative": neg_out,
            },
        )


NODE_CLASS_MAPPINGS = {
    "ComfyUI_HUD_OpenPoseControlNet": ComfyUI_HUD_OpenPoseControlNet
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "ComfyUI_HUD_OpenPoseControlNet": "OpenPose ControlNet Master"
}
