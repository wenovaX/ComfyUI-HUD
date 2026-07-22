from .requirements import ensure_dependencies
ensure_dependencies()

from .workflow_samples import install_sample_workflows
try:
    install_sample_workflows()
except Exception as exc:
    print(f"[ComfyUI-HUD] Failed to install sample workflows: {exc}")

from .nodes import NODE_CLASS_MAPPINGS, NODE_DISPLAY_NAME_MAPPINGS
WEB_DIRECTORY = "./js"
__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]
