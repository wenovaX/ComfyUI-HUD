import os
import sys
import torch
import re
import importlib.util
import folder_paths
import comfy.utils
import comfy.model_management as model_management
from comfy.sd import load_lora_for_models
from comfy.clip_vision import load as load_clip_vision
from .requirements import log as custom_utility_log

# === IPAdapter Plus Utility Loader ===
# We use importlib to safely load the utilities from the ComfyUI_IPAdapter_plus node 
# without risking namespace conflicts with other 'utils' modules.
IPADAPTER_PLUS_PATH = os.path.join(folder_paths.get_folder_paths("custom_nodes")[0], "ComfyUI_IPAdapter_plus")
UTILS_PATH = os.path.join(IPADAPTER_PLUS_PATH, "utils.py")

ipadapter_model_loader = None
insightface_loader = None
get_clipvision_file = None
get_lora_file = None

if os.path.exists(UTILS_PATH):
    try:
        spec = importlib.util.spec_from_file_location("ipadapter_plus_utils", UTILS_PATH)
        ip_utils = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(ip_utils)
        
        ipadapter_model_loader = ip_utils.ipadapter_model_loader
        insightface_loader = ip_utils.insightface_loader
        get_clipvision_file = ip_utils.get_clipvision_file
        get_lora_file = ip_utils.get_lora_file
        custom_utility_log("Successfully integrated with IPAdapter-Plus utilities.", "IPAdapter Loader")
    except Exception as e:
        custom_utility_log(f"Failed to load IPAdapter-Plus utilities: {e}", "IPAdapter Loader")

# Fallback in case of failure
if not get_clipvision_file:
    def get_clipvision_file(preset): return None
    def get_lora_file(pattern): return None
    def ipadapter_model_loader(path): return None
    def insightface_loader(provider, model_name): return None

class ComfyUI_HUD_IPAdapterFaceIDLoader:
    DESCRIPTION = (
        "An all-in-one loader for IPAdapter FaceID workflows. Automatically resolves "
        "appropriate CLIP Vision and FaceID LoRAs based on the selected preset."
    )
    TITLE = "IPAdapter FaceID Loader"

    def __init__(self):
        self.lora = None
        self.clipvision = { "file": None, "model": None }
        self.ipadapter = { "file": None, "model": None }
        self.pipe_insightface = { "provider": None, "model": None, "model_name": None }
        self.out_insightface = { "provider": None, "model": None, "model_name": None }

    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "image": ("IMAGE", {"tooltip": "The face image to use as reference."}),
                "model": ("MODEL", {"tooltip": "The main model (SD1.5 or SDXL) to apply IPAdapter to."}),
                "preset": (folder_paths.get_filename_list("ipadapter"), {"tooltip": "Select the IPAdapter FaceID model file."}),
                "lora_strength": ("FLOAT", {"default": 0.6, "min": 0, "max": 1, "step": 0.01, "tooltip": "Strength for the auto-loaded FaceID LoRA."}),
                "provider": (["CUDA", "CPU", "ROCM", "DirectML", "OpenVINO", "CoreML"], {"tooltip": "Execution provider for IPAdapter models."}),
                "clip_vision_file": (["Auto"] + folder_paths.get_filename_list("clip_vision"), {"tooltip": "Select the CLIP Vision model. 'Auto' will try to match the preset."}),
                "insightface_provider": (["CUDA", "CPU", "ROCM", "DirectML", "OpenVINO", "CoreML"], {"tooltip": "Execution provider for the InsightFace model."}),
                "insightface_model": (["buffalo_l", "antelopev2"], {"tooltip": "Select the InsightFace model name."}),
            },
            "optional": {
                "debug_mode": ("BOOLEAN", {"default": False, "tooltip": "When enabled, prints detailed model loading info to the console."}),
            }
        }

    RETURN_TYPES = ("MODEL", "IPADAPTER", "IMAGE", "CLIP_VISION", "INSIGHTFACE")
    RETURN_NAMES = ("model", "ipadapter", "image", "clip_vision", "insightface")
    OUTPUT_TOOLTIPS = (
        "Modified MODEL with IPAdapter FaceID applied.",
        "The loaded IPAdapter model object.",
        "The input image (relayed).",
        "The loaded CLIP Vision model object.",
        "The loaded InsightFace model object."
    )
    FUNCTION = "load_all"
    CATEGORY = "HUD/IPAdapter"

    def load_all(self, image, model, preset, lora_strength, provider, clip_vision_file, insightface_provider, insightface_model, debug_mode=False):
        file_lower = preset.lower()
        is_sdxl = "sdxl" in file_lower
        is_faceid = "faceid" in file_lower
        is_plus = "plus" in file_lower
        is_portrait = "portrait" in file_lower
        
        # 1. CLIP Vision Resolve
        cv_full_path = None
        if clip_vision_file == "Auto":
            cv_preset = "STANDARD"
            if "vit-g" in file_lower or (is_sdxl and not is_faceid):
                cv_preset = "VIT-G"
            elif is_faceid:
                if "plusv2" in file_lower: cv_preset = "FACEID PLUS V2"
                elif "plus" in file_lower: cv_preset = "FACEID PLUS - SD1.5 only"
                elif is_portrait: cv_preset = "FACEID PORTRAIT (style transfer)"
                else: cv_preset = "FACEID"
            cv_full_path = get_clipvision_file(cv_preset)
        else:
            cv_full_path = folder_paths.get_full_path("clip_vision", clip_vision_file)

        if not cv_full_path:
             raise Exception(f"[ComfyUI_HUD] Could not find CLIP Vision for preset: {preset}. Please select one manually.")

        if cv_full_path != self.clipvision['file']:
            self.clipvision['file'] = cv_full_path
            self.clipvision['model'] = load_clip_vision(cv_full_path)
            if debug_mode: custom_utility_log(f"CLIP Vision loaded: {os.path.basename(cv_full_path)}", "IPAdapter Loader")

        # 2. IPAdapter Model Resolve
        full_ip_path = folder_paths.get_full_path("ipadapter", preset)
        if full_ip_path != self.ipadapter['file']:
            self.ipadapter['file'] = full_ip_path
            self.ipadapter['model'] = ipadapter_model_loader(full_ip_path)
            if debug_mode: custom_utility_log(f"IPAdapter loaded: {preset}", "IPAdapter Loader")
        
        if not self.ipadapter['model']:
            raise Exception(f"[ComfyUI_HUD] Failed to load IPAdapter model: {preset}")

        # 3. LoRA Auto-Apply
        if is_faceid:
            lora_pattern = None
            if "plusv2" in file_lower:
                lora_pattern = "faceid.plusv2.sdxl.lora" if is_sdxl else "faceid.plusv2.sd15.lora"
            elif "plus" in file_lower:
                lora_pattern = "faceid.plus.sd15.lora"
            elif not is_portrait:
                lora_pattern = "faceid.sdxl.lora" if is_sdxl else "faceid.sd15.lora"

            if lora_pattern:
                lora_path = get_lora_file(lora_pattern)
                if lora_path:
                    lora_model = comfy.utils.load_torch_file(lora_path, safe_load=True)
                    model, _ = load_lora_for_models(model, None, lora_model, lora_strength, 0)
                    if debug_mode: custom_utility_log(f"Applied FaceID LoRA: {os.path.basename(lora_path)}", "IPAdapter Loader")

        # 4. InsightFace Resolve
        if is_faceid or is_portrait:
            if provider != self.pipe_insightface['provider']:
                self.pipe_insightface['provider'] = provider
                self.pipe_insightface['model'] = insightface_loader(provider, model_name="buffalo_l")
                if debug_mode: custom_utility_log(f"Pipeline InsightFace loaded with {provider}", "IPAdapter Loader")

        if insightface_provider != self.out_insightface['provider'] or insightface_model != self.out_insightface['model_name']:
            self.out_insightface['provider'] = insightface_provider
            self.out_insightface['model_name'] = insightface_model
            self.out_insightface['model'] = insightface_loader(insightface_provider, model_name=insightface_model)
            if debug_mode: custom_utility_log(f"Output InsightFace '{insightface_model}' loaded with {insightface_provider}", "IPAdapter Loader")

        # Standard Return Format: (MODEL, IPADAPTER, IMAGE, CLIP_VISION, INSIGHTFACE)
        return (model, self.ipadapter['model'], image, self.clipvision['model'], self.out_insightface['model'])
