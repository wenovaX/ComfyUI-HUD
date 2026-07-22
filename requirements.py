import sys
import subprocess
import importlib.util
import os

def log(message, node_name=None, level="info"):
    # Terminal ANSI Colors: \033[94m (Blue), \033[93m (Yellow), \033[91m (Red), \033[0m (Reset)
    color = "\033[93m" if level == "info" else "\033[91m"
    tag = f"[{color}{node_name}\033[0m]" if node_name else ""
    prefix = f"\033[94m[ComfyUI_HUD]\033[0m{tag}"
    print(f"{prefix} {message}")
    
    # Send to Frontend
    try:
        from server import PromptServer
        if PromptServer.instance:
            PromptServer.instance.send_sync("comfyui_hud_log", {
                "message": str(message), 
                "node": str(node_name) if node_name else "System",
                "level": level
            })
    except:
        pass

def install_package(package):
    log(f"Installing missing dependency: {package}")
    try:
        # Using --prefer-binary for faster and more stable installation
        subprocess.check_call([sys.executable, "-m", "pip", "install", "--prefer-binary", package])
    except Exception as e:
        log(f"Failed to install {package}: {e}")

def ensure_dependencies():
    # Mapping of { "import_module_name": "pip_package_name" }
    dependencies = {
        "insightface": "insightface",
        "onnxruntime": "onnxruntime-gpu",
        "cv2": "opencv-python",
        "numpy": "numpy",
        "PIL": "Pillow",
        "ultralytics": "ultralytics",
        "aiohttp": "aiohttp"
    }

    for import_name, pip_name in dependencies.items():
        if importlib.util.find_spec(import_name) is None:
            # Special case for onnxruntime: if gpu version fails or env is cpu, fallback could be added
            # but for now we try the gpu version as requested for high performance.
            install_package(pip_name)
    
    log("All dependencies checked.")

def is_node_installed(node_class_name):
    try:
        from nodes import NODE_CLASS_MAPPINGS
        return node_class_name in NODE_CLASS_MAPPINGS
    except:
        return False
