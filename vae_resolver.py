import os
import comfy.sd
import comfy.utils
import folder_paths
from .requirements import log

class ComfyUI_HUD_VAEResolver:
    CHECKPOINT_OPTION = "Use checkpoint VAE"
    DESCRIPTION = (
        "Resolves which VAE to use for the current flow: either the checkpoint-embedded VAE "
        "or an external VAE file from models/vae. CLIP is relayed unchanged."
    )
    TITLE = "VAE Resolver"

    @classmethod
    def _vae_choices(cls):
        return [cls.CHECKPOINT_OPTION, *folder_paths.get_filename_list("vae")]

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "vae_name": (cls._vae_choices(), {
                    "default": cls.CHECKPOINT_OPTION,
                    "tooltip": "Select checkpoint VAE passthrough or an external VAE file from models/vae.",
                }),
                "debug_log": ("BOOLEAN", {
                    "default": False,
                    "tooltip": "When enabled, prints resolver decisions to the server console.",
                }),
                "clip": ("CLIP", {
                    "tooltip": "CLIP passthrough input. This node relays it unchanged.",
                }),
                "default_vae": ("VAE", {
                    "tooltip": "Incoming checkpoint VAE passthrough input.",
                }),
            }
        }

    RETURN_TYPES = ("CLIP", "VAE")
    RETURN_NAMES = ("clip", "vae")
    OUTPUT_TOOLTIPS = (
        "CLIP passthrough output (unchanged from input).",
        "Resolved VAE output (checkpoint or selected external file).",
    )
    FUNCTION = "resolve"
    CATEGORY = "HUD/Loaders"

    @classmethod
    def IS_CHANGED(cls, vae_name, debug_log, clip, default_vae):
        return float("nan")

    def _get_vae_name(self, vae):
        candidates = [
            "filename",
            "file",
            "name",
            "model_name",
            "ckpt_path",
            "model_path",
            "vae_path",
            "path",
        ]

        for attr in candidates:
            value = getattr(vae, attr, None)
            if isinstance(value, str) and value:
                return os.path.basename(value)

        fsm = getattr(vae, "first_stage_model", None)
        if fsm:
            for attr in candidates:
                value = getattr(fsm, attr, None)
                if isinstance(value, str) and value:
                    return os.path.basename(value)

        return None

    def _log(self, enabled, message):
        if enabled:
            log(message, "VAE Resolver")

    def _load_external_vae(self, vae_name):
        vae_path = folder_paths.get_full_path_or_raise("vae", vae_name)
        sd, metadata = comfy.utils.load_torch_file(vae_path, return_metadata=True)
        vae = comfy.sd.VAE(sd=sd, metadata=metadata)
        vae.throw_exception_if_invalid()
        return vae

    def resolve(self, vae_name, debug_log, clip, default_vae):
        if vae_name == self.CHECKPOINT_OPTION:
            name = self._get_vae_name(default_vae)
            if name:
                self._log(debug_log, f"using CHECKPOINT VAE: {name}")
            else:
                self._log(debug_log, "using CHECKPOINT VAE")
            return (clip, default_vae)

        resolved = self._load_external_vae(vae_name)
        self._log(debug_log, f"using EXTERNAL VAE: {vae_name}")
        return (clip, resolved)
