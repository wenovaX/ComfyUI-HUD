import os
import shutil
import hashlib
import uuid
from urllib.parse import quote, unquote

from aiohttp import web
import folder_paths
import comfy.sd
import comfy.utils
from nodes import CheckpointLoaderSimple
from server import PromptServer
from .requirements import log as hud_log


PREVIEW_EXTENSIONS = ("png", "webp", "jpg", "jpeg")
_ROUTES_REGISTERED = False
PREVIEW_NUMBER_PADDING = 3


def _preview_number_name(index, ext):
    normalized_ext = str(ext or "").lstrip(".").lower()
    number = f"{index:0{PREVIEW_NUMBER_PADDING}d}" if index <= 999 else str(index)
    return f"{number}.{normalized_ext}"


def _gallery_sort_key(name, checkpoint_name_no_ext):
    stem, ext = os.path.splitext(name)
    if ext.lstrip(".").lower() not in PREVIEW_EXTENSIONS:
        return (9, 0, name.lower())
    if stem.isdigit():
        try:
            index = int(stem)
            if index > 0:
                return (0, index, name.lower())
        except Exception:
            pass
    if stem.lower() == checkpoint_name_no_ext.lower():
        return (1, 0, name.lower())
    prefix = f"{checkpoint_name_no_ext}."
    if stem.lower().startswith(prefix.lower()):
        suffix = stem[len(prefix):]
        try:
            index = int(suffix)
            if index > 0:
                return (1, index, name.lower())
        except Exception:
            pass
    return (2, 0, name.lower())


def _list_preview_folder_images(preview_folder_abs, preview_folder_rel, checkpoint_name_no_ext):
    if not os.path.isdir(preview_folder_abs):
        return []

    folder_images = []
    names = sorted(os.listdir(preview_folder_abs), key=lambda x: _gallery_sort_key(x, checkpoint_name_no_ext))
    for name in names:
        file_abs = os.path.join(preview_folder_abs, name)
        if not os.path.isfile(file_abs):
            continue
        ext = os.path.splitext(name)[1].lstrip(".").lower()
        if ext not in PREVIEW_EXTENSIONS:
            continue
        rel = f"{preview_folder_rel}/{name}" if preview_folder_rel else name
        folder_images.append({
            "name": name,
            "path": file_abs,
            "rel": rel.replace("\\", "/"),
            "ext": ext,
        })
    return folder_images


def _normalize_preview_folder(preview_folder_abs, checkpoint_name_no_ext):
    if not os.path.isdir(preview_folder_abs):
        return {}

    entries = _list_preview_folder_images(preview_folder_abs, "", checkpoint_name_no_ext)
    mapping = {}
    planned = []
    for index, item in enumerate(entries, start=1):
        target_name = _preview_number_name(index, item["ext"])
        mapping[item["name"]] = target_name
        planned.append((item["path"], item["name"], os.path.join(preview_folder_abs, target_name)))

    if all(os.path.normcase(src) == os.path.normcase(dst) for src, _, dst in planned):
        return mapping

    moved = []
    try:
        for index, (src, original_name, dst) in enumerate(planned):
            temp_name = f".__hud_preview_tmp_{uuid.uuid4().hex}_{index}{os.path.splitext(src)[1].lower()}"
            temp = os.path.join(preview_folder_abs, temp_name)
            os.replace(src, temp)
            moved.append((src, temp, dst))

        for _, temp, dst in moved:
            os.replace(temp, dst)
    except Exception:
        for src, temp, _ in moved:
            try:
                if os.path.isfile(temp) and not os.path.exists(src):
                    os.replace(temp, src)
            except Exception:
                pass
        raise

    return mapping


def _next_preview_index(preview_folder_abs, checkpoint_name_no_ext):
    max_index = 0
    for item in _list_preview_folder_images(preview_folder_abs, "", checkpoint_name_no_ext):
        stem = os.path.splitext(item["name"])[0]
        if stem.isdigit():
            try:
                max_index = max(max_index, int(stem))
            except Exception:
                pass
    return max_index + 1


def _same_file_content(left, right):
    if not left or not right or not os.path.isfile(left) or not os.path.isfile(right):
        return False
    try:
        if os.path.getsize(left) != os.path.getsize(right):
            return False
        left_hash = hashlib.sha256()
        right_hash = hashlib.sha256()
        with open(left, "rb") as left_file:
            for chunk in iter(lambda: left_file.read(1024 * 1024), b""):
                left_hash.update(chunk)
        with open(right, "rb") as right_file:
            for chunk in iter(lambda: right_file.read(1024 * 1024), b""):
                right_hash.update(chunk)
        return left_hash.digest() == right_hash.digest()
    except Exception:
        return False


def _ensure_checkpoint_sign_image(base_abs, folder_images):
    # Keep ComfyUI native thumbnail behavior alive:
    # if no sign image exists beside the checkpoint, copy the first folder image.
    if not folder_images:
        return
    has_sign = any(os.path.isfile(f"{base_abs}.{ext}") for ext in PREVIEW_EXTENSIONS)
    if has_sign:
        return
    first = folder_images[0]
    ext = str(first.get("ext") or "").lower()
    if ext not in PREVIEW_EXTENSIONS:
        return
    target = f"{base_abs}.{ext}"
    try:
        shutil.copy2(first["path"], target)
    except Exception:
        pass


def _sync_checkpoint_sign_image(base_abs, src_abs):
    ext = os.path.splitext(src_abs)[1].lstrip(".").lower()
    if ext not in PREVIEW_EXTENSIONS:
        return
    # Keep a single sign image to avoid extension-priority ambiguity.
    for candidate_ext in PREVIEW_EXTENSIONS:
        candidate_abs = f"{base_abs}.{candidate_ext}"
        try:
            if os.path.isfile(candidate_abs):
                os.remove(candidate_abs)
        except Exception:
            pass
    try:
        shutil.copy2(src_abs, f"{base_abs}.{ext}")
    except Exception:
        pass


def _resolve_checkpoint_sign_image(base_abs):
    for ext in PREVIEW_EXTENSIONS:
        candidate_abs = f"{base_abs}.{ext}"
        if os.path.isfile(candidate_abs):
            return candidate_abs
    return ""


def _resolve_checkpoint_info(ckpt_name):
    ckpt_path = folder_paths.get_full_path("checkpoints", ckpt_name)
    if not ckpt_path or not os.path.isfile(ckpt_path):
        return None

    checkpoint_roots = folder_paths.folder_names_and_paths.get("checkpoints", ([], set()))[0]
    if not checkpoint_roots:
        return None

    ckpt_path_norm = os.path.normcase(os.path.abspath(ckpt_path))
    matched_index = None
    matched_root = None

    for index, root in enumerate(checkpoint_roots):
        root_abs = os.path.normcase(os.path.abspath(root))
        try:
            common = os.path.commonpath([ckpt_path_norm, root_abs])
        except ValueError:
            continue
        if common == root_abs:
            matched_index = index
            matched_root = root
            break

    if matched_index is None or matched_root is None:
        return None

    rel_ckpt = os.path.relpath(ckpt_path, matched_root).replace("\\", "/")
    base_rel, _ = os.path.splitext(rel_ckpt)
    base_abs, _ = os.path.splitext(ckpt_path)
    checkpoint_name_no_ext = os.path.splitext(os.path.basename(ckpt_path))[0]

    return {
        "ckpt_path": ckpt_path,
        "root_index": matched_index,
        "root_path": os.path.abspath(matched_root),
        "base_rel": base_rel,
        "base_abs": base_abs,
        "checkpoint_name_no_ext": checkpoint_name_no_ext,
    }


def _resolve_checkpoint_preview_payload(ckpt_name):
    info = _resolve_checkpoint_info(ckpt_name)
    if not info:
        return {
            "exists": False,
            "images": [],
            "folder_path": "",
            "checkpoint_name": "",
            "supported_formats": list(PREVIEW_EXTENSIONS),
        }

    root_index = info["root_index"]
    root_path = info["root_path"]
    base_rel = info["base_rel"]
    base_abs = info["base_abs"]
    checkpoint_name_no_ext = info["checkpoint_name_no_ext"]
    parent_rel = os.path.dirname(base_rel).replace("\\", "/")
    preview_folder_rel = f"{parent_rel}/{checkpoint_name_no_ext}" if parent_rel else checkpoint_name_no_ext
    preview_folder_abs = os.path.join(root_path, *preview_folder_rel.split("/"))

    folder_images = _list_preview_folder_images(preview_folder_abs, preview_folder_rel, checkpoint_name_no_ext)
    primary_path = _resolve_checkpoint_sign_image(base_abs)
    primary_index = next((i for i, it in enumerate(folder_images) if _same_file_content(it["path"], primary_path)), -1)

    if primary_index > 0:
        primary_item = folder_images.pop(primary_index)
        folder_images.insert(0, primary_item)

    # Side effect only for ComfyUI native thumbnail compatibility.
    # Preview list still follows folder-only mode.
    _ensure_checkpoint_sign_image(base_abs, folder_images)

    images = []
    image_items = []
    default_rel = ""
    for idx, image in enumerate(folder_images):
        rel = image["rel"]
        encoded_rel = quote(rel, safe="/")
        url = f"/hud/checkpoint-preview/file?root={root_index}&rel={encoded_rel}"
        is_default = idx == 0
        if is_default:
            default_rel = rel

        images.append(url)
        image_items.append({
            "name": image["name"],
            "rel": rel,
            "url": url,
            "is_default": is_default,
        })

    return {
        "exists": True,
        "images": images,
        "image_items": image_items,
        "folder_path": preview_folder_abs,
        "checkpoint_name": checkpoint_name_no_ext,
        "supported_formats": list(PREVIEW_EXTENSIONS),
        "has_default_image": bool(default_rel),
        "has_folder": os.path.isdir(preview_folder_abs),
        "default_rel": default_rel,
    }


def _register_preview_routes():
    global _ROUTES_REGISTERED
    if _ROUTES_REGISTERED or not getattr(PromptServer, "instance", None):
        return

    routes = PromptServer.instance.routes

    @routes.get("/hud/checkpoint-preview/list")
    async def hud_checkpoint_preview_list(request):
        ckpt_name = request.query.get("ckpt", "")
        if not ckpt_name:
            return web.json_response({"images": [], "exists": False})

        try:
            payload = _resolve_checkpoint_preview_payload(ckpt_name)
        except Exception:
            payload = {"images": [], "exists": False}

        return web.json_response(payload)

    @routes.get("/hud/checkpoint-preview/file")
    async def hud_checkpoint_preview_file(request):
        try:
            root_index_raw = request.query.get("root", "").strip()
            rel_raw = request.query.get("rel", "").strip()
            if not rel_raw:
                return web.Response(status=400, text="Missing rel")

            try:
                root_index = int(root_index_raw)
            except Exception:
                return web.Response(status=400, text="Invalid root")

            checkpoint_roots = folder_paths.folder_names_and_paths.get("checkpoints", ([], set()))[0]
            if root_index < 0 or root_index >= len(checkpoint_roots):
                return web.Response(status=404, text="Root not found")

            root_abs = os.path.abspath(checkpoint_roots[root_index])
            rel_path = unquote(rel_raw).replace("\\", "/").lstrip("/")
            target = os.path.abspath(os.path.join(root_abs, *rel_path.split("/")))

            root_norm = os.path.normcase(root_abs)
            target_norm = os.path.normcase(target)
            if not (target_norm == root_norm or target_norm.startswith(root_norm + os.path.sep)):
                return web.Response(status=403, text="Access denied")

            if not os.path.isfile(target):
                return web.Response(status=404, text="File not found")

            return web.FileResponse(target)
        except Exception:
            return web.Response(status=500)

    @routes.post("/hud/checkpoint-preview/prepare")
    async def hud_checkpoint_preview_prepare(request):
        try:
            payload = await request.json()
        except Exception:
            payload = {}

        ckpt_name = str(payload.get("ckpt") or "").strip()
        if not ckpt_name:
            return web.json_response({"success": False, "error": "missing ckpt"}, status=400)

        try:
            info = _resolve_checkpoint_info(ckpt_name)
            if not info:
                return web.json_response({"success": False, "error": "checkpoint not found"}, status=404)

            root_path = info["root_path"]
            base_rel = info["base_rel"]
            checkpoint_name_no_ext = info["checkpoint_name_no_ext"]
            parent_rel = os.path.dirname(base_rel).replace("\\", "/")
            preview_folder_rel = f"{parent_rel}/{checkpoint_name_no_ext}" if parent_rel else checkpoint_name_no_ext
            preview_folder_abs = os.path.join(root_path, *preview_folder_rel.split("/"))

            os.makedirs(preview_folder_abs, exist_ok=True)
            return web.json_response({
                "success": True,
                "folder_path": preview_folder_abs,
                "checkpoint_name": checkpoint_name_no_ext,
                "supported_formats": list(PREVIEW_EXTENSIONS),
            })
        except Exception as e:
            return web.json_response({"success": False, "error": str(e)}, status=500)

    @routes.post("/hud/checkpoint-preview/set-default")
    async def hud_checkpoint_preview_set_default(request):
        try:
            payload = await request.json()
        except Exception:
            payload = {}

        ckpt_name = str(payload.get("ckpt") or "").strip()
        rel_raw = str(payload.get("rel") or "").strip()
        if not ckpt_name or not rel_raw:
            return web.json_response({"success": False, "error": "missing ckpt or rel"}, status=400)

        try:
            info = _resolve_checkpoint_info(ckpt_name)
            if not info:
                return web.json_response({"success": False, "error": "checkpoint not found"}, status=404)

            root_abs = info["root_path"]
            base_abs = info["base_abs"]
            base_rel = info["base_rel"]
            checkpoint_name_no_ext = info["checkpoint_name_no_ext"]
            parent_rel = os.path.dirname(base_rel).replace("\\", "/")
            preview_folder_rel = f"{parent_rel}/{checkpoint_name_no_ext}" if parent_rel else checkpoint_name_no_ext
            preview_folder_abs = os.path.join(root_abs, *preview_folder_rel.split("/"))
            rel_path = rel_raw.replace("\\", "/").lstrip("/")
            src_abs = os.path.abspath(os.path.join(root_abs, *rel_path.split("/")))

            root_norm = os.path.normcase(root_abs)
            src_norm = os.path.normcase(src_abs)
            if not (src_norm == root_norm or src_norm.startswith(root_norm + os.path.sep)):
                return web.json_response({"success": False, "error": "access denied"}, status=403)

            if not os.path.isfile(src_abs):
                filename = os.path.basename(rel_path)
                if filename:
                    candidate = os.path.abspath(os.path.join(preview_folder_abs, filename))
                    if os.path.isfile(candidate):
                        src_abs = candidate
                if not os.path.isfile(src_abs):
                    return web.json_response({"success": False, "error": "source not found"}, status=404)

            ext = os.path.splitext(src_abs)[1].lstrip(".").lower()
            if ext not in PREVIEW_EXTENSIONS:
                return web.json_response({"success": False, "error": "unsupported format"}, status=400)
            if not os.path.isdir(preview_folder_abs):
                return web.json_response({"success": False, "error": "preview folder not found"}, status=404)

            src_norm = os.path.normcase(os.path.abspath(src_abs))
            folder_norm = os.path.normcase(os.path.abspath(preview_folder_abs))
            if not (src_norm == folder_norm or src_norm.startswith(folder_norm + os.path.sep)):
                return web.json_response({"success": False, "error": "source must be inside preview folder"}, status=400)

            selected_name = os.path.basename(src_abs)
            normalized_names = _normalize_preview_folder(preview_folder_abs, checkpoint_name_no_ext)
            normalized_name = normalized_names.get(selected_name, selected_name)
            src_abs = os.path.join(preview_folder_abs, normalized_name)
            if not os.path.isfile(src_abs):
                return web.json_response({"success": False, "error": "source not found after normalize"}, status=404)

            _sync_checkpoint_sign_image(base_abs, src_abs)

            refreshed = _resolve_checkpoint_preview_payload(ckpt_name)
            return web.json_response({
                "success": True,
                "default_path": refreshed.get("default_rel", ""),
                "payload": refreshed,
            })
        except Exception as e:
            return web.json_response({"success": False, "error": str(e)}, status=500)

    @routes.post("/hud/checkpoint-preview/upload")
    async def hud_checkpoint_preview_upload(request):
        try:
            reader = await request.multipart()
        except Exception:
            return web.json_response({"success": False, "error": "invalid multipart"}, status=400)

        ckpt_name = ""
        files = []

        try:
            while True:
                part = await reader.next()
                if part is None:
                    break
                if part.name == "ckpt":
                    ckpt_name = (await part.text()).strip()
                    continue
                if part.name != "files":
                    continue
                if not part.filename:
                    continue
                raw = await part.read(decode=False)
                files.append((os.path.basename(part.filename), raw))

            if not ckpt_name:
                return web.json_response({"success": False, "error": "missing ckpt"}, status=400)
            if not files:
                return web.json_response({"success": False, "error": "no files"}, status=400)

            info = _resolve_checkpoint_info(ckpt_name)
            if not info:
                return web.json_response({"success": False, "error": "checkpoint not found"}, status=404)

            root_path = info["root_path"]
            base_rel = info["base_rel"]
            checkpoint_name_no_ext = info["checkpoint_name_no_ext"]
            parent_rel = os.path.dirname(base_rel).replace("\\", "/")
            preview_folder_rel = f"{parent_rel}/{checkpoint_name_no_ext}" if parent_rel else checkpoint_name_no_ext
            preview_folder_abs = os.path.join(root_path, *preview_folder_rel.split("/"))
            os.makedirs(preview_folder_abs, exist_ok=True)
            _normalize_preview_folder(preview_folder_abs, checkpoint_name_no_ext)
            existing_images = _list_preview_folder_images(preview_folder_abs, "", checkpoint_name_no_ext)

            saved = []
            saved_paths = []
            skipped = []
            for filename, raw in files:
                ext = os.path.splitext(filename)[1].lstrip(".").lower()
                if ext not in PREVIEW_EXTENSIONS:
                    skipped.append(filename)
                    continue

                target_name = _preview_number_name(_next_preview_index(preview_folder_abs, checkpoint_name_no_ext), ext)
                target = os.path.join(preview_folder_abs, target_name)

                with open(target, "wb") as f:
                    f.write(raw)
                saved.append(os.path.basename(target))
                saved_paths.append(target)

            if not existing_images and saved_paths:
                _sync_checkpoint_sign_image(info["base_abs"], saved_paths[0])

            refreshed = _resolve_checkpoint_preview_payload(ckpt_name)
            return web.json_response({
                "success": True,
                "saved": saved,
                "skipped": skipped,
                "payload": refreshed,
            })
        except Exception as e:
            return web.json_response({"success": False, "error": str(e)}, status=500)

    _ROUTES_REGISTERED = True


_register_preview_routes()


class ComfyUI_HUD_CheckpointLoaderPreview(CheckpointLoaderSimple):
    CHECKPOINT_VAE = "Use checkpoint VAE"
    
    DESCRIPTION = (
        "Loads a checkpoint with inline preview/gallery UX and integrated VAE resolution. "
        "Allows switching between internal VAE and external VAE files in one step."
    )

    @classmethod
    def INPUT_TYPES(cls):
        base = super().INPUT_TYPES() or {}
        required = dict(base.get("required", {}))
        optional = dict(base.get("optional", {}))

        if "ckpt_name" in required and isinstance(required["ckpt_name"], tuple):
            ckpt_def = required["ckpt_name"]
            ckpt_choices = ckpt_def[0]
            ckpt_opts = dict(ckpt_def[1]) if len(ckpt_def) > 1 and isinstance(ckpt_def[1], dict) else {}
            ckpt_opts["tooltip"] = "Checkpoint filename to load."
            required["ckpt_name"] = (ckpt_choices, ckpt_opts)

        # VAE Resolver 기능 통합
        required["vae_name"] = ([cls.CHECKPOINT_VAE] + folder_paths.get_filename_list("vae"), {
            "default": cls.CHECKPOINT_VAE,
            "tooltip": "Select either the internal checkpoint VAE or an external VAE file."
        })

        optional["filter_mode"] = (["All", "SD15", "SDXL"], {
            "default": "All",
            "tooltip": "Filter checkpoint dropdown by filename prefix. Unmatched files stay visible in All.",
            "advanced": True,
        })
        optional["bookmark_only"] = ("BOOLEAN", {
            "default": False,
            "tooltip": "Only show bookmarked checkpoints inside the current filter group.",
            "advanced": True,
        })

        base["required"] = required
        base["optional"] = optional
        return base

    CATEGORY = "HUD/Loaders"
    FUNCTION = "load_all"
    
    RETURN_TYPES = ("MODEL", "CLIP", "VAE")
    RETURN_NAMES = ("model", "clip", "vae")
    
    OUTPUT_TOOLTIPS = (
        "Loaded MODEL output for sampling.",
        "Loaded CLIP output for conditioning.",
        "Resolved VAE output (either from the checkpoint itself or a selected external VAE file)."
    )

    def _load_external_vae(self, vae_name):
        vae_path = folder_paths.get_full_path_or_raise("vae", vae_name)
        sd, metadata = comfy.utils.load_torch_file(vae_path, return_metadata=True)
        vae = comfy.sd.VAE(sd=sd, metadata=metadata)
        vae.throw_exception_if_invalid()
        return vae

    def load_all(self, ckpt_name, vae_name, filter_mode="All", bookmark_only=False, **kwargs):
        # 1. 체크포인트 로드 (Base Loader 사용)
        model, clip, vae = super().load_checkpoint(ckpt_name)
        
        # 2. VAE 해제 및 재할당 (필요 시)
        resolved_vae = vae
        if vae_name != self.CHECKPOINT_VAE:
            hud_log(f"Switching to external VAE: {vae_name}", "Checkpoint Master")
            resolved_vae = self._load_external_vae(vae_name)
        else:
            hud_log(f"Using internal checkpoint VAE for: {ckpt_name}", "Checkpoint Master")

        hud_log(f"Loaded - Model: {ckpt_name}, VAE: {vae_name}", "Checkpoint Master")

        return (model, clip, resolved_vae)
