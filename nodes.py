import importlib


def _import_or_none(module_name):
    try:
        return importlib.import_module(module_name, __package__)
    except Exception as exc:
        print(f"[ComfyUI-HUD] Failed to import {module_name}: {exc}")
        return None


NODE_SPECS = [
    {
        "module_name": ".checkpoint_preview",
        "class_name": "ComfyUI_HUD_CheckpointLoaderPreview",
        "display_name": "Load Checkpoint (Preview)",
    },
    {
        "module_name": ".vae_resolver",
        "class_name": "ComfyUI_HUD_VAEResolver",
        "display_name": "VAE Resolver",
    },
    {
        "module_name": ".string_combiner_node",
        "class_name": "ComfyUI_HUD_StringCombiner",
        "display_name": "String Combiner",
    },
    {
        "module_name": ".string_encode_combiner_node",
        "class_name": "ComfyUI_HUD_StringEncodeCombiner",
        "display_name": "String Encode Combiner",
    },
    {
        "module_name": ".prompt_pair_nodes",
        "class_name": "ComfyUI_HUD_PromptPairEncode",
        "display_name": "Prompt Pair Encode",
    },
    {
        "module_name": ".prompt_pair_nodes",
        "class_name": "ComfyUI_HUD_PromptPairRelay",
        "display_name": "Prompt Pair Relay",
    },
    {
        "module_name": ".batch_images",
        "class_name": "ComfyUI_HUD_BatchImagesMaskEditor",
        "display_name": "Batch Images (Mask Editor)",
    },
    {
        "module_name": ".stylish_naming_node",
        "class_name": "ComfyUI_HUD_StylishNaming",
        "display_name": "Stylish Naming",
    },
    {
        "module_name": ".gpu_monitor_node",
        "class_name": "ComfyUI_HUD_GPUMonitor",
        "display_name": "GPU Monitor",
    },
    {
        "module_name": ".log_monitor_node",
        "class_name": "ComfyUI_HUD_LogMonitor",
        "display_name": "Log Monitor",
    },
    {
        "module_name": ".ipadapter_nodes",
        "class_name": "ComfyUI_HUD_IPAdapterFaceIDLoader",
        "display_name": "IPAdapter FaceID Loader",
    },
    {
        "module_name": ".controlnet_nodes",
        "class_name": "ComfyUI_HUD_OpenPoseControlNet",
        "display_name": "OpenPose ControlNet Master",
    },
]


for side_effect_module in (".file_manager_nodes",):
    _import_or_none(side_effect_module)


module_cache = {}
NODE_CLASS_MAPPINGS = {}
NODE_DISPLAY_NAME_MAPPINGS = {}

for spec in NODE_SPECS:
    module_name = spec["module_name"]
    module = module_cache.get(module_name)
    if module is None:
        module = _import_or_none(module_name)
        module_cache[module_name] = module
    if module is None:
        continue

    node_class = getattr(module, spec["class_name"], None)
    if node_class is None:
        continue

    NODE_CLASS_MAPPINGS[spec["class_name"]] = node_class
    NODE_DISPLAY_NAME_MAPPINGS[spec["class_name"]] = spec["display_name"]
