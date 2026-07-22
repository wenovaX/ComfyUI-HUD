import { app } from "/scripts/app.js";
import { css, applyComfyUI_HUD_NodeStyle, watchNodeColor, log } from "./shared_styles.js";
import { mediaViewer } from "./media_viewer.js";
import {
    createGalleryState,
    setGalleryFromImages,
    mapCheckpointPayloadToEntries,
    buildMediaViewerItemsFromEntries,
    buildImageSignature,
} from "./preview_gallery_utils.js";
import { createPreviewDataController } from "./preview_data_controller.js";
import { createCheckpointFilterController } from "./preview_checkpoint_filter_controller.js";
import { createPreviewUI } from "./preview_ui_factory.js";
import { constrainNodeSize } from "./node_size_utils.js";
import { safeRegisterExtension } from "./safe_register.js";

const CHECKPOINT_PREVIEW_SIZE = {
    defaultWidth: 280,
    defaultHeight: 550,
};
safeRegisterExtension({
    name: "ComfyUI_HUD.CheckpointLoaderPreview",

    async nodeCreated(node) {
        if (node.comfyClass !== "ComfyUI_HUD_CheckpointLoaderPreview") return;

        const galleryState = createGalleryState();
        let expanded = false;
        let previewRequestId = 0;
        let isLoadingPreview = false;
        let hasResolvedPreview = false;

        const PREVIEW_SLOT_HEIGHT = 160;
        const CHECKPOINT_FILTERS = ["all", "sd15", "sdxl"];
        const FILTER_WIDGET_VALUES = {
            all: "All",
            sd15: "SD15",
            sdxl: "SDXL",
        };
        const FAVORITES_STORAGE_KEY = "hud.checkpoint.preview.favorites";
        let lastPreviewWidthPx = null;
        let lastSignatureVisible = null;
        let lastLabelMode = null;
        let lastLabelHtml = "";
        let lastLabelText = "";
        let currentCheckpointFilter = "all";
        let bookmarkOnlyEnabled = false;
        let lastCheckpointPayload = null;
        let filterWidgetCache = null;
        let bookmarkWidgetCache = null;

        const clearTimer = (timerId) => {
            if (timerId != null) clearTimeout(timerId);
            return null;
        };

        const COLOR_WHITE = "#fff";
        const COLOR_WHITE_SOFT_10 = "rgba(255,255,255,0.10)";
        const SHADOW_BLACK_30 = "rgba(0,0,0,0.30)";
        const SHADOW_BLACK_45 = "rgba(0,0,0,0.45)";
        const FILTER_SEGMENT_ACTIVE_STYLES = {
            all: {
                color: "#fff8e8",
                background: "linear-gradient(135deg, rgba(255,235,190,0.28), rgba(255,214,120,0.18))",
                boxShadow: "0 0 18px rgba(255,210,120,0.14), inset 0 1px 0 rgba(255,255,255,0.14), inset 0 0 18px rgba(255,240,190,0.10)",
            },
            sd15: {
                color: "#ffe8de",
                background: "linear-gradient(135deg, rgba(255,160,130,0.30), rgba(255,110,120,0.18))",
                boxShadow: "0 0 18px rgba(255,120,120,0.15), inset 0 1px 0 rgba(255,255,255,0.14), inset 0 0 18px rgba(255,190,170,0.10)",
            },
            sdxl: {
                color: "#eaf4ff",
                background: "linear-gradient(135deg, rgba(120,190,255,0.28), rgba(120,130,255,0.18))",
                boxShadow: "0 0 18px rgba(120,170,255,0.15), inset 0 1px 0 rgba(255,255,255,0.14), inset 0 0 18px rgba(185,220,255,0.10)",
            },
        };

        const setDisplay = (el, value) => {
            if (el.style.display !== value) el.style.display = value;
        };

        let refreshCanvasScheduled = false;
        const refreshCanvas = () => {
            if (refreshCanvasScheduled) return;
            refreshCanvasScheduled = true;
            requestAnimationFrame(() => {
                refreshCanvasScheduled = false;
                node.setDirtyCanvas?.(true, true);
                app.graph?.setDirtyCanvas?.(true, true);
            });
        };

        const isSameArray = (a, b) => (
            Array.isArray(a) &&
            Array.isArray(b) &&
            a.length === b.length &&
            a.every((value, index) => value === b[index])
        );

        const LOADING_PREVIEW_HTML = `
            <div style="font-size:16px; font-weight:700; color:#f5f5f5; letter-spacing:0.2px;">
                Loading preview...
            </div>
            <div style="margin-top:6px; font-size:12px; color:rgba(255,255,255,0.72);">
                Checking preview image near the checkpoint file.
            </div>
        `;
        function getNoPreviewGuideHtml(payload = null) {
            const formats = Array.isArray(payload?.supported_formats) && payload.supported_formats.length
                ? payload.supported_formats.join(" / ")
                : "png / webp / jpg / jpeg";
            const ckptName = String(payload?.checkpoint_name || "MyModel").trim() || "MyModel";
            return `
                <div style="font-size:16px; font-weight:700; color:#f5f5f5; letter-spacing:0.2px;">
                    No preview image
                </div>
                <div style="margin-top:4px; font-size:12px; color:rgba(255,255,255,0.76);">
                    Supported image formats: <span style="color:#ffffff; font-weight:700;">${formats}</span>
                </div>
                <div style="margin-top:6px; padding:6px 8px; border-radius:8px; background:rgba(255,255,255,0.07); border:1px solid ${COLOR_WHITE_SOFT_10}; font-family:Consolas, 'Courier New', monospace; font-size:10px; color:#ffe8a3;">
                    ${ckptName}/ folder images only
                </div>
                <button data-action="create-open-asset-hub" style="margin-top:10px; padding:8px 12px; border-radius:8px; border:1px solid rgba(255,255,255,0.22); background:rgba(255,255,255,0.1); color:#fff; font-size:11px; font-weight:700; cursor:pointer;">
                    Create Folder & Open Asset Hub
                </button>
            `;
        }

        function getEmptyCheckpointMessage() {
            const scope = currentCheckpointFilter === "all" ? "All" : currentCheckpointFilter.toUpperCase();

            if (bookmarkOnlyEnabled) {
                return `
                    <div style="font-size:16px; font-weight:700; color:#f5f5f5; letter-spacing:0.2px;">
                        No bookmarked checkpoints in <span style="color:#ffffff;">${scope}</span>
                    </div>
                    <div style="margin-top:6px; font-size:12px; color:rgba(255,255,255,0.74);">
                        Turn off <span style="color:#ffffff; font-weight:700;">bookmark_only</span> or add a bookmark in this filter.
                    </div>
                `;
            }

            if (currentCheckpointFilter === "all") {
                return `
                    <div style="font-size:16px; font-weight:700; color:#f5f5f5; letter-spacing:0.2px;">
                        No checkpoints available
                    </div>
                `;
            }

            return `
                <div style="font-size:16px; font-weight:700; color:#f5f5f5; letter-spacing:0.2px;">
                    No checkpoints in <span style="color:#ffffff;">${scope}</span>
                </div>
                <div style="margin-top:6px; font-size:12px; color:rgba(255,255,255,0.74);">
                    Only files starting with
                    <span style="color:#ffffff; font-weight:700;">${currentCheckpointFilter}_</span>
                    appear in this filter.
                </div>
            `;
        }

        // ===== Subtle rainbow background for the node =====
        const origDrawFg = node.onDrawForeground;
        node.onDrawForeground = function(ctx) {
            if (origDrawFg) origDrawFg.call(this, ctx);

            const w = this.size[0];
            const h = this.size[1];

            ctx.save();
            ctx.globalCompositeOperation = "screen";

            // Cache gradient per size to avoid allocating a new CanvasGradient every frame.
            const cache = this.__hudPreviewBgCache;
            let gradient = cache?.gradient;
            if (!gradient || cache.w !== w || cache.h !== h) {
                gradient = ctx.createLinearGradient(0, 0, w, 0);
                gradient.addColorStop(0.00, "#ff5f7a22");
                gradient.addColorStop(0.15, "#ffb86b22");
                gradient.addColorStop(0.30, "#ffe56a1a");
                gradient.addColorStop(0.45, "#5fffb21a");
                gradient.addColorStop(0.60, "#63d8ff22");
                gradient.addColorStop(0.80, "#7a8cff22");
                gradient.addColorStop(1.00, "#c46bff22");
                this.__hudPreviewBgCache = { w, h, gradient };
            }

            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, w, h);

            const topBand = ctx.createLinearGradient(0, 0, 0, Math.min(h * 0.30, 120));
            topBand.addColorStop(0.00, "rgba(255,255,255,0.11)");
            topBand.addColorStop(0.45, "rgba(255,255,255,0.04)");
            topBand.addColorStop(1.00, "rgba(255,255,255,0.00)");
            ctx.fillStyle = topBand;
            ctx.fillRect(0, 0, w, Math.min(h * 0.30, 120));

            ctx.globalCompositeOperation = "soft-light";
            const leftGlow = ctx.createRadialGradient(w * 0.12, h * 0.18, 0, w * 0.12, h * 0.18, w * 0.75);
            leftGlow.addColorStop(0.00, "rgba(255,185,110,0.10)");
            leftGlow.addColorStop(0.45, "rgba(120,210,255,0.06)");
            leftGlow.addColorStop(1.00, "rgba(0,0,0,0.00)");
            ctx.fillStyle = leftGlow;
            ctx.fillRect(0, 0, w, h);
            ctx.restore();
        };

        // rainbow animation
        // Inject CSS only once per page (multiple nodes would otherwise duplicate this giant block).
        const STYLE_ID = "hud-checkpoint-preview-style";
        let style = document.getElementById(STYLE_ID);
        if (!style) {
            style = document.createElement("style");
            style.id = STYLE_ID;

            style.innerHTML = `


        .hud-checkpoint-preview .preview-content {
            transform: translateZ(0) scale(1);
            transition: transform 0.18s ease;
            transform-origin: center center;
            will-change: transform;
            backface-visibility: hidden;
        }

        .hud-checkpoint-preview .preview-frame:hover .preview-content {
            transform: translateZ(0) scale(1.18);
        }

        .hud-checkpoint-preview .preview-frame.hover-disabled:hover .preview-content {
            transform: translateZ(0) scale(1);
        }

        .hud-checkpoint-preview .preview-content.no-hover-anim {
            transition: none !important;
        }

        .hud-checkpoint-preview .preview-hint {
            /* Keep hover feedback, but avoid animating paint-heavy properties (box-shadow/text-shadow/filter),
               which can stutter when the browser/page is zoomed. */
            transition:
                opacity 0.18s ease,
                transform 0.18s ease,
                border-color 0.18s ease,
                background 0.18s ease,
                color 0.18s ease;
        }

        /* Reduce repaint scope during hover-zoom (helps when browser/page is zoomed).
           NOTE: paint containment clips overflow, so disable it while expanded (hover-disabled). */
        .hud-checkpoint-preview .preview-frame:not(.hover-disabled) {
            contain: paint;
        }

        .hud-checkpoint-preview .preview-frame.hover-disabled {
            contain: none;
        }

        .hud-checkpoint-preview .preview-frame:hover .preview-hint {
            color: rgba(255,255,255,1);
            text-shadow:
                0 0 8px rgba(255,255,255,0.38),
                0 0 12px rgba(255,255,255,0.38);
            box-shadow:
                0 0 0 1px rgba(255,255,255,0.22) inset,
                0 8px 50px rgba(255,220,140,0.24);
            border-color: rgba(255,240,190,0.36) !important;
            filter: brightness(1.21);
        }

        .hud-checkpoint-preview .preview-frame:hover #hud-expand-hint {
            background: linear-gradient(180deg, rgba(28,24,18,0.86), rgba(18,16,14,0.58));
        }

        .hud-checkpoint-preview .preview-frame:hover #hud-toggle-hint {
            background: linear-gradient(135deg, rgba(255,240,200,0.22), rgba(255,220,150,0.12)) !important;
            border-color: rgba(255,230,160,0.35) !important;
            box-shadow:
                0 0 0 1px ${COLOR_WHITE_SOFT_10} inset,
                0 10px 28px rgba(255,210,120,0.18),
                0 0 18px rgba(255,220,140,0.22) !important;
            color: ${COLOR_WHITE} !important;
            text-shadow:
                0 0 10px rgba(255,255,255,0.32),
                0 0 18px rgba(255,220,120,0.22);
            transform: translateX(-50%) translateY(-2px) scale(1.04) !important;
            filter: brightness(1.21);
        }



        /* Native widget focus ring polish (only for this node). */
        .hud-checkpoint-preview-node select,
        .hud-checkpoint-preview-node input,
        .hud-checkpoint-preview-node textarea {
            outline: none !important;
            box-shadow: none !important;
        }

        .hud-checkpoint-preview-node select,
        .hud-checkpoint-preview-node input[type="text"],
        .hud-checkpoint-preview-node input[type="number"],
        .hud-checkpoint-preview-node textarea {
            border: 1px solid transparent !important;
        }

        .hud-checkpoint-preview-node select:focus,
        .hud-checkpoint-preview-node select:focus-visible,
        .hud-checkpoint-preview-node input:focus,
        .hud-checkpoint-preview-node input:focus-visible,
        .hud-checkpoint-preview-node textarea:focus,
        .hud-checkpoint-preview-node textarea:focus-visible {
            border-color: rgba(255, 255, 255, 1) !important;
            box-shadow: 0 0 0 1px #9c9eab !important;
        }

        /* ComfyUI frontend sometimes uses Tailwind "ring" utilities on wrappers (persistent box-shadow).
           Disable the always-on ring for this node, but keep a focus-within highlight. */
        .hud-checkpoint-preview-node .ring,
        .hud-checkpoint-preview-node [class*="ring-"] {
            --tw-ring-shadow: 0 0 #0000 !important;
            --tw-ring-offset-shadow: 0 0 #0000 !important;
            box-shadow: none !important;
            outline: none !important;
        }

        .hud-checkpoint-preview-node .ring:focus-within,
        .hud-checkpoint-preview-node [class*="ring-"]:focus-within {
            border-color: rgba(255, 255, 255, 1) !important;
            box-shadow: 0 0 0 1px #9c9eab !important;
        }


        `;

        document.head.appendChild(style);
        }

        const {
            container,
            signature,
            imageWrap,
            masterStatusCard,
            filterStatusCard,
            frame,
            contentWrap,
            img,
            favoriteBtn,
            loadingOverlay,
            loadingText,
            loadingSubText,
            expandedHint,
            toggleBtn,
            zoomBtn,
            editBtn,
            label,
            labelContent,
            updateFilterStatusCard: updateFilterStatusCardUI,
            bindButtonHoverEffects,
        } = createPreviewUI({
            css,
            PREVIEW_SLOT_HEIGHT,
            COLOR_WHITE_SOFT_10,
            SHADOW_BLACK_45,
            FILTER_SEGMENT_ACTIVE_STYLES,
            CHECKPOINT_FILTERS,
            LOADING_PREVIEW_HTML,
            onFilterSegmentClick: (key) => setCheckpointFilter(key, { ensureSelection: true, triggerPreview: true }),
            onFavoriteToggle: () => toggleCurrentCheckpointFavorite(),
        });

        bindButtonHoverEffects();

        function updateFilterStatusCard() {
            updateFilterStatusCardUI({ currentFilter: currentCheckpointFilter });
        }
        updateFilterStatusCard();

        const widget = node.addDOMWidget("preview", "preview", container);
        const releaseSizeConstraint = constrainNodeSize(node, {
            ...CHECKPOINT_PREVIEW_SIZE,
            widget,
            fitWidgetToNode: true,
            getWidgetOffset: () => ((node.widgets?.length || 0) * 30) + 20,
        });

        const styleOptions = {
            rootGradient: "linear-gradient(135deg, rgba(255,0,0,0.08), rgba(255,165,0,0.08), rgba(255,255,0,0.08), rgba(0,255,0,0.08), rgba(0,128,255,0.08), rgba(128,0,255,0.08))",
            headerGradient: "linear-gradient(90deg, rgba(255,0,0,0.10), rgba(255,165,0,0.10), rgba(255,255,0,0.10), rgba(0,255,0,0.10), rgba(0,128,255,0.10), rgba(128,0,255,0.10))",
            bodyWash: "linear-gradient(135deg, rgba(255,0,0,0.05), rgba(255,165,0,0.05), rgba(255,255,0,0.05), rgba(0,255,0,0.05), rgba(0,128,255,0.05), rgba(128,0,255,0.05))"
        };

        const cleanupColorWatch = watchNodeColor(node, () => {
            applyComfyUI_HUD_NodeStyle(node, styleOptions);
        });

        setTimeout(() => {
            const root = document.querySelector(`[data-node-id="${node.id}"] [data-testid="node-inner-wrapper"]`) ||
                         document.querySelector(`[data-testid="node-inner-wrapper"][data-node-id="${node.id}"]`) ||
                         container.closest('[data-testid="node-inner-wrapper"]');
            
            if (!root) return;

            const body = root.querySelector('[data-testid^="node-body-"]');

            // Scope widget CSS tweaks to this node only.
            root.classList.add("hud-checkpoint-preview-node");
            
            // Ensure style is applied at least once after a delay for complex nodes
            applyComfyUI_HUD_NodeStyle(node, styleOptions);

            // Add a tiny breathing room between the native widgets (ckpt dropdown and debug_log toggle).
            const findWidgetRowByLabelText = (labelText) => {
                const scope = body || root;
                const candidates = scope.querySelectorAll("div, label, span");
                let labelEl = null;
                for (const el of candidates) {
                    if (el.childElementCount !== 0) continue;
                    const text = (el.textContent || "").trim();
                    if (text === labelText) {
                        labelEl = el;
                        break;
                    }
                }
                if (!labelEl) return null;

                let cur = labelEl;
                for (let i = 0; i < 8 && cur; i++) {
                    // A "row" typically contains the label + an input/select/toggle element.
                    if (cur.querySelector && cur.querySelector("input, select, textarea, button")) return cur;
                    cur = cur.parentElement;
                }
                return null;
            };

            const ckptRow = findWidgetRowByLabelText("ckpt_name");
            const vaeRow = findWidgetRowByLabelText("vae_name");
            if (ckptRow) {
                ckptRow.style.marginBottom = "8px";
            }
            if (vaeRow) {
                vaeRow.style.borderBottom = "1px solid rgba(255,255,255,0.05)";
                vaeRow.style.paddingBottom = "4px";
            }
        }, 300);

        function updateMasterHUD() {
            const ckptWidget = node.widgets?.find(w => w.name === "ckpt_name");
            const vaeWidget = node.widgets?.find(w => w.name === "vae_name");
            
            const ckptEl = container.querySelector("#hud-master-ckpt-name");
            const vaeEl = container.querySelector("#hud-master-vae-name");

            if (ckptEl && ckptWidget) {
                const fullValue = String(ckptWidget.value || "");
                const name = fullValue.split(/[/\\]/).pop();
                ckptEl.textContent = name || "---";
                ckptEl.title = fullValue;
            }

            if (vaeEl && vaeWidget) {
                const val = String(vaeWidget.value || "");
                if (val === "Use checkpoint VAE") {
                    vaeEl.textContent = "INTERNAL (EMBEDDED)";
                    vaeEl.style.color = "#10b981";
                } else {
                    vaeEl.textContent = val.split(/[/\\]/).pop().toUpperCase();
                    vaeEl.style.color = "#fb923c";
                }
                vaeEl.title = val;
            }
            refreshCanvas();
        }

        const onWidgetChanged = node.onWidgetChanged;
        node.onWidgetChanged = function() {
            onWidgetChanged?.apply(this, arguments);
            updateMasterHUD();
        };

        // Aggressive widget monitoring for 1:1 instant matching
        const setupWidgetMonitoring = () => {
            node.widgets?.forEach(w => {
                if (w.name === "ckpt_name" || w.name === "vae_name") {
                    const oldCallback = w.callback;
                    w.callback = function() {
                        const result = oldCallback?.apply(this, arguments);
                        updateMasterHUD();
                        return result;
                    };
                }
            });
        };

        // Initial setup and periodic re-sync for safety
        setTimeout(() => {
            setupWidgetMonitoring();
            updateMasterHUD();
            updateImageWidth();
        }, 100);

        const hudSyncInterval = setInterval(() => {
            if (app.canvas.selected_nodes?.[node.id]) {
                updateMasterHUD();
            }
        }, 1000);

        function updateImageWidth() {
            const w = node.size?.[0] || 220;
            const targetWidth = w - 30;
            const px = targetWidth + "px";
            if (px === lastPreviewWidthPx) return;
            lastPreviewWidthPx = px;
            
            container.style.width = "100%";
            imageWrap.style.width = px;
            label.style.width = px;
            masterStatusCard.style.width = px;
            filterStatusCard.style.width = px;
        }

        let loadingHideTimer = null;
        let previewSwapTimer = null;
        function setLoading(state, text = "Loading checkpoint preview...") {
            isLoadingPreview = state;
            loadingText.textContent = text;

            if (state) {
                loadingHideTimer = clearTimer(loadingHideTimer);
                // If the node was showing the "No preview image" guide, the preview frame is hidden.
                // Loading overlay lives inside the frame, so we must switch to frame mode first.
                hideLabel();

                setDisplay(loadingOverlay, "flex");
                requestAnimationFrame(() => {
                    loadingOverlay.style.opacity = "1";
                });

                if (img.style.display !== "none") {
                    img.style.opacity = "0.45";
                    img.style.filter = "blur(1px)";
                }

                setDisplay(toggleBtn, "none");
                setDisplay(zoomBtn, "none");
                updateSignatureVisibility();
                return;
            }

            loadingOverlay.style.opacity = "0";
            loadingHideTimer = clearTimer(loadingHideTimer);
            loadingHideTimer = setTimeout(() => {
                if (!isLoadingPreview) {
                    setDisplay(loadingOverlay, "none");
                }
                loadingHideTimer = null;
            }, 220);

            img.style.opacity = "1";
            img.style.filter = "none";
            setDisplay(labelContent, "flex");
            updateSignatureVisibility();
        }

        updateImageWidth();

        const origResize = node.onResize;
        node.onResize = function(size) {
            if (origResize) origResize.call(this, size);
            updateImageWidth();
        };
        const preloadImg = new Image();

        function resetNodeSize() {
            if (!node.size) return;
            if (node.size[1] < CHECKPOINT_PREVIEW_SIZE.defaultHeight) {
                node.setSize([node.size[0], CHECKPOINT_PREVIEW_SIZE.defaultHeight]);
            }
        }

        function setPreviewLayout({
            labelHeight,
            labelOverflow,
            frameOverflow,
            frameZIndex,
            frameJustifyContent = null,
            frameAlignItems = null,
            imgHeight,
            objectFit,
            objectPosition,
            transform,
        }) {
            label.style.height = labelHeight;
            label.style.overflow = labelOverflow;
            frame.style.overflow = frameOverflow;
            frame.style.zIndex = frameZIndex;

            if (frameJustifyContent != null) {
                frame.style.justifyContent = frameJustifyContent;
            }
            if (frameAlignItems != null) {
                frame.style.alignItems = frameAlignItems;
            }

            img.style.height = imgHeight;
            img.style.objectFit = objectFit;
            img.style.objectPosition = objectPosition;
            img.style.transform = transform;
            img.style.opacity = "1";
        }

        function applyCollapsed() {
            setPreviewLayout({
                labelHeight: PREVIEW_SLOT_HEIGHT + "px",
                labelOverflow: "hidden",
                frameOverflow: "hidden",
                frameZIndex: "1",
                imgHeight: (PREVIEW_SLOT_HEIGHT - 24) + "px",
                objectFit: "cover",
                objectPosition: "center 40%",
                transform: "scale(1)",
            });
        }

        function applyExpanded() {
            setPreviewLayout({
                labelHeight: "auto",
                labelOverflow: "visible",
                frameOverflow: "visible",
                frameZIndex: "4",
                frameJustifyContent: "flex-start",
                frameAlignItems: "flex-start",
                imgHeight: "auto",
                objectFit: "contain",
                objectPosition: "top center",
                transform: "scale(1.01)",
            });
        }

        function updateSignatureVisibility() {
            const shouldShow = (isLoadingPreview || img.style.display !== "none");
            if (shouldShow === lastSignatureVisible) return;
            lastSignatureVisible = shouldShow;
            signature.style.display = shouldShow ? "block" : "none";
        }

        function setLabelState({ mode, html = "", text = "" }) {
            // mode: "html" | "text" | "hidden"
            setDisplay(label, "flex");

            // Avoid repeated DOM writes when state doesn't change.
            if (mode === lastLabelMode) {
                if (mode === "hidden") return;
                if (mode === "html" && html === lastLabelHtml) return;
                if (mode === "text" && text === lastLabelText) return;
            }

            if (mode === "hidden") {
                setDisplay(labelContent, "none");
                labelContent.innerHTML = "";
                labelContent.textContent = "";
                setDisplay(frame, "flex");

                lastLabelMode = "hidden";
                lastLabelHtml = "";
                lastLabelText = "";
                return;
            }

            setDisplay(labelContent, "flex");
            setDisplay(frame, "none");

            if (mode === "html") {
                labelContent.textContent = "";
                labelContent.innerHTML = html;

                lastLabelMode = "html";
                lastLabelHtml = html;
                lastLabelText = "";
                return;
            }

            labelContent.innerHTML = "";
            labelContent.textContent = text;
            lastLabelMode = "text";
            lastLabelHtml = "";
            lastLabelText = text;
        }

        function showTextLabel(text) {
            if (!text) {
                hideLabel();
                return;
            }

            setLabelState({ mode: "text", text });
        }

        function hideLabel() {
            setLabelState({ mode: "hidden" });
        }

        function syncPreviewControls() {
            if (img.style.display === "none" || isLoadingPreview) {
                setDisplay(toggleBtn, "none");
                setDisplay(zoomBtn, "none");
                setDisplay(editBtn, "none");
                setDisplay(expandedHint, "none");
                return;
            }

            setDisplay(toggleBtn, "flex");
            setDisplay(zoomBtn, "flex");
            setDisplay(editBtn, "flex");
            zoomBtn.textContent = galleryState.images.length > 1
                ? `View ${galleryState.images.length} photos`
                : "View photo";
            zoomBtn.title = "Open preview viewer";
            editBtn.textContent = "Edit preview photos";
            editBtn.title = "Edit previews in Asset Hub";

            if (expanded) {
                toggleBtn.textContent = "Click image to close";
                setDisplay(expandedHint, "flex");
                return;
            }

            toggleBtn.textContent = "Click image to expand";
            setDisplay(expandedHint, "none");
        }

        function updateUI() {
            updateSignatureVisibility();

            if (img.style.display === "none") {
                if (!isLoadingPreview) {
                    syncPreviewControls();
                    if (hasResolvedPreview) {
                        setLabelState({ mode: "html", html: getNoPreviewGuideHtml(lastCheckpointPayload) });
                        bindNoPreviewActions();
                    } else {
                        setLabelState({ mode: "html", html: LOADING_PREVIEW_HTML });
                    }
                }
                return;
            }

            if (!isLoadingPreview) {
                syncPreviewControls();
                hideLabel();
            }
        }

        // Coalesce repeated UI updates into a single paint. This reduces layout churn when
        // multiple state flips happen back-to-back (e.g. loading -> resolved -> fade).
        let uiUpdateScheduled = false;
        function scheduleUpdateUI() {
            if (uiUpdateScheduled) return;
            uiUpdateScheduled = true;
            requestAnimationFrame(() => {
                uiUpdateScheduled = false;
                updateUI();
            });
        }

        // Similar to scheduleUpdateUI: coalesce preview refresh requests (widget callbacks can fire in bursts).
        let previewUpdateScheduled = false;
        function scheduleUpdatePreview() {
            if (previewUpdateScheduled) return;
            previewUpdateScheduled = true;
            requestAnimationFrame(() => {
                previewUpdateScheduled = false;
                updatePreview();
            });
        }

        function snapHoverOff() {
            contentWrap.classList.add("no-hover-anim");
            // Match the CSS transform shape to avoid a one-frame "double transform" feeling.
            contentWrap.style.transform = "translateZ(0) scale(1)";

            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    contentWrap.classList.remove("no-hover-anim");
                    contentWrap.style.transform = "";
                });
            });
        }        

        function syncHoverState() {
            if (expanded) {
                frame.classList.add("hover-disabled");
            } else {
                frame.classList.remove("hover-disabled");
            }
        }

        function playExpandFade() {
            contentWrap.style.opacity = "0.92";
            contentWrap.style.transform = "translateY(8px) scale(0.992)";
            requestAnimationFrame(() => {
                contentWrap.style.transition = "transform 0.38s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.22s ease";
                contentWrap.style.opacity = "1";
                contentWrap.style.transform = "translateY(0) scale(1)";
            });
        }

        function toggle() {
            if (isLoadingPreview) return;

            snapHoverOff();

            expanded = !expanded;
            expanded ? applyExpanded() : applyCollapsed();
            syncHoverState();
            scheduleUpdateUI();

            if (expanded) {
                playExpandFade();
            }
        }

        function reset(shouldResize = true) {
            expanded = false;
            applyCollapsed();
            syncHoverState();
            if (shouldResize) {
                resetNodeSize();
            }
        }

        function clearPreviewState() {
            img.style.display = "none";
            setGallery([]);
        }

        // Gallery helpers
        function setGallery(images, entries = null) {
            setGalleryFromImages(galleryState, images, entries);
        }

        async function setCheckpointDefaultPreviewImage(rel) {
            const ckptName = getCurrentCheckpointName();
            if (!ckptName || !rel) return false;
            const response = await fetch("/hud/checkpoint-preview/set-default", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ckpt: ckptName, rel }),
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok || !payload?.success) {
                alert(payload?.error || "Failed to set representative image");
                return { ok: false };
            }
            if (payload?.payload) {
                lastCheckpointPayload = payload.payload;
                const mapped = mapCheckpointPayloadToEntries(payload.payload);
                galleryState.lastFetchedEntries = mapped.entries;
                setGallery(mapped.images, mapped.entries);
                return {
                    ok: true,
                    mapped,
                    viewerItems: buildMediaViewerItemsFromEntries(mapped.entries),
                };
            }
            return { ok: true };
        }

        function openGalleryInMediaViewer(images, startIndex = 0) {
            if (!Array.isArray(images) || !images.length) return;
            const entries = Array.isArray(galleryState.entries) && galleryState.entries.length === images.length
                ? galleryState.entries
                : images.map((url) => ({ url }));

            const items = buildMediaViewerItemsFromEntries(entries.map((entry, index) => ({
                ...(entry || {}),
                url: String(entry?.url || images[index] || ""),
            })));
            const safeIndex = Math.max(0, Math.min(startIndex, items.length - 1));
            mediaViewer.setDeleteEnabled(false);
            mediaViewer.show(safeIndex, items, "", {
                onHide: () => {
                    const pendingRel = String(galleryState.pendingPrimaryRelOnViewerClose || "");
                    const shouldRefresh = galleryState.pendingRefreshOnViewerClose || !!pendingRel;
                    galleryState.pendingRefreshOnViewerClose = false;
                    galleryState.pendingPrimaryRelOnViewerClose = "";
                    if (!shouldRefresh) return;

                    const run = async () => {
                        if (pendingRel) {
                            await setCheckpointDefaultPreviewImage(pendingRel);
                        }
                        const widget = getCkptWidget();
                        const base = getBaseFromWidget(widget);
                        if (base) previewDataController.clearCache(base);
                        scheduleUpdatePreview();
                    };
                    run().catch((err) => console.error(err));
                },
                getActions: ({ item }) => {
                    const rel = String(item?.hud_preview_rel || "");
                    const isPrimary = rel
                        ? (galleryState.pendingPrimaryRelOnViewerClose
                            ? galleryState.pendingPrimaryRelOnViewerClose === rel
                            : !!item?.hud_preview_default)
                        : !!item?.hud_preview_default;
                    const canSet = !!rel && !isPrimary;
                    return [{
                        label: isPrimary ? "Primary" : "Set Primary",
                        title: isPrimary
                            ? "Current primary image"
                            : "Set current image as primary",
                        className: isPrimary ? "toggle-on" : "toggle-off",
                        disabled: !canSet,
                        onClick: async (ctx) => {
                            if (!canSet) return;
                            galleryState.pendingPrimaryRelOnViewerClose = rel;
                            galleryState.pendingRefreshOnViewerClose = true;
                            const viewerItems = Array.isArray(ctx?.viewer?.items) ? ctx.viewer.items : [];
                            viewerItems.forEach((it) => { it.hud_preview_default = String(it?.hud_preview_rel || "") === rel; });
                            ctx?.viewer?.updateActions?.(ctx?.viewer?.items?.[ctx?.viewer?.currentIndex]);
                        },
                    }];
                },
            });
        }

        const previewDataController = createPreviewDataController({
            galleryState,
            mapCheckpointPayloadToEntries,
            buildImageSignature,
            getCurrentCheckpointName,
            getCkptWidget,
            getBaseFromWidget,
            scheduleUpdatePreview,
            onPayload: (payload) => {
                lastCheckpointPayload = payload || null;
            },
        });

        let ckptWidgetCache = null;
        function getCkptWidget() {
            const widgets = node.widgets;
            if (!widgets) return null;

            if (ckptWidgetCache && widgets.includes(ckptWidgetCache)) {
                return ckptWidgetCache;
            }

            ckptWidgetCache = widgets.find(w => w.name === "ckpt_name") || null;
            return ckptWidgetCache;
        }

        function getFilterWidget() {
            const widgets = node.widgets;
            if (!widgets) return null;

            if (filterWidgetCache && widgets.includes(filterWidgetCache)) {
                return filterWidgetCache;
            }

            filterWidgetCache = widgets.find(w => w.name === "filter_mode") || null;
            return filterWidgetCache;
        }

        function getBookmarkWidget() {
            const widgets = node.widgets;
            if (!widgets) return null;

            if (bookmarkWidgetCache && widgets.includes(bookmarkWidgetCache)) {
                return bookmarkWidgetCache;
            }

            bookmarkWidgetCache = widgets.find(w => w.name === "bookmark_only") || null;
            return bookmarkWidgetCache;
        }

        let checkpointFilterController = null;

        function syncFilterStateFromWidget(widget = getFilterWidget()) {
            checkpointFilterController?.syncFilterStateFromWidget(widget);
        }

        function syncBookmarkOnlyFromWidget(widget = getBookmarkWidget()) {
            checkpointFilterController?.syncBookmarkOnlyFromWidget(widget);
        }

        function getCurrentCheckpointName(widget = getCkptWidget()) {
            return checkpointFilterController?.getCurrentCheckpointName(widget) || "";
        }

        function updateFavoriteButton() {
            checkpointFilterController?.updateFavoriteButton();
        }

        function toggleCurrentCheckpointFavorite() {
            checkpointFilterController?.toggleCurrentCheckpointFavorite();
        }

        function setCheckpointFilter(filterKey, options = {}) {
            return checkpointFilterController?.setCheckpointFilter(filterKey, options) || { selectionChanged: false, isEmpty: false };
        }

        function getCheckpointValues(widget) {
            return checkpointFilterController?.getCheckpointValues(widget) || [];
        }

        function filterCheckpointValues(values) {
            return checkpointFilterController?.filterCheckpointValues(values) || values;
        }

        function notifyCheckpointWidgetChanged(widget = getCkptWidget()) {
            checkpointFilterController?.notifyCheckpointWidgetChanged(widget);
        }

        function applyCheckpointFilter(widget = getCkptWidget(), options = {}) {
            return checkpointFilterController?.applyCheckpointFilter(widget, options) || { selectionChanged: false, isEmpty: false };
        }

        checkpointFilterController = createCheckpointFilterController({
            app,
            node,
            favoriteBtn,
            filters: CHECKPOINT_FILTERS,
            filterWidgetValues: FILTER_WIDGET_VALUES,
            favoritesStorageKey: FAVORITES_STORAGE_KEY,
            isSameArray,
            refreshCanvas,
            getCkptWidget,
            getFilterWidget,
            getBookmarkWidget,
            onFilterStateChange: ({ filter, bookmarkOnly }) => {
                currentCheckpointFilter = filter;
                bookmarkOnlyEnabled = bookmarkOnly;
                updateFilterStatusCard();
            },
            onPreviewRequested: () => {
                scheduleUpdatePreview();
            },
        });

        function getBaseFromWidget(widget) {
            const v = String(widget?.value ?? "");
            const sep = Math.max(v.lastIndexOf("/"), v.lastIndexOf("\\"));
            const dot = v.lastIndexOf(".");
            return (dot > sep) ? v.slice(0, dot) : v;
        }

        async function openCheckpointAssetHub({ createIfMissing = false, readOnly = false } = {}) {
            const ckptName = getCurrentCheckpointName();
            if (!ckptName) return;

            let payload = null;
            if (createIfMissing) {
                const res = await fetch("/hud/checkpoint-preview/prepare", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ ckpt: ckptName }),
                });
                payload = await res.json();
                if (!res.ok || !payload?.success) {
                    alert(payload?.error || "Failed to prepare checkpoint preview folder");
                    return;
                }
            } else {
                const res = await fetch(`/hud/checkpoint-preview/list?ckpt=${encodeURIComponent(ckptName)}`, { cache: "no-store" });
                payload = await res.json();
            }

            const folderPath = String(payload?.folder_path || "").trim();
            if (!folderPath) return;

            try {
                await fetch("/hud/file-manager/bookmarks/hidden", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ path: folderPath }),
                });
            } catch (_) {}

            const mod = await import("./asset_hub_browser.js");
            const fb = mod?.fileBrowser;
            if (!fb) return;
            const supportedFormats = Array.isArray(payload?.supported_formats)
                ? payload.supported_formats
                : null;
            fb.show({
                readOnly,
                fileExtensions: supportedFormats,
                mode: "checkpoint_preview_edit",
                checkpointName: ckptName,
                modeHintText: "Edit the images shown at the top. Drop images here or use Add Images.",
            });
            await fb.loadPath(folderPath);
            previewDataController.startWatch(fb, ckptName);
        }

        function bindNoPreviewActions() {
            const createBtn = labelContent.querySelector('[data-action="create-open-asset-hub"]');
            if (!createBtn) return;
            createBtn.onclick = async (e) => {
                e.preventDefault();
                e.stopPropagation();
                try {
                    await openCheckpointAssetHub({ createIfMissing: true, readOnly: false });
                } catch (err) {
                    console.error(err);
                    alert("Failed to open Asset Hub");
                }
            };
        }

        function finishPreviewLoad({ clear = false, labelText = "", labelHtml = "" } = {}) {
            if (clear) {
                clearPreviewState();
            }

            setLoading(false);

            if (labelHtml) {
                syncPreviewControls();
                setLabelState({ mode: "html", html: labelHtml });
                bindNoPreviewActions();
                return;
            }

            if (labelText) {
                syncPreviewControls();
                showTextLabel(labelText);
                return;
            }

            scheduleUpdateUI();
        }

        async function updatePreview() {
            const widget = getCkptWidget();
            if (!widget) return;

            const visibleValues = filterCheckpointValues(getCheckpointValues(widget));
            if (!visibleValues.length) {
                previewRequestId++;
                previewSwapTimer = clearTimer(previewSwapTimer);
                preloadImg.onload = null;
                preloadImg.onerror = null;
                hasResolvedPreview = true;
                clearPreviewState();
                reset(false);
                finishPreviewLoad({ clear: true, labelHtml: getEmptyCheckpointMessage() });
                updateFavoriteButton();
                return;
            }

            const requestId = ++previewRequestId;
            const base = getBaseFromWidget(widget);

            previewSwapTimer = clearTimer(previewSwapTimer);

            // Keep the preview visually collapsed while loading, but don't force a node resize here.
            // That height snap is what makes the node appear to jump upward on every load.
            reset(false);
            setLoading(true, "Loading checkpoint preview...");

            const images = await previewDataController.collectGalleryImagesCached(base, () => requestId !== previewRequestId);

            if (requestId !== previewRequestId) return;
            hasResolvedPreview = true;

            if (!images.length) {
                finishPreviewLoad({ clear: true });
                return;
            }

            setGallery(images, galleryState.lastFetchedEntries);
            preloadImg.onload = null;
            preloadImg.onerror = null;

            preloadImg.onload = () => {
                if (requestId !== previewRequestId) return;

                img.style.opacity = "0";

                previewSwapTimer = clearTimer(previewSwapTimer);
                previewSwapTimer = setTimeout(() => {
                    if (requestId !== previewRequestId) return;

                    img.onload = null;
                    img.onerror = null;
                    img.src = images[0];
                    img.style.display = "block";

                    updateImageWidth();
                    finishPreviewLoad();
                    previewSwapTimer = null;

                    if (widget && widget.value) {
                        log("Preview loaded: " + widget.value, "Checkpoint Preview");
                    }

                    requestAnimationFrame(() => {
                        img.style.opacity = "1";
                    });
                }, 120);
            };

            preloadImg.onerror = () => {
                if (requestId !== previewRequestId) return;

                previewSwapTimer = clearTimer(previewSwapTimer);

                finishPreviewLoad({ clear: true, labelText: "Preview load failed" });
            };

            preloadImg.src = images[0];
        }

        img.title = "Click to expand or collapse the preview";
        img.onclick = (e) => {
            e?.stopPropagation();
            requestAnimationFrame(() => {
                toggle();
            });
        };

        zoomBtn.onclick = async (e) => {
            e.stopPropagation();
            if (isLoadingPreview) return;

            const widget = getCkptWidget();
            if (!widget) return;

            const base = getBaseFromWidget(widget);

            if (!galleryState.images.length) {
                const images = await previewDataController.collectGalleryImagesCached(base);
                setGallery(images, galleryState.lastFetchedEntries);
            }

            if (!galleryState.images.length) return;
            openGalleryInMediaViewer(galleryState.images, 0);
        };

        editBtn.onclick = async (e) => {
            e.stopPropagation();
            if (isLoadingPreview) return;
            try {
                await openCheckpointAssetHub({ createIfMissing: false, readOnly: false });
            } catch (err) {
                console.error(err);
                alert("Failed to open Asset Hub");
            }
        };

        const origRemoved = node.onRemoved;
        node.onRemoved = function () {
            releaseSizeConstraint();
            previewDataController.stopWatch();
            clearInterval(hudSyncInterval);
            clearInterval(interval);

            try {
                // (Removed) legacy expanded overlay was unused.
            } catch (_) {}

            try {
                previewSwapTimer = clearTimer(previewSwapTimer);
            } catch (_) {}

            try {
                loadingHideTimer = clearTimer(loadingHideTimer);
            } catch (_) {}

            try {
                if (typeof cleanupColorWatch === "function") cleanupColorWatch();
            } catch (_) {}

            if (origRemoved) {
                return origRemoved.apply(this, arguments);
            }
        };

        setTimeout(scheduleUpdatePreview, 400);

        const interval = setInterval(() => {
            const ckptWidget = getCkptWidget();
            if (!ckptWidget) return;

            if (!checkpointFilterController.hasCheckpointValueSource() && ckptWidget.options) {
                checkpointFilterController.captureCheckpointValueSource(ckptWidget);
                syncFilterStateFromWidget();
                const bookmarkWidget = getBookmarkWidget();
                if (bookmarkWidget) {
                    bookmarkWidget.value = false;
                    syncBookmarkOnlyFromWidget(bookmarkWidget);
                } else {
                    syncBookmarkOnlyFromWidget();
                }
                const result = applyCheckpointFilter(ckptWidget, { ensureSelection: true });
                if (result.selectionChanged) {
                    notifyCheckpointWidgetChanged(ckptWidget);
                }
                updateFavoriteButton();
                scheduleUpdatePreview();
            }

            if (!ckptWidget._patched) {
                const orig = ckptWidget.callback;
                ckptWidget.callback = function () {
                    if (orig) orig.apply(this, arguments);
                    applyCheckpointFilter(ckptWidget);
                    updateFavoriteButton();
                    scheduleUpdatePreview();
                };
                ckptWidget._patched = true;
            }

            const filterWidget = getFilterWidget();
            if (filterWidget && !filterWidget._patched) {
                syncFilterStateFromWidget(filterWidget);
                const orig = filterWidget.callback;
                filterWidget.callback = function () {
                    if (orig) orig.apply(this, arguments);
                    syncFilterStateFromWidget(filterWidget);
                    const result = applyCheckpointFilter(ckptWidget, { ensureSelection: true });
                    if (result.selectionChanged) {
                        notifyCheckpointWidgetChanged(ckptWidget);
                    }
                    updateFavoriteButton();
                    if (result.selectionChanged || result.isEmpty) {
                        scheduleUpdatePreview();
                    }
                };
                filterWidget._patched = true;
            }
            const bookmarkWidget = getBookmarkWidget();
            if (bookmarkWidget && !bookmarkWidget._patched) {
                syncBookmarkOnlyFromWidget(bookmarkWidget);
                const orig = bookmarkWidget.callback;
                bookmarkWidget.callback = function () {
                    if (orig) orig.apply(this, arguments);
                    syncBookmarkOnlyFromWidget(bookmarkWidget);
                    const result = applyCheckpointFilter(ckptWidget, { ensureSelection: true });
                    if (result.selectionChanged) {
                        notifyCheckpointWidgetChanged(ckptWidget);
                    }
                    updateFavoriteButton();
                    if (result.selectionChanged || result.isEmpty) {
                        scheduleUpdatePreview();
                    }
                };
                bookmarkWidget._patched = true;
            }

            if (ckptWidget._patched && (!filterWidget || filterWidget._patched) && (!bookmarkWidget || bookmarkWidget._patched)) {
                // Stop polling once we've successfully patched the widgets.
                clearInterval(interval);
            }
        }, 300);
    }
});





