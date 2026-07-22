import { app } from "/scripts/app.js";
import { css, applyComfyUI_HUD_NodeStyle, watchNodeColor, log } from "./shared_styles.js";

app.registerExtension({
    name: "ComfyUI_HUD.BatchImagesMaskEditor",
    async nodeCreated(node) {
        const KEY = "hud_batch_mask_editor_slots";
        const BATCH_EDITOR_CLASSES = new Set([
            "ComfyUI_HUD_BatchImagesMaskEditor",
        ]);
        const isBatchEditorNode = (targetNode) => {
            const comfyClass = String(targetNode?.comfyClass || "");
            if (BATCH_EDITOR_CLASSES.has(comfyClass)) return true;
            return !!targetNode?.properties && Array.isArray(targetNode.properties[KEY]);
        };
        if (!isBatchEditorNode(node)) return;

        const PREVIEW_MODE_KEY = "hud_batch_mask_preview_mode";
        const PREVIEW_MODES = { OVERLAY: "overlay", SPLIT: "split" };

        let slots = [];
        let previewMode = PREVIEW_MODES.OVERLAY;
        let disposed = false;
        const nodeDisposers = [];
        const renderDisposers = [];

        const runDisposers = (bucket) => {
            while (bucket.length) {
                const dispose = bucket.pop();
                try { dispose?.(); } catch (_) {}
            }
        };
        const addManagedListener = (target, eventName, handler, options, bucket = "render") => {
            if (!target) return () => {};
            target.addEventListener(eventName, handler, options);
            const off = () => target.removeEventListener(eventName, handler, options);
            (bucket === "node" ? nodeDisposers : renderDisposers).push(off);
            return off;
        };
        
        const normalizePreviewMode = (value) => (
            String(value || PREVIEW_MODES.OVERLAY).toLowerCase() === PREVIEW_MODES.SPLIT
                ? PREVIEW_MODES.SPLIT
                : PREVIEW_MODES.OVERLAY
        );

        // --- ROBUST LOGIC (FIXED) ---
        const normalizeStoredPath = (value) => {
            let text = String(value || "").trim();
            if (!text) return "";
            if (text.includes("/hud/batch-images/view?")) {
                try {
                    const url = new URL(text, window.location.origin);
                    text = url.searchParams.get("path") || text;
                } catch (_) {}
            } else if (text.includes("/api/view?")) {
                try {
                    const url = new URL(text, window.location.origin);
                    const filename = url.searchParams.get("filename") || "";
                    const subfolder = url.searchParams.get("subfolder") || "";
                    text = subfolder ? `${subfolder}/${filename}` : filename;
                } catch (_) {}
            }
            return text.replace(/\\/g, "/");
        };

        const splitStoredPath = (value) => {
            const relativePath = normalizeStoredPath(value);
            if (!relativePath) return { relativePath: "", subfolder: "", filename: "" };
            const slashIndex = relativePath.lastIndexOf("/");
            if (slashIndex === -1) return { relativePath, subfolder: "", filename: relativePath };
            return {
                relativePath,
                subfolder: relativePath.slice(0, slashIndex),
                filename: relativePath.slice(slashIndex + 1),
            };
        };

        const fileUrl = (value, bustCache = false) => {
            const { relativePath, filename } = splitStoredPath(value);
            return filename
                ? `/hud/batch-images/view?path=${encodeURIComponent(relativePath)}${bustCache ? `&rand=${Date.now()}` : ""}`
                : "";
        };

        const fileUrlLegacy = (value) => {
            const { filename, subfolder } = splitStoredPath(value);
            return filename
                ? `/api/view?type=input&filename=${encodeURIComponent(filename)}&subfolder=${encodeURIComponent(subfolder)}`
                : "";
        };

        const refresh = () => {
            node.setDirtyCanvas?.(true, true);
            app.graph?.setDirtyCanvas?.(true, true);
        };

        const getWorkflowId = () => {
            if (!app.graph.extra) app.graph.extra = {};
            if (!app.graph.extra.hud_workflow_id) {
                app.graph.extra.hud_workflow_id = crypto.randomUUID();
            }
            return app.graph.extra.hud_workflow_id;
        };

        const uploadFile = async (file, kind = "asset") => {
            const form = new FormData();
            form.append("file", file);
            form.append("node_id", String(node.id ?? "node"));
            form.append("kind", String(kind || "asset"));
            form.append("workflow_id", getWorkflowId());
            const res = await fetch("/hud/batch-images/upload", { method: "POST", body: form });
            if (!res.ok) {
                let details = "";
                try { details = await res.text(); } catch (_) {}
                throw new Error(`Upload failed (${res.status})${details ? `: ${details}` : ""}`);
            }
            return await res.json();
        };

        const buildHudFetchUrl = (filename, subfolder, type) => {
            const safeFilename = encodeURIComponent(String(filename || ""));
            const safeSubfolder = encodeURIComponent(String(subfolder || ""));
            const t = String(type || "output").toLowerCase();
            if (t === "input" || t === "output") {
                return `/api/view?type=${encodeURIComponent(t)}&filename=${safeFilename}&subfolder=${safeSubfolder}`;
            }
            // absolute/other: use HUD secure resolver which supports bookmarked absolute paths
            return `/hud/view?filename=${safeFilename}&subfolder=${safeSubfolder}`;
        };

        const save = () => {
            try {
                const nextSlots = slots.map((x) => ({
                    image: normalizeStoredPath(x?.image),
                    mask: normalizeStoredPath(x?.mask),
                }));
                node.properties = node.properties || {};
                node.properties[KEY] = nextSlots;
                node.properties[PREVIEW_MODE_KEY] = previewMode;
                const trigger = node.widgets?.find(w => w.name === "update_trigger");
                if (trigger) trigger.value = crypto.randomUUID();
                app.graph?.change?.();
                refresh();
            } catch (e) { console.error("HUD Save Error:", e); }
        };

        const removeUpdateTriggerSurface = () => {
            const trigger = node.widgets?.find(w => w.name === "update_trigger");
            if (trigger) {
                trigger.type = "converted-widget";
                trigger.computeSize = () => [0, -4];
                trigger.hidden = true;
            }

            for (let i = (node.inputs?.length || 0) - 1; i >= 0; i -= 1) {
                if (node.inputs?.[i]?.name !== "update_trigger") continue;
                try { node.disconnectInput?.(i); } catch (_) {}
                try {
                    node.removeInput?.(i);
                } catch (_) {
                    node.inputs.splice(i, 1);
                }
            }

            node.setDirtyCanvas?.(true, true);
            app.graph?.setDirtyCanvas?.(true, true);
        };

        const attachDropTarget = (target, onPick, bucket = "render") => {
            const onDragOver = (event) => {
                event.preventDefault();
                target.style.borderColor = "#00ffcc";
                target.style.boxShadow = "0 0 15px rgba(0, 255, 204, 0.4), inset 0 0 10px rgba(0, 255, 204, 0.1)";
            };
            const onDragLeave = () => {
                target.style.borderColor = "rgba(190,235,255,0.14)";
                target.style.boxShadow = "";
            };
            const onDrop = async (event) => {
                event.preventDefault();
                event.stopPropagation();
                target.style.borderColor = "rgba(190,235,255,0.14)";
                target.style.boxShadow = "";
                
                // 1. Check for HUD Data (comfyui/image format)
                const hudData = event.dataTransfer.getData("comfyui/image");
                if (hudData) {
                    try {
                        const { filename, subfolder, type } = JSON.parse(hudData);
                        // Follow "Existing Upload Policy": Import the file into node assets
                        // by fetching and re-uploading (ensures consistency with node's asset management)
                        const hudUrl = buildHudFetchUrl(filename, subfolder, type);
                        
                        // Show visual loading state (optional, but good for UX)
                        target.style.opacity = "0.5";
                        
                        const response = await fetch(hudUrl);
                        if (!response.ok) {
                            let details = "";
                            try { details = await response.text(); } catch (_) {}
                            throw new Error(`Source fetch failed (${response.status})${details ? `: ${details}` : ""}`);
                        }
                        const blob = await response.blob();
                        if (!blob || !blob.size) {
                            throw new Error("Source fetch returned empty blob");
                        }
                        const file = new File([blob], filename, { type: blob.type || "image/png" });
                        
                        const uploaded = await uploadFile(file, target.dataset.uploadKind || "asset");
                        const path = uploaded.relative_path || uploaded.name;
                        
                        target.style.opacity = "1";
                        if (path) {
                            onPick(path);
                            return;
                        }
                    } catch (e) { 
                        target.style.opacity = "1";
                        console.error("HUD Import Error:", e); 
                    }
                }

                // 2. Check for Native Files
                const file = event.dataTransfer?.files?.[0];
                if (file?.type.startsWith("image/")) {
                    try {
                        const uploaded = await uploadFile(file, target.dataset.uploadKind || "asset");
                        const path = uploaded.relative_path || uploaded.name;
                        if (path) onPick(path);
                    } catch (e) { console.error("Native Drop Error:", e); }
                }
            };
            addManagedListener(target, "dragover", onDragOver, undefined, bucket);
            addManagedListener(target, "dragleave", onDragLeave, undefined, bucket);
            addManagedListener(target, "drop", onDrop, undefined, bucket);
        };

        // --- ORIGINAL STYLING OPTIONS (RESTORED) ---
        const styleOptions = {
            rootGradient: "linear-gradient(135deg, rgba(90,190,255,0.10), rgba(100,235,210,0.09), rgba(160,120,255,0.08), rgba(255,255,255,0.03))",
            headerGradient: "linear-gradient(90deg, rgba(90,180,255,0.14), rgba(90,220,210,0.12), rgba(170,120,255,0.10), rgba(220,255,255,0.06))"
        };
        const buttonBaseStyle = {
            borderRadius: "10px", border: "1px solid rgba(255,255,255,0.12)",
            background: "rgba(255,255,255,0.06)", color: "rgba(245,252,255,0.84)",
            fontSize: "10px", fontWeight: "800", cursor: "pointer",
        };
        const createButton = (style = {}) => css(document.createElement("button"), { ...buttonBaseStyle, ...style });

        // --- UI RE-CONSTRUCTION (ORIGINAL LOOK) ---
        const container = css(document.createElement("div"), {
            width: "100%", display: "flex", flexDirection: "column", gap: "10px", marginTop: "6px", boxSizing: "border-box"
        });

        // Global node drop
        attachDropTarget(container, (path) => {
            const slot = slots[slots.length - 1] || slots[0];
            if (slot) { slot.image = path; slot.mask = ""; save(); scheduleRender(); }
        }, "node");

        const header = css(document.createElement("div"), {
            padding: "10px 12px", borderRadius: "14px", border: "1px solid rgba(180,235,255,0.14)",
            background: "linear-gradient(135deg, rgba(100,195,255,0.10), rgba(100,225,210,0.08), rgba(170,120,255,0.07), rgba(255,255,255,0.04))",
            color: "rgba(245,252,255,0.9)", fontSize: "11px", fontWeight: "700", display: "flex", flexDirection: "column", gap: "6px"
        });
        const signature = css(document.createElement("div"), {
            width: "100%", height: "2px", borderRadius: "999px",
            background: "linear-gradient(270deg, #ff5f7a, #ffb86b, #ffe56a, #5fffb2, #63d8ff, #7a8cff, #c46bff, #ff5f7a)",
            backgroundSize: "400% 100%", animation: "hudRainbowFlow 4s linear infinite",
            boxShadow: "0 0 12px rgba(110,215,255,0.18)", marginBottom: "4px"
        });
        header.append(signature, document.createTextNode("Build an image batch and paint simple masks directly in a lightweight editor."));

        const list = css(document.createElement("div"), { display: "grid", gap: "10px" });

        let renderQueued = false;
        const scheduleRender = () => {
            if (disposed || renderQueued) return;
            renderQueued = true;
            requestAnimationFrame(() => {
                if (disposed) return;
                renderQueued = false;
                renderNow();
            });
        };

        const renderNow = () => {
            try {
                runDisposers(renderDisposers);
                list.replaceChildren();
                const nodeWidth = Number(node.size?.[0] || 0);
                const cols = Math.min(slots.length, Math.max(1, Math.min(4, Math.floor(nodeWidth / 200))));
                list.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;

                slots.forEach((slot, index) => {
                    const card = css(document.createElement("div"), {
                        display: "flex", flexDirection: "column", gap: "10px", padding: "12px", borderRadius: "14px",
                        border: "1px solid rgba(190,235,255,0.12)", background: "linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0.03))"
                    });
                    
                    const top = css(document.createElement("div"), { display: "flex", alignItems: "center", justifyContent: "space-between" });
                    const badge = css(document.createElement("div"), {
                        minWidth: "22px", height: "22px", borderRadius: "999px", display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: "10px", fontWeight: "800", color: "rgba(240,248,255,0.82)", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)"
                    });
                    badge.textContent = index + 1;
                    
                    const rmBtn = createButton({ color: "rgba(255,150,150,0.8)", height: "26px", display: slots.length > 1 ? "block" : "none" });
                    rmBtn.textContent = "Remove";
                    rmBtn.onclick = () => { slots.splice(index, 1); save(); scheduleRender(); };
                    top.append(badge, rmBtn);

                    const previews = css(document.createElement("div"), { display: "flex", gap: "10px" });
                    const onImg = (p) => { slot.image = p; slot.mask = ""; save(); scheduleRender(); };
                    const onMsk = (p) => { slot.mask = p; save(); scheduleRender(); };

                    if (previewMode === PREVIEW_MODES.SPLIT) {
                        previews.append(createSlotPreview("Image", slot.image, onImg, "image"), createSlotPreview("Mask", slot.mask, onMsk, "mask"));
                    } else {
                        previews.append(createOverlayPreview(slot.image, slot.mask, onImg));
                    }

                    const editBtn = createButton({ flex: "1", height: "30px", opacity: slot.image ? 1 : 0.4 });
                    editBtn.textContent = "Edit Mask";
                    editBtn.onclick = () => slot.image && alert("Mask Editor Bridge Active");

                    const row = css(document.createElement("div"), { display: "flex", gap: "8px" });
                    row.append(
                        createPickBtn("Upload Image", onImg, "image"),
                        createPickBtn("Upload Mask", onMsk, "mask"),
                        editBtn
                    );
                    card.append(top, previews, row);
                    list.appendChild(card);
                });
                applyComfyUI_HUD_NodeStyle(container, styleOptions);
                refresh();
            } catch (e) { console.error("HUD Render Error:", e); }
        };

        function createSlotPreview(title, val, onPick, kind) {
            const wrap = css(document.createElement("div"), { flex: "1", display: "flex", flexDirection: "column", gap: "6px" });
            const box = css(document.createElement("div"), { height: "110px", borderRadius: "12px", border: "1px solid rgba(190,235,255,0.14)", background: "#000", position: "relative", overflow: "hidden" });
            const img = css(document.createElement("img"), { width: "100%", height: "100%", objectFit: "cover", display: val ? "block" : "none" });
            const txt = css(document.createElement("div"), { position: "absolute", inset: "0", display: val ? "none" : "flex", alignItems: "center", justifyContent: "center", fontSize: "10px", opacity: 0.5 });
            txt.textContent = `No ${title.toLowerCase()}`;
            if (val) img.src = fileUrl(val, false);
            box.dataset.uploadKind = kind;
            attachDropTarget(box, onPick);
            box.append(img, txt); wrap.append(box);
            return wrap;
        }

        function createOverlayPreview(imgV, mskV, onPick) {
            const box = css(document.createElement("div"), { flex: "1", height: "110px", borderRadius: "12px", border: "1px solid rgba(190,235,255,0.14)", background: "#000", position: "relative", overflow: "hidden" });
            const img = css(document.createElement("img"), { width: "100%", height: "100%", objectFit: "cover", display: imgV ? "block" : "none" });
            const msk = css(document.createElement("div"), { position: "absolute", inset: "0", pointerEvents: "none", background: "rgba(0,255,204,0.35)", display: mskV ? "block" : "none" });
            const txt = css(document.createElement("div"), { position: "absolute", inset: "0", display: imgV ? "none" : "flex", alignItems: "center", justifyContent: "center", fontSize: "10px", opacity: 0.5 });
            txt.textContent = "No image";
            if (imgV) img.src = fileUrl(imgV, false);
            if (mskV) {
                const url = fileUrl(mskV, false);
                msk.style.webkitMaskImage = `url(${url})`;
                msk.style.webkitMaskSize = "cover";
            }
            box.dataset.uploadKind = "image";
            attachDropTarget(box, onPick);
            box.append(img, msk, txt);
            return box;
        }

        function createPickBtn(label, onPick, kind) {
            const btn = createButton({ flex: "1", height: "30px" });
            btn.textContent = label;
            const input = document.createElement("input"); input.type = "file"; input.accept = "image/*"; input.style.display = "none";
            const onChange = async () => {
                if (!input.files[0]) return;
                try {
                    const uploaded = await uploadFile(input.files[0], kind);
                    onPick(uploaded.relative_path || uploaded.name);
                } catch (e) {
                    console.error("Upload Button Error:", e);
                }
            };
            const onClick = () => input.click();
            addManagedListener(input, "change", onChange);
            addManagedListener(btn, "click", onClick);
            btn.append(input); return btn;
        }

        const addBtn = createButton({ width: "100%", padding: "10px", border: "1px dashed rgba(185,235,255,0.18)", marginTop: "4px" });
        addBtn.textContent = "+ Add image";
        addBtn.onclick = () => { slots.push({ image: "", mask: "" }); save(); scheduleRender(); };

        const syncState = () => {
            try {
                const raw = node.properties?.[KEY];
                slots = Array.isArray(raw) && raw.length ? raw.map(s => ({ image: normalizeStoredPath(s?.image), mask: normalizeStoredPath(s?.mask) })) : [{ image: "", mask: "" }];
                previewMode = normalizePreviewMode(node.properties?.[PREVIEW_MODE_KEY]);
            } catch (e) { slots = [{ image: "", mask: "" }]; }
        };

        node.onConfigure = function() {
            try { syncState(); scheduleRender(); } catch (e) {}
        };

        container.append(header, list, addBtn);
        node.addDOMWidget("hud_batch_images_mask_editor", "preview", container);
        
        const unwatchNodeColor = watchNodeColor(node, () => applyComfyUI_HUD_NodeStyle(container, styleOptions));
        if (typeof unwatchNodeColor === "function") nodeDisposers.push(unwatchNodeColor);

        const cleanup = () => {
            if (disposed) return;
            disposed = true;
            runDisposers(renderDisposers);
            runDisposers(nodeDisposers);
        };
        if (typeof node.__hudBatchMaskEditorCleanup === "function") {
            try { node.__hudBatchMaskEditorCleanup(); } catch (_) {}
        }
        node.__hudBatchMaskEditorCleanup = cleanup;
        const prevOnRemoved = node.onRemoved;
        node.onRemoved = function (...args) {
            try { cleanup(); } catch (_) {}
            if (typeof prevOnRemoved === "function") {
                return prevOnRemoved.apply(this, args);
            }
        };

        syncState();
        removeUpdateTriggerSurface();
        setTimeout(removeUpdateTriggerSurface, 10);
        scheduleRender();
        save();
    }
});
