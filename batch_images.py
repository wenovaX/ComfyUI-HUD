import os
import shutil
import hashlib
import traceback
from io import BytesIO
from urllib.parse import quote, unquote, urlparse, parse_qs

from aiohttp import web
import folder_paths
import numpy as np
from PIL import Image, ImageOps
from server import PromptServer
import torch


NODE_ASSET_IMAGE_SUBFOLDER_ROOT = os.path.join("external_module", "node_assets", "image").replace("\\", "/")
RECYCLE_SUBFOLDER_ROOT = os.path.join("external_module", "node_assets", ".recycle").replace("\\", "/")
_ROUTES_REGISTERED = False


def _sanitize_path_token(value, fallback):
    token = "".join(ch for ch in str(value or "") if ch.isalnum() or ch in ("-", "_"))
    return token or fallback


def _normalize_input_relative_path(value):
    text = str(value or "").strip()
    if not text:
        return ""

    if text.startswith("/hud/batch-images/view?"):
        try:
            parsed = urlparse(text)
            query = parse_qs(parsed.query)
            return str((query.get("path") or [""])[0] or "").strip().replace("\\", "/").lstrip("/")
        except Exception:
            return ""

    if text.startswith("/api/view?"):
        try:
            parsed = urlparse(text)
            query = parse_qs(parsed.query)
            filename = str((query.get("filename") or [""])[0] or "").strip().replace("\\", "/").lstrip("/")
            subfolder = str((query.get("subfolder") or [""])[0] or "").strip().replace("\\", "/").strip("/")
            return f"{subfolder}/{filename}".strip("/") if subfolder else filename
        except Exception:
            return ""

    return text.replace("\\", "/").lstrip("/")


def _split_input_relative_path(value):
    relative_path = _normalize_input_relative_path(value)
    if not relative_path:
        return "", ""

    if "/" in relative_path:
        subfolder, filename = relative_path.rsplit("/", 1)
    else:
        subfolder, filename = "", relative_path
    return subfolder.strip("/"), filename


def _resolve_managed_batch_path(value):
    relative_path = _normalize_input_relative_path(value)
    if not relative_path or not relative_path.startswith(f"{NODE_ASSET_IMAGE_SUBFOLDER_ROOT}/"):
        return None, None

    input_dir = folder_paths.get_input_directory()
    target_path = os.path.abspath(os.path.join(input_dir, *relative_path.split("/")))
    allowed_root = os.path.abspath(os.path.join(input_dir, *NODE_ASSET_IMAGE_SUBFOLDER_ROOT.split("/")))

    try:
        common = os.path.commonpath([target_path, allowed_root])
    except ValueError:
        return None, None

    if common != allowed_root:
        return None, None

    return relative_path, target_path


def _register_batch_routes():
    global _ROUTES_REGISTERED
    if _ROUTES_REGISTERED or not getattr(PromptServer, "instance", None):
        return

    input_dir = folder_paths.get_input_directory()
    recycle_dir = os.path.join(input_dir, *RECYCLE_SUBFOLDER_ROOT.split("/"))
    if os.path.exists(recycle_dir):
        try:
            shutil.rmtree(recycle_dir)
        except Exception:
            pass

    routes = PromptServer.instance.routes

    @routes.post("/hud/batch-images/upload")
    async def hud_batch_images_upload(request):
        try:
            reader = await request.multipart()
            field = await reader.next()
            if field is None or field.name != "file":
                return web.json_response({"error": "missing file"}, status=400)

            safe_name = os.path.basename(field.filename or "upload.png")
            _, ext = os.path.splitext(safe_name)
            input_dir = folder_paths.get_input_directory()
            os.makedirs(input_dir, exist_ok=True)
            ext = (ext or ".png").lower()

            chunks = []
            while True:
                chunk = await field.read_chunk()
                if not chunk:
                    break
                chunks.append(chunk)

            file_bytes = b"".join(chunks)
            if not file_bytes:
                return web.json_response({"error": "empty file"}, status=400)

            payload = {}
            while True:
                extra_field = await reader.next()
                if extra_field is None:
                    break
                payload[extra_field.name] = await extra_field.text()

            node_token = _sanitize_path_token(payload.get("node_id"), "node")
            kind_token = _sanitize_path_token(payload.get("kind"), "asset")
            workflow_token = _sanitize_path_token(payload.get("workflow_id"), "shared")
            
            target_subfolder = f"{NODE_ASSET_IMAGE_SUBFOLDER_ROOT}/{workflow_token}/{node_token}"
            target_dir = os.path.join(input_dir, *target_subfolder.split("/"))
            os.makedirs(target_dir, exist_ok=True)

            def build_normalized_digest(raw_bytes):
                try:
                    image = ImageOps.exif_transpose(Image.open(BytesIO(raw_bytes))).convert("RGBA")
                    hasher = hashlib.sha1()
                    hasher.update(str(image.size).encode("utf-8"))
                    hasher.update(image.tobytes())
                    return hasher.hexdigest()
                except Exception:
                    hasher = hashlib.sha1()
                    hasher.update(raw_bytes)
                    return hasher.hexdigest()

            raw_hasher = hashlib.sha1()
            raw_hasher.update(file_bytes)
            digest = raw_hasher.hexdigest()

            existing_named_path = os.path.join(target_dir, safe_name)
            if os.path.isfile(existing_named_path):
                try:
                    with open(existing_named_path, "rb") as handle:
                        existing_bytes = handle.read()

                    if hashlib.sha1(existing_bytes).hexdigest() == digest:
                        relative_path = f"{target_subfolder}/{safe_name}"
                        return web.json_response({
                            "name": safe_name,
                            "subfolder": target_subfolder,
                            "relative_path": relative_path,
                            "original_name": safe_name,
                            "url": f"/hud/batch-images/view?path={quote(relative_path, safe='/')}",
                        })

                    # Preserve old behavior for same-name replacements with different metadata:
                    # if image content is effectively identical, reuse the existing file name.
                    existing_named_digest = build_normalized_digest(existing_bytes)
                    uploaded_normalized_digest = build_normalized_digest(file_bytes)
                    if existing_named_digest == uploaded_normalized_digest:
                        relative_path = f"{target_subfolder}/{safe_name}"
                        return web.json_response({
                            "name": safe_name,
                            "subfolder": target_subfolder,
                            "relative_path": relative_path,
                            "original_name": safe_name,
                            "url": f"/hud/batch-images/view?path={quote(relative_path, safe='/')}",
                        })
                except Exception:
                    pass

            upload_name = f"node_{kind_token}_{digest}{ext}"
            target_path = os.path.join(target_dir, upload_name)
            relative_path = f"{target_subfolder}/{upload_name}"

            if not os.path.isfile(target_path):
                with open(target_path, "wb") as handle:
                    handle.write(file_bytes)

            return web.json_response({
                "name": upload_name,
                "subfolder": target_subfolder,
                "relative_path": relative_path,
                "original_name": safe_name,
                "url": f"/hud/batch-images/view?path={quote(relative_path, safe='/')}",
            })
        except Exception as exc:
            traceback.print_exc()
            return web.json_response({"error": str(exc)}, status=500)

    @routes.get("/hud/batch-images/view")
    async def hud_batch_images_view(request):
        relative_path, target_path = _resolve_managed_batch_path(unquote(request.query.get("path", "")))
        if not relative_path or not target_path or not os.path.isfile(target_path):
            raise web.HTTPNotFound()

        response = web.FileResponse(target_path)
        response.headers["Cache-Control"] = "no-cache"
        return response

    @routes.post("/hud/batch-images/delete")
    async def hud_batch_images_delete(request):
        try:
            payload = await request.json()
        except Exception:
            payload = {}

        relative_path, target_path = _resolve_managed_batch_path(payload.get("relative_path") or payload.get("name"))
        if not relative_path or not target_path:
            return web.json_response({"deleted": False, "reason": "ignored"})

        subfolder, name = _split_input_relative_path(relative_path)
        if not name or not name.startswith("node_"):
            return web.json_response({"deleted": False, "reason": "ignored"})

        if os.path.isfile(target_path):
            try:
                input_dir = folder_paths.get_input_directory()
                parts = relative_path.split("/")
                # Replace 'image' with '.recycle'
                if len(parts) > 2 and parts[2] == "image":
                    parts[2] = ".recycle"
                    recycle_path = os.path.join(input_dir, *parts)
                    os.makedirs(os.path.dirname(recycle_path), exist_ok=True)
                    shutil.move(target_path, recycle_path)
                    return web.json_response({"deleted": True, "recycled": True})
                
                os.remove(target_path)
                return web.json_response({"deleted": True})
            except Exception:
                return web.json_response({"deleted": False, "reason": "delete_failed"}, status=500)

        return web.json_response({"deleted": False, "reason": "missing"})

    _ROUTES_REGISTERED = True


_register_batch_routes()


class _BatchImagesBase:
    STORAGE_KEY = "hud_batch_image_slots"
    DESCRIPTION = (
        "Builds an image batch from dynamic slots and returns aligned masks. "
        "Different source resolutions are normalized to one canvas with padding (no cropping)."
    )

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {},
            "hidden": {
                "unique_id": "UNIQUE_ID",
                "extra_pnginfo": "EXTRA_PNGINFO",
            },
        }

    RETURN_TYPES = ("IMAGE", "MASK")
    RETURN_NAMES = ("images", "masks")
    OUTPUT_TOOLTIPS = (
        "Batched IMAGE output. Source images are resized to fit a shared canvas while preserving aspect ratio.",
        "Batched MASK output aligned with the images batch. Empty masks remain empty instead of generating black mask files.",
    )
    FUNCTION = "build_batch"
    CATEGORY = "HUD/Image"

    @classmethod
    def _read_slots(cls, unique_id=None, extra_pnginfo=None):
        slots = []
        try:
            if extra_pnginfo and "workflow" in extra_pnginfo:
                for node in extra_pnginfo["workflow"].get("nodes", []):
                    if str(node.get("id")) != str(unique_id):
                        continue
                    props = node.get("properties") or {}
                    slots = props.get(cls.STORAGE_KEY, [])
                    break
        except Exception:
            slots = []
        return slots if isinstance(slots, list) else []

    @staticmethod
    def _resolve_input_file(name):
        relative_path = _normalize_input_relative_path(name)
        if not relative_path:
            return None
        
        # 1. Try original path
        try:
            path = folder_paths.get_annotated_filepath(relative_path)
        except Exception:
            try:
                input_dir = folder_paths.get_input_directory()
                path = os.path.join(input_dir, *relative_path.split("/"))
            except Exception:
                path = None
        
        if path and os.path.isfile(path):
            return path
            
        # 2. Try recycle bin path as fallback
        if relative_path.startswith(NODE_ASSET_IMAGE_SUBFOLDER_ROOT + "/"):
            try:
                input_dir = folder_paths.get_input_directory()
                parts = relative_path.split("/")
                if len(parts) > 2 and parts[2] == "image":
                    parts[2] = ".recycle"
                    recycle_path = os.path.join(input_dir, *parts)
                    if os.path.isfile(recycle_path):
                        return recycle_path
            except Exception:
                pass

        return None

    @classmethod
    def _normalize_slot_paths(cls, image_name, mask_name):
        image_path = cls._resolve_input_file(image_name)
        if not image_path:
            return None, None
        mask_path = cls._resolve_input_file(mask_name)
        return image_path, mask_path

    @staticmethod
    def _load_source_images(image_path, mask_path):
        source = ImageOps.exif_transpose(Image.open(image_path))
        rgb = source.convert("RGB")

        if mask_path:
            mask_source = ImageOps.exif_transpose(Image.open(mask_path))
            if "A" in mask_source.getbands():
                mask = mask_source.getchannel("A")
            else:
                mask = mask_source.convert("L")
        elif "A" in source.getbands():
            mask = source.getchannel("A")
        elif source.mode == "P" and "transparency" in source.info:
            mask = source.convert("RGBA").getchannel("A")
        else:
            mask = Image.new("L", rgb.size, 0)

        return rgb, mask.convert("L")

    @staticmethod
    def _fit_to_canvas(rgb_image, mask_image, target_hw):
        target_h, target_w = target_hw
        src_w, src_h = rgb_image.size
        scale = min(target_w / src_w, target_h / src_h)
        new_w = max(1, round(src_w * scale))
        new_h = max(1, round(src_h * scale))

        resized_rgb = rgb_image.resize((new_w, new_h), Image.Resampling.LANCZOS)
        resized_mask = mask_image.resize((new_w, new_h), Image.Resampling.LANCZOS)

        canvas_rgb = Image.new("RGB", (target_w, target_h), (0, 0, 0))
        canvas_mask = Image.new("L", (target_w, target_h), 0)
        offset = ((target_w - new_w) // 2, (target_h - new_h) // 2)
        canvas_rgb.paste(resized_rgb, offset)
        canvas_mask.paste(resized_mask, offset)
        return canvas_rgb, canvas_mask

    def build_batch(self, unique_id=None, extra_pnginfo=None, **kwargs):
        slots = self._read_slots(unique_id, extra_pnginfo)
        valid_slots = [slot for slot in slots if isinstance(slot, dict) and str(slot.get("image", "")).strip()]
        if not valid_slots:
            raise RuntimeError("Batch Images (Mask Editor): add at least one image.")

        loaded_sources = []
        target_h = 0
        target_w = 0

        for slot in valid_slots:
            image_name = str(slot.get("image", "")).strip()
            mask_name = str(slot.get("mask", "")).strip()
            image_path, mask_path = self._normalize_slot_paths(image_name, mask_name)
            if not image_path:
                continue
            rgb_image, mask_image = self._load_source_images(image_path, mask_path)
            target_w = max(target_w, rgb_image.size[0])
            target_h = max(target_h, rgb_image.size[1])
            loaded_sources.append((rgb_image, mask_image))

        if not loaded_sources:
            raise RuntimeError("Batch Images (Mask Editor): saved image files are missing. Reattach at least one image.")

        batched_images = []
        batched_masks = []
        target_hw = (target_h, target_w)

        for rgb_image, mask_image in loaded_sources:
            canvas_rgb, canvas_mask = self._fit_to_canvas(rgb_image, mask_image, target_hw)
            image_array = np.array(canvas_rgb).astype(np.float32) / 255.0
            mask_array = np.array(canvas_mask).astype(np.float32) / 255.0
            batched_images.append(torch.from_numpy(image_array)[None,])
            batched_masks.append(torch.from_numpy(mask_array).unsqueeze(0))

        return (torch.cat(batched_images, dim=0), torch.cat(batched_masks, dim=0))


class ComfyUI_HUD_BatchImagesMaskEditor(_BatchImagesBase):
    STORAGE_KEY = "hud_batch_mask_editor_slots"
    CATEGORY = "HUD/Image"
    TITLE = "Batch Images (Mask Editor)"
