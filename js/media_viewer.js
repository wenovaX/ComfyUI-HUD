/**
 * HUD Media Viewer Library
 * Premium singleton viewer with zoom, pan, and cinematic transitions.
 */

const css = (el, styles) => {
    for (const [prop, val] of Object.entries(styles)) {
        if (prop === "className") el.className = val;
        else el.style[prop] = val;
    }
    return el;
};

class HUDMediaViewer {
    constructor() {
        this.overlay = null;
        this.container = null;
        this.mediaEl = null;
        this.infoBox = null;
        this.nameLabel = null;
        this.counterLabel = null;
        this.onHide = null;
        
        this.items = [];
        this.currentIndex = -1;
        this.currentPath = "";
        this.deleteEnabled = true;
        this.options = {};
        this.customActionEls = [];
        
        this.isZoomed = false;
        this.zoomScale = 2;
        this.panPos = { x: 0, y: 0 };
        this.startPanPos = { x: 0, y: 0 };
        this.isDragging = false;
        this.keyListenerAttached = false;
        this.pointerListenersAttached = false;
        this.boundMouseMove = null;
        this.boundMouseUp = null;
        this.showOpacityRaf = null;
        this.mediaIndices = [];
        this.currentMediaCursor = -1;
        
        this.init();
    }

    init() {
        if (this.overlay) return;
        this.ensureComfyOverlayPriority();

        // Global Styles for Viewer
        const style = document.createElement("style");
        style.textContent = `
            .hud-mv-overlay {
                position: fixed; top: 0; left: 0; width: 100%; height: 100%;
                background: radial-gradient(circle, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.98) 100%);
                z-index: 20000; display: none;
                flex-direction: column; align-items: center; justify-content: center;
                opacity: 0; transition: opacity 0.3s ease; backdrop-filter: blur(10px);
                user-select: none;
            }
            .hud-mv-container {
                position: relative; width: 100%; height: 100%; display: flex;
                align-items: center; justify-content: center; overflow: hidden;
                cursor: zoom-in;
            }
            .hud-mv-container.zoomed { cursor: zoom-out; }
            .hud-mv-container.dragging { cursor: grabbing !important; }
            .hud-mv-media {
                max-width: 80%; max-height: 70%; border-radius: 8px;
                box-shadow: 0 0 80px rgba(0,0,0,1); border: 1px solid rgba(255,255,255,0.08);
                transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                transform-origin: center;
                will-change: transform;
            }
            .hud-mv-container.zoomed .hud-mv-media {
                max-width: none; max-height: none;
                transition: none !important;
            }
            .hud-mv-container.dragging .hud-mv-media {
                transition: none !important;
            }
            .hud-mv-nav {
                position: absolute; top: 0; height: 100%; width: 180px;
                display: flex; align-items: center; justify-content: center;
                font-size: 120px; color: rgba(0, 255, 204, 0.4); cursor: pointer;
                transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1); z-index: 20002;
                text-shadow: 0 0 30px rgba(0,0,0,1), 0 0 60px rgba(0,0,0,1);
                backdrop-filter: blur(4px) brightness(0.6);
            }
            .hud-mv-nav:hover { 
                color: #00ffcc; 
                width: 240px;
                backdrop-filter: blur(8px) brightness(0.3);
                text-shadow: 0 0 40px rgba(0, 255, 204, 0.6), 0 0 80px rgba(0,0,0,1);
                box-shadow: inset 0 0 100px rgba(0, 255, 204, 0.1);
            }
            .hud-mv-nav.prev { 
                left: 0; 
                background: linear-gradient(90deg, rgba(0,255,204,0.15) 0%, rgba(0,0,0,0.8) 2%, rgba(0,0,0,0.4) 60%, transparent 100%); 
                border-right: 1px solid rgba(0, 255, 204, 0.05);
            }
            .hud-mv-nav.next { 
                right: 0; 
                background: linear-gradient(-90deg, rgba(0,255,204,0.15) 0%, rgba(0,0,0,0.8) 2%, rgba(0,0,0,0.4) 60%, transparent 100%); 
                border-left: 1px solid rgba(0, 255, 204, 0.05);
            }
            
            .hud-mv-help-box { position: absolute; top: 54px; left: 50%; transform: translateX(-50%); display: flex; flex-direction: column; align-items: center; gap: 8px; pointer-events: none; }
            .hud-mv-help-line { background: rgba(0,0,0,0.7); backdrop-filter: blur(2px); color: rgba(255,255,255,0.84); padding: 6px 14px; border-radius: 20px; font-size: 11px; font-weight: 700; letter-spacing: 0.4px; border: 1px solid rgba(255,255,255,0.16); }
            .hud-mv-key { background: #00ffcc; color: #000; padding: 1px 6px; border-radius: 4px; font-weight: 900; margin: 0 4px; font-size: 10px; }

            .hud-mv-info {
                position: absolute; bottom: 60px; display: flex; flex-direction: column;
                align-items: center; gap: 12px; pointer-events: none; z-index: 20005;
            }
            .hud-mv-name { font-weight: 900; font-size: 22px; color: white; text-shadow: 0 2px 10px black; }
            .hud-mv-counter { 
                font-size: 16px; color: #00ffcc; font-weight: 800; letter-spacing: 3px;
                background: rgba(0, 255, 204, 0.1); padding: 6px 20px; border-radius: 8px;
                border: 1px solid rgba(0, 255, 204, 0.2);
            }
            .hud-mv-actions {
                position: absolute;
                top: 12px;
                left: 50%;
                transform: translateX(-50%);
                display: flex;
                gap: 8px;
                z-index: 20010;
            }
            .hud-mv-action {
                border: 1px solid rgba(255,255,255,0.45);
                border-radius: 999px;
                background: rgba(8, 10, 16, 0.92);
                color: #fff;
                font-size: 12px;
                font-weight: 900;
                padding: 9px 14px;
                cursor: pointer;
                backdrop-filter: blur(3px);
                transition: 0.2s ease;
                box-shadow: 0 8px 22px rgba(0,0,0,0.55);
                text-shadow: 0 1px 3px rgba(0,0,0,0.65);
            }
            .hud-mv-action:hover { transform: translateY(-1px); border-color: rgba(255,255,255,0.45); }
            .hud-mv-action.primary { border-color: rgba(0,255,204,0.55); color: #00ffcc; background: rgba(0,255,204,0.12); }
            .hud-mv-action.badge { border-color: rgba(255,224,150,0.62); color: #ffe9b0; background: rgba(90,62,12,0.50); cursor: default; }
            .hud-mv-action.badge:hover { transform: none; }
            .hud-mv-action:disabled { opacity: 0.45; cursor: not-allowed; transform: none; }
            .hud-mv-action.toggle-off {
                border-color: rgba(255, 255, 255, 0.46);
                color: #ffffff;
                background: linear-gradient(135deg, rgba(34, 40, 56, 0.95), rgba(14, 20, 30, 0.94));
            }
            .hud-mv-action.toggle-on {
                border-color: rgba(0, 255, 204, 0.95);
                color: #00110d;
                text-shadow: none;
                background: linear-gradient(135deg, rgba(42,255,214,0.98), rgba(0,218,173,0.96));
                box-shadow: 0 0 0 1px rgba(0,255,204,0.32), 0 12px 28px rgba(0, 82, 68, 0.6), 0 0 22px rgba(0,255,204,0.24);
            }

            @keyframes hudMvSwitch {
                0% { opacity: 0; transform: scale(0.98); }
                100% { opacity: 1; transform: scale(1); }
            }
        `;
        document.head.appendChild(style);

        // Overlay
        this.overlay = css(document.createElement("div"), { className: "hud-mv-overlay" });
        // Keep an inline visibility state so key handlers can reliably detect hidden/open.
        this.overlay.style.display = "none";

        // Container
        this.container = css(document.createElement("div"), { className: "hud-mv-container" });
        this.overlay.appendChild(this.container);

        // Media Element Placeholder
        this.mediaEl = document.createElement("img");
        this.mediaEl.className = "hud-mv-media";
        this.container.appendChild(this.mediaEl);

        // Navigation
        this.prevBtn = css(document.createElement("div"), { className: "hud-mv-nav prev" });
        this.prevBtn.innerHTML = "‹";
        this.prevBtn.onclick = (e) => {
            e.stopPropagation();
            this.navigate(-1);
        };
        
        this.nextBtn = css(document.createElement("div"), { className: "hud-mv-nav next" });
        this.nextBtn.innerHTML = "›";
        this.nextBtn.onclick = (e) => {
            e.stopPropagation();
            this.navigate(1);
        };
        
        this.overlay.appendChild(this.prevBtn);
        this.overlay.appendChild(this.nextBtn);

        // Multi-line Help HUD
        this.helpBox = document.createElement("div");
        this.helpBox.className = "hud-mv-help-box";
        this.overlay.appendChild(this.helpBox);
        this.updateHelp();

        this.actionsBox = document.createElement("div");
        this.actionsBox.className = "hud-mv-actions";
        this.overlay.appendChild(this.actionsBox);

        this.infoBox = css(document.createElement("div"), { className: "hud-mv-info" });
        this.nameLabel = css(document.createElement("div"), { className: "hud-mv-name" });
        this.counterLabel = css(document.createElement("div"), { className: "hud-mv-counter" });
        this.infoBox.append(this.nameLabel, this.counterLabel);
        this.overlay.appendChild(this.infoBox);

        this.dragDistanceSq = 0;
        this.dragStartX = 0;
        this.dragStartY = 0;

        // Removed updatePan loop for zero-lag panning

        this.overlay.onmousedown = (e) => {
            if (e.button !== 0) return;
            this.dragStartX = e.clientX;
            this.dragStartY = e.clientY;
            this.dragDistanceSq = 0;

            if (this.isZoomed) {
                e.preventDefault();
                this.isDragging = true;
                this.startPanPos = { ...this.panPos };
                this.container.classList.add("dragging");
            }
        };

        this.boundMouseMove = (e) => {
            if (this.isDragging) {
                const dx = (e.clientX - this.dragStartX) / this.zoomScale;
                const dy = (e.clientY - this.dragStartY) / this.zoomScale;
                this.panPos.x = this.startPanPos.x + dx;
                this.panPos.y = this.startPanPos.y + dy;
                this.updateTransform();
            }
            const ddx = e.clientX - this.dragStartX;
            const ddy = e.clientY - this.dragStartY;
            this.dragDistanceSq = (ddx * ddx) + (ddy * ddy);
        };

        this.boundMouseUp = () => {
            if (this.isDragging) {
                this.isDragging = false;
                this.container.classList.remove("dragging");
            }
        };

        this.overlay.onclick = (e) => {
            if (this.dragDistanceSq > 100) return;
            
            if (e.target === this.mediaEl) {
                this.toggleZoom(e);
            } else {
                this.hide();
            }
        };

        document.body.appendChild(this.overlay);

        // Keyboard Listener
        this._onKey = (e) => {
            if (!this.overlay) return;
            if (getComputedStyle(this.overlay).display === "none") return;
            if (this.isComfyBlockingOverlayActive()) return;

            let handled = true;
            if (e.key === "Escape") {
                this.hide();
            } else if (
                e.key === "ArrowRight" ||
                (!e.ctrlKey && !e.metaKey && !e.altKey && (e.key === "d" || e.key === "l"))
            ) {
                this.navigate(1);
            } else if (
                e.key === "ArrowLeft" ||
                (!e.ctrlKey && !e.metaKey && !e.altKey && (e.key === "a" || e.key === "h"))
            ) {
                this.navigate(-1);
            } else if (e.key === " " || e.key === "Enter") {
                this.toggleZoom();
            } else if (e.key === "Delete" && this.deleteEnabled) {
                this.deleteCurrent();
            } else {
                handled = false;
            }

            if (handled) {
                e.stopImmediatePropagation();
                e.preventDefault();
            }
        };
        // Keyboard listener is attached only while viewer is visible.
    }

    isComfyBlockingOverlayActive() {
        const selectors = [
            ".p-dialog-mask",
            ".p-confirm-dialog",
            ".p-dynamicdialog",
            ".p-confirmpopup",
            "[data-pc-name='dialog']",
            "[data-pc-name='confirmdialog']",
            "[data-pc-name='dynamicdialog']",
            "[data-pc-name='confirmpopup']",
            "[role='alertdialog']",
            "[role='dialog'][aria-modal='true']",
        ];

        return selectors.some((selector) =>
            Array.from(document.querySelectorAll(selector)).some((element) => {
                if (!(element instanceof HTMLElement)) return false;
                if (this.overlay && this.overlay.contains(element)) return false;

                const style = window.getComputedStyle(element);
                if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity || "1") === 0) {
                    return false;
                }

                const rect = element.getBoundingClientRect();
                return rect.width > 0 && rect.height > 0;
            }),
        );
    }

    ensureComfyOverlayPriority() {
        if (document.getElementById("hud-comfy-overlay-priority")) return;

        const style = document.createElement("style");
        style.id = "hud-comfy-overlay-priority";
        style.textContent = `
            .p-toast,
            .p-dialog-mask,
            .p-confirm-dialog,
            .p-dynamicdialog,
            .p-confirmpopup,
            [data-pc-name="toast"],
            [data-pc-name="dialog"],
            [data-pc-name="confirmdialog"],
            [data-pc-name="dynamicdialog"],
            [data-pc-name="confirmpopup"],
            [role="alertdialog"],
            [role="dialog"][aria-modal="true"] {
                z-index: 30000 !important;
            }
        `;
        document.head.appendChild(style);
    }

    show(index, items, currentPath, options = {}) {
        this.items = items;
        this.currentIndex = index;
        this.currentPath = currentPath;
        this.options = options || {};
        this.rebuildMediaNavigation();
        if (this.mediaIndices.length === 0) {
            this.hide();
            return;
        }
        if (this.currentMediaCursor < 0) {
            this.currentMediaCursor = 0;
            this.currentIndex = this.mediaIndices[0];
        }
        this.attachKeyListener();
        this.attachPointerListeners();
        this.overlay.style.display = "flex";
        if (this.showOpacityRaf) cancelAnimationFrame(this.showOpacityRaf);
        this.showOpacityRaf = requestAnimationFrame(() => {
            this.overlay.style.opacity = "1";
            this.showOpacityRaf = null;
        });
        
        this.updateMedia();
    }

    hide() {
        if (this.showOpacityRaf) {
            cancelAnimationFrame(this.showOpacityRaf);
            this.showOpacityRaf = null;
        }
        this.overlay.style.opacity = "0";
        this.overlay.style.display = "none";
        this.detachKeyListener();
        this.detachPointerListeners();
        
        if (this.mediaEl && this.mediaEl.tagName === "VIDEO") {
            this.mediaEl.pause();
            this.mediaEl.src = "";
            this.mediaEl.load();
        }
        
        this.resetState();
        if (typeof this.options?.onHide === "function") {
            try { this.options.onHide(); } catch (_) {}
        }
        if (this.onHide) this.onHide();
        this.options = {};
    }

    rebuildMediaNavigation() {
        this.mediaIndices = [];
        for (let i = 0; i < this.items.length; i++) {
            const it = this.items[i];
            if (it?.is_image || it?.is_video) this.mediaIndices.push(i);
        }
        this.currentMediaCursor = this.mediaIndices.indexOf(this.currentIndex);
    }
    attachKeyListener() {
        if (this.keyListenerAttached || !this._onKey) return;
        document.addEventListener("keydown", this._onKey, true);
        this.keyListenerAttached = true;
    }
    detachKeyListener() {
        if (!this.keyListenerAttached || !this._onKey) return;
        document.removeEventListener("keydown", this._onKey, true);
        this.keyListenerAttached = false;
    }
    attachPointerListeners() {
        if (this.pointerListenersAttached) return;
        if (this.boundMouseMove) window.addEventListener("mousemove", this.boundMouseMove);
        if (this.boundMouseUp) window.addEventListener("mouseup", this.boundMouseUp);
        this.pointerListenersAttached = true;
    }
    detachPointerListeners() {
        if (!this.pointerListenersAttached) return;
        if (this.boundMouseMove) window.removeEventListener("mousemove", this.boundMouseMove);
        if (this.boundMouseUp) window.removeEventListener("mouseup", this.boundMouseUp);
        this.pointerListenersAttached = false;
        if (this.isDragging) {
            this.isDragging = false;
            this.container?.classList.remove("dragging");
        }
    }

    resetState() {
        this.isZoomed = false;
        if (this.container) this.container.classList.remove("zoomed");
        this.panPos = { x: 0, y: 0 };
        this.updateTransform();
        this.updateHelp();
    }

    toggleZoom(e) {
        this.isZoomed = !this.isZoomed;
        if (this.isZoomed) {
            this.container.classList.add("zoomed");
            this.panPos = { x: 0, y: 0 };
        } else {
            this.container.classList.remove("zoomed");
            this.panPos = { x: 0, y: 0 };
        }
        this.updateTransform();
        this.updateHelp();
    }

    updateTransform() {
        if (!this.mediaEl) return;
        const scale = this.isZoomed ? this.zoomScale : 1;
        this.mediaEl.style.transform = `translate3d(${this.panPos.x}px, ${this.panPos.y}px, 0) scale(${scale})`;
    }

    updateHelp() {
        if (!this.helpBox) return;
        
        let lines = [];
        const deleteHint = this.deleteEnabled ? "<span class='hud-mv-key'>DELETE</span> TO REMOVE" : "";
        if (this.isZoomed) {
            lines = [
                "<span class='hud-mv-key'>DRAG</span> TO PAN",
                "<span class='hud-mv-key'>ARROWS</span> TO NAVIGATE",
                deleteHint
            ];
        } else {
            lines = [
                "<span class='hud-mv-key'>CLICK</span> IMAGE TO ZOOM",
                "<span class='hud-mv-key'>ESC</span> OR <span class='hud-mv-key'>CLICK</span> OUTSIDE TO CLOSE",
                deleteHint
            ];
        }

        this.helpBox.innerHTML = lines
            .filter((line) => !!line)
            .map(line => `<div class="hud-mv-help-line">${line}</div>`)
            .join("");
    }

    async deleteCurrent() {
        if (!this.deleteEnabled) return;
        const item = this.items[this.currentIndex];
        if (!item) return;

        if (!confirm(`Are you sure you want to delete "${item.name}"?`)) return;

        try {
            const isAbsolute = this.currentPath.includes(":") || this.currentPath.startsWith("/");
            let fullPath;
            if (isAbsolute) {
                const sep = this.currentPath.includes("\\") ? "\\" : "/";
                fullPath = this.currentPath + (this.currentPath.endsWith(sep) ? "" : sep) + item.name;
            } else {
                fullPath = (this.currentPath === "." || !this.currentPath) ? item.name : this.currentPath + "/" + item.name;
            }

            const res = await fetch("/hud/file-manager/action", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "delete", path: fullPath })
            });

            if (res.ok) {
                // Remove from local list
                this.items.splice(this.currentIndex, 1);
                if (this.currentIndex >= this.items.length) {
                    this.currentIndex = this.items.length - 1;
                }
                this.rebuildMediaNavigation();
                
                // Trigger background refresh
                if (this.onDelete) this.onDelete(item.name);
                
                if (this.mediaIndices.length === 0) {
                    this.hide();
                } else {
                    if (this.currentMediaCursor < 0) {
                        this.currentMediaCursor = 0;
                    }
                    this.currentIndex = this.mediaIndices[this.currentMediaCursor];
                    this.updateMedia();
                }
            } else {
                throw new Error("Failed to delete file");
            }
        } catch (err) {
            console.error("Delete error:", err);
            alert("Failed to delete file. See console for details.");
        }
    }

    navigate(dir) {
        const totalMedia = this.mediaIndices.length;
        if (totalMedia === 0) return;
        if (this.currentMediaCursor < 0) {
            this.currentMediaCursor = this.mediaIndices.indexOf(this.currentIndex);
            if (this.currentMediaCursor < 0) this.currentMediaCursor = 0;
        }
        this.currentMediaCursor = (this.currentMediaCursor + dir + totalMedia) % totalMedia;
        this.currentIndex = this.mediaIndices[this.currentMediaCursor];
        this.updateMedia();
    }

    updateMedia() {
        const item = this.items[this.currentIndex];
        if (!item) return;

        const subfolder = (this.currentPath === "." || !this.currentPath) ? "" : this.currentPath;
        const url = item?.direct_url
            ? String(item.direct_url)
            : `/hud/view?filename=${encodeURIComponent(item.name)}&subfolder=${encodeURIComponent(subfolder)}`;
        
        if (this.mediaEl) this.container.removeChild(this.mediaEl);
        
        if (item.is_image) {
            this.mediaEl = document.createElement("img");
        } else {
            this.mediaEl = document.createElement("video");
            this.mediaEl.controls = true;
            this.mediaEl.autoplay = true;
            this.mediaEl.loop = true;
        }
        
        this.mediaEl.className = "hud-mv-media";
        this.mediaEl.style.animation = "hudMvSwitch 0.3s ease-out";
        this.mediaEl.src = url;
        this.container.appendChild(this.mediaEl);

        this.nameLabel.textContent = String(item.display_name || item.name || "");
        if (this.currentMediaCursor < 0) {
            this.currentMediaCursor = this.mediaIndices.indexOf(this.currentIndex);
        }
        const currentMediaPos = this.currentMediaCursor >= 0 ? this.currentMediaCursor + 1 : 1;
        this.counterLabel.textContent = `${currentMediaPos} / ${this.mediaIndices.length}`;
        this.updateActions(item);

        this.resetState();
    }

    updateActions(item) {
        if (!this.actionsBox) return;
        this.actionsBox.innerHTML = "";
        this.customActionEls = [];

        const getActions = this.options?.getActions;
        if (typeof getActions !== "function") {
            this.actionsBox.style.display = "none";
            return;
        }

        const ctx = {
            item,
            index: this.currentIndex,
            viewer: this,
        };
        const actions = getActions(ctx);
        if (!Array.isArray(actions) || !actions.length) {
            this.actionsBox.style.display = "none";
            return;
        }

        this.actionsBox.style.display = "flex";
        actions.forEach((action) => {
            if (!action || action.hidden) return;
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = `hud-mv-action${action.kind === "primary" ? " primary" : ""}${action.kind === "badge" ? " badge" : ""}`;
            if (action.className) btn.classList.add(String(action.className));
            btn.textContent = String(action.label || "");
            if (action.title) btn.title = String(action.title);
            if (action.kind === "badge") btn.disabled = true;
            else btn.disabled = !!action.disabled;
            btn.onclick = async (e) => {
                e.stopPropagation();
                if (btn.disabled || typeof action.onClick !== "function") return;
                try {
                    await action.onClick(ctx);
                    // Action may have changed representative state; refresh button set.
                    this.updateActions(this.items[this.currentIndex]);
                } catch (err) {
                    console.error(err);
                }
            };
            this.actionsBox.appendChild(btn);
            this.customActionEls.push(btn);
        });

        if (!this.customActionEls.length) {
            this.actionsBox.style.display = "none";
        }
    }

    setDeleteEnabled(enabled) {
        this.deleteEnabled = !!enabled;
        this.updateHelp();
    }
}

export const mediaViewer = new HUDMediaViewer();
