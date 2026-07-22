import { app } from "/scripts/app.js";
import { api } from "/scripts/api.js";
import { mediaViewer } from "./media_viewer.js";
import { HUDFileManagerApi } from "./file_manager_api.js";
import { HUDClipboardState, HUDPathHistory, HUDSelectionState } from "./asset_hub_state.js";
import { ASSET_HUB_BROWSER_STYLES } from "./asset_hub_browser_styles.js";
import {
    buildHudSourcePathFromPayload,
    filterFilesByExtensions,
    generateItemsDirtyHash,
    isNativeFileDrag,
    joinHudPath,
} from "./asset_hub_browser_utils.js";

/**
 * Asset Hub - Pro Edition
 * High-performance, large-scale asset manager for ComfyUI.
 */
class HUDFileBrowser {
    constructor() {
        this.window = null;
        this.currentPath = "output"; 
        this.items = [];
        this.selectionState = new HUDSelectionState();
        this.isVisible = false;
        this.isPathSwitching = false;
        
        this.sortMode = "date_desc";
        this.searchQuery = "";
        this.pollTimer = null;
        this.liveUpdateInFlight = false;
        this.liveUpdateAbortController = null;
        this.loadPathAbortController = null;
        this.loadPathRequestId = 0;
        this.lastDirtyHash = null;
        this.clipboardState = new HUDClipboardState();
        this.isSidebarRendering = false;
        this.filteredItemsCache = [];
        this.renderedItemEls = [];
        this.itemPool = [];
        this.gridEl = null;
        this.loadingOverlayEl = null;
        this.pathSwitchStartedAt = 0;
        this.searchRenderRaf = null;
        this.dragOverRaf = null;
        this.pendingDragOverEvent = null;
        this.safeDropHandlersAdded = false;
        this.safeDropLastValidNode = null;
        this.resolveDropNodeFromPoint = null;
        this.updateDropHighlight = null;
        this.webViewPseudoDragState = null;
        this.dndDebug = false;
        this.webViewDragCompatEnabled = false;
        
        this.pathHistory = new HUDPathHistory(50);
        this.isFocused = false;
        this.readOnlyMode = false;
        this.fileExtensionFilterSet = null;
        this.contextMode = "default";
        this.currentModeConfig = null;
        this.contextModeOptions = {};

        this.boundGlobalToggleKeydown = null;
        this.boundApiExecuted = null;
        this.boundBeforeUnload = null;
        this.boundPageHide = null;
        this.boundSafeDragOver = null;
        this.boundSafeDrop = null;
        this.boundSafeDragEnd = null;
        this.boundSafeDragEnter = null;
        this.boundSafeDragLeave = null;
        this.boundPseudoDragMove = null;
        this.boundPseudoDragUp = null;
        this.boundWindowResize = null;
        this.fmApi = new HUDFileManagerApi();
        this.bindLegacyStateAliases();

        this.init();
    }

    bindLegacyStateAliases() {
        Object.defineProperty(this, "selectedItems", {
            configurable: true,
            enumerable: false,
            get: () => this.selectionState.names,
        });
        Object.defineProperty(this, "lastSelectedIndex", {
            configurable: true,
            enumerable: false,
            get: () => this.selectionState.lastIndex,
            set: (value) => {
                this.selectionState.lastIndex = Number.isFinite(value) ? value : -1;
            },
        });
        Object.defineProperty(this, "clipboard", {
            configurable: true,
            enumerable: false,
            get: () => this.clipboardState.data,
            set: (value) => this.clipboardState.replace(value),
        });
        Object.defineProperty(this, "clipboardPathSet", {
            configurable: true,
            enumerable: false,
            get: () => this.clipboardState.pathSet,
            set: (value) => {
                this.clipboardState.pathSet = value instanceof Set ? value : new Set();
            },
        });
        Object.defineProperty(this, "history", {
            configurable: true,
            enumerable: false,
            get: () => this.pathHistory.entries,
            set: (value) => this.pathHistory.setEntries(value),
        });
        Object.defineProperty(this, "historyIndex", {
            configurable: true,
            enumerable: false,
            get: () => this.pathHistory.index,
            set: (value) => {
                this.pathHistory.index = Number.isFinite(value) ? value : -1;
            },
        });
    }

    dndLog(...args) {
        if (!this.dndDebug) return;
        let text = "";
        try {
            text = args.map((arg) => {
                if (typeof arg === "string") return arg;
                try { return JSON.stringify(arg); } catch { return String(arg); }
            }).join(" ");
        } catch {
            text = String(args);
        }

        if (typeof window.__nexusNative?.post === "function") {
            try {
                window.__nexusNative.post("WEB_CONSOLE", `INFO|[HUD DND] ${text}`);
            } catch (_) {}
        }

        if (window.NexusBridgeDebug?.dnd) {
            try {
                window.NexusBridgeDebug.dnd(text);
            } catch (_) {}
        }
        console.log("[HUD DND]", ...args);
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
                if (this.window && this.window.contains(element)) return false;

                const style = window.getComputedStyle(element);
                if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity || "1") === 0) {
                    return false;
                }

                const rect = element.getBoundingClientRect();
                return rect.width > 0 && rect.height > 0;
            }),
        );
    }

    init() {
        this.dndBuildTag = "DND_PATCH_2026-04-30_18-25";
        this.initStyles();
        this.ensureComfyOverlayPriority();
        this.webViewDragCompatEnabled = !!window.chrome?.webview;
        if (this.webViewDragCompatEnabled) {
            this.dndDebug = !!window.NexusDndDebug;
        }
        
        this.boundGlobalToggleKeydown = (e) => {
            if (this.isComfyBlockingOverlayActive()) return;
            if (this.isTextEditingTarget(e.target)) return;
            // Global toggle
            if (e.ctrlKey && e.shiftKey && (e.code === "KeyB")) {
                e.preventDefault();
                this.toggle();
            }
        };
        window.addEventListener("keydown", this.boundGlobalToggleKeydown);

        mediaViewer.onHide = () => { if (this.isVisible && this.window) this.window.focus(); };
        mediaViewer.onDelete = () => this.refreshCurrentPath();

        this.boundApiExecuted = () => {
            if (this.isVisible && !this.currentPath.includes("/") && this.currentPath !== "input" && !this.currentPath.includes(":")) {
                this.refreshCurrentPath();
            }
        };
        api.addEventListener("executed", this.boundApiExecuted);

        this.setupSafeDrop();
        this.dndLog("init complete", {
            build: this.dndBuildTag,
            webViewDragCompatEnabled: this.webViewDragCompatEnabled,
            dndDebug: this.dndDebug,
        });

        this.boundBeforeUnload = () => this.destroy();
        this.boundPageHide = () => this.destroy();
        window.addEventListener("beforeunload", this.boundBeforeUnload);
        window.addEventListener("pagehide", this.boundPageHide);
    }

    initStyles() {
        if (document.getElementById("hud-fb-styles")) return;
        const style = document.createElement("style");
        style.id = "hud-fb-styles";
        style.textContent = ASSET_HUB_BROWSER_STYLES;
        document.head.appendChild(style);
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

    normalizeWindowGeometry() {
        if (!this.window) return;
        const rect = this.window.getBoundingClientRect();
        this.window.style.left = `${Math.round(rect.left)}px`;
        this.window.style.top = `${Math.round(rect.top)}px`;
        this.window.style.width = `${Math.round(rect.width)}px`;
        this.window.style.height = `${Math.round(rect.height)}px`;
        this.window.style.right = "auto";
        this.window.style.bottom = "auto";
    }

    clampWindowToViewport() {
        if (!this.window || this.window.style.display === "none") return;

        const margin = 12;
        const minW = 560;
        const minH = 420;
        const maxW = Math.max(minW, window.innerWidth - margin * 2);
        const maxH = Math.max(minH, window.innerHeight - margin * 2);

        const rect = this.window.getBoundingClientRect();
        const width = Math.min(Math.max(rect.width, minW), maxW);
        const height = Math.min(Math.max(rect.height, minH), maxH);

        let left = rect.left;
        let top = rect.top;
        const maxLeft = window.innerWidth - margin - width;
        const maxTop = window.innerHeight - margin - height;
        left = Math.min(Math.max(left, margin), Math.max(margin, maxLeft));
        top = Math.min(Math.max(top, margin), Math.max(margin, maxTop));

        this.window.style.left = `${Math.round(left)}px`;
        this.window.style.top = `${Math.round(top)}px`;
        this.window.style.width = `${Math.round(width)}px`;
        this.window.style.height = `${Math.round(height)}px`;
        this.window.style.right = "auto";
        this.window.style.bottom = "auto";
    }

    createWindow() {
        if (this.window) return;
        this.window = document.createElement("div");
        this.window.className = "hud-fb-window";
        this.window.tabIndex = 0;

        this.window.addEventListener("keydown", (e) => {
            if (!this.isVisible) return;
            if (this.isComfyBlockingOverlayActive()) return;
            
            const isInput = e.target.tagName === "INPUT" || 
                           e.target.tagName === "TEXTAREA" || 
                           e.target.isContentEditable;
            
            if (isInput) {
                e.stopPropagation();
                return;
            }

            const selection = window.getSelection();
            if (selection && selection.toString().length > 0 && (e.code === "KeyC" || e.code === "KeyX")) {
                e.stopPropagation();
                return;
            }
            
            this.handleKeyDown(e);
        });

        const header = document.createElement("div");
        header.className = "hud-fb-header";
        header.innerHTML = `<div class="hud-fb-title">Asset Hub</div><div class="hud-fb-close">X</div>`;
        header.querySelector(".hud-fb-close").onclick = () => this.hide();

        const signature = document.createElement("div");
        signature.className = "hud-fb-signature";

        const toolbarArea = document.createElement("div");
        toolbarArea.className = "hud-fb-toolbar-area";

        const row1 = document.createElement("div");
        row1.className = "hud-fb-toolbar-row";
        this.row1El = row1;

        const navGroup = document.createElement("div");
        navGroup.className = "hud-fb-nav-group";
        this.navGroupEl = navGroup;
        const btnBack = this.createBtn("←", () => this.historyBack());
        const btnForward = this.createBtn("→", () => this.historyForward());
        const btnUp = this.createBtn("↑", () => this.navigateUp());
        navGroup.append(btnBack, btnForward, btnUp);

        this.addressBar = document.createElement("div");
        this.addressBar.className = "hud-fb-address-bar";
        this.addressBarContent = document.createElement("div");
        this.addressBarContent.className = "hud-fb-breadcrumb";
        this.addressBar.appendChild(this.addressBarContent);
        const btnPathLeft = this.createBtn("◀", () => this.scrollAddressBar(-180));
        const btnPathRight = this.createBtn("▶", () => this.scrollAddressBar(180));
        btnPathLeft.classList.add("hud-fb-address-scroll");
        btnPathRight.classList.add("hud-fb-address-scroll");
        this.btnPathLeftEl = btnPathLeft;
        this.btnPathRightEl = btnPathRight;

        const searchWrap = document.createElement("div");
        searchWrap.className = "hud-fb-search-wrap";
        this.searchWrapEl = searchWrap;
        searchWrap.innerHTML = `<span class="hud-fb-search-icon">🔍</span>`;
        const searchInput = document.createElement("input");
        searchInput.className = "hud-fb-search-input";
        searchInput.placeholder = "Search items...";
        searchInput.oninput = (e) => {
            this.searchQuery = e.target.value;
            searchClear.style.display = e.target.value ? "block" : "none";
            if (this.searchRenderRaf) cancelAnimationFrame(this.searchRenderRaf);
            this.searchRenderRaf = requestAnimationFrame(() => {
                this.render();
                this.searchRenderRaf = null;
            });
        };
        searchInput.onkeydown = (e) => {
            if (e.ctrlKey && (e.key === "a" || e.code === "KeyA")) {
                e.stopPropagation();
                e.preventDefault();
                searchInput.select();
            }
        };
        const searchClear = document.createElement("span");
        searchClear.className = "hud-fb-search-clear";
        searchClear.innerHTML = "✕";
        searchClear.style.display = "none";
        searchClear.onclick = () => {
            searchInput.value = "";
            this.searchQuery = "";
            searchClear.style.display = "none";
            this.render();
            searchInput.focus();
        };
        searchWrap.append(searchInput, searchClear);
        const pathGroup = document.createElement("div");
        pathGroup.className = "hud-fb-path-group";
        pathGroup.append(btnPathLeft, this.addressBar, btnPathRight);
        this.pathGroupEl = pathGroup;

        row1.append(navGroup, pathGroup, searchWrap);

        const row2 = document.createElement("div");
        row2.className = "hud-fb-toolbar-row secondary";
        this.row2El = row2;
        const actionGroup = document.createElement("div");
        actionGroup.className = "hud-fb-nav-btns";
        this.actionGroupEl = actionGroup;
        const btnNewFolder = this.createBtn("📁 NEW", () => this.createNewFolder());
        const btnAll = this.createBtn("SELECT ALL", () => this.selectAll());
        const btnNone = this.createBtn("DESELECT", () => {
            this.selectionState.clear();
            this.updateSelectionUI();
        });
        const sortSelect = document.createElement("select");
        sortSelect.className = "hud-fb-btn";
        sortSelect.innerHTML = `
            <option value="date_desc">Newest</option>
            <option value="date_asc">Oldest First</option>
            <option value="name_asc">Name A-Z</option>
            <option value="name_desc">Name Z-A</option>
        `;
        sortSelect.value = this.sortMode;
        sortSelect.onchange = (e) => { this.sortMode = e.target.value; this.sortAndRender(); };
        const btnRefresh = this.createBtn("🔄", () => this.refreshCurrentPath());
        btnRefresh.title = "Refresh";
        const btnDelete = this.createBtn("🗑 DELETE", () => this.deleteSelected());
        btnDelete.title = "Delete selected files";
        btnDelete.style.display = "none";
        actionGroup.append(btnNewFolder, btnAll, btnNone, sortSelect, btnRefresh, btnDelete);
        this.btnAllEl = btnAll;
        this.btnNoneEl = btnNone;
        this.sortSelectEl = sortSelect;
        this.btnRefreshEl = btnRefresh;
        this.btnDeleteEl = btnDelete;

        const sysGroup = document.createElement("div");
        sysGroup.className = "hud-fb-nav-btns";
        sysGroup.style.marginLeft = "auto";
        this.sysGroupEl = sysGroup;
        const btnOS = this.createBtn("📂 OPEN OS", () => this.openInOS());
        const btnAddLocal = this.createBtn("➕ ADD LOCAL", () => this.pickDirectory());
        sysGroup.append(btnOS, btnAddLocal);
        row2.append(actionGroup, sysGroup);
        this.btnNewFolder = btnNewFolder;
        this.btnOSEl = btnOS;
        this.btnAddLocal = btnAddLocal;
        this.btnAddLocalDefaultHandler = () => this.pickDirectory();
        this.btnAddLocal.onclick = this.btnAddLocalDefaultHandler;

        this.modeHintEl = document.createElement("div");
        this.modeHintEl.className = "hud-fb-mode-hint";
        this.modeHintEl.textContent = "Edit preview images. Drag and drop images or choose files.";

        toolbarArea.append(row1, row2, this.modeHintEl);

        this.statsEl = document.createElement("div");
        this.statsEl.className = "hud-fb-status-right";

        this.selectedNameEl = document.createElement("div");
        this.selectedNameEl.className = "hud-fb-selected-full";
        this.selectedNameEl.textContent = "Selected: (none)";
        const statusBar = document.createElement("div");
        statusBar.className = "hud-fb-statusbar";
        statusBar.append(this.selectedNameEl, this.statsEl);

        const main = document.createElement("div");
        main.className = "hud-fb-main";
        this.sidebarEl = document.createElement("div");
        this.sidebarEl.className = "hud-fb-sidebar";

        const body = document.createElement("div");
        body.className = "hud-fb-body";
        this.contentEl = document.createElement("div");
        this.contentEl.className = "hud-fb-content";
        this.gridEl = document.createElement("div");
        this.gridEl.className = "hud-fb-grid";
        this.loadingOverlayEl = document.createElement("div");
        this.loadingOverlayEl.className = "hud-fb-loading-overlay";
        this.loadingOverlayEl.innerHTML = `<div class="hud-fb-loading-spinner"></div><div>Loading assets...</div>`;
        this.contentEl.appendChild(this.gridEl);
        this.contentEl.appendChild(this.loadingOverlayEl);
        const isNativeFileDrag = (dt) => {
            if (!dt) return false;
            if (dt.files && dt.files.length > 0) return true;
            const types = Array.from(dt.types || []);
            return types.includes("Files");
        };
        const onNativeDragOver = (e) => {
            const dt = e.dataTransfer;
            if (!isNativeFileDrag(dt)) return;
            e.preventDefault();
            if (dt) dt.dropEffect = "copy";
        };
        const onNativeDrop = async (e) => {
            const dt = e.dataTransfer;
            if (!isNativeFileDrag(dt)) return;
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation?.();
            if (!dt?.files?.length) return;
            if (this._nativeDropInFlight) return;
            this._nativeDropInFlight = true;
            try {
                await this.uploadDroppedFiles(dt.files);
            } finally {
                this._nativeDropInFlight = false;
            }
        };
        this.contentEl.addEventListener("dragover", onNativeDragOver);
        this.contentEl.addEventListener("drop", onNativeDrop);
        this.window.addEventListener("dragover", onNativeDragOver);
        this.window.addEventListener("drop", onNativeDrop);
        body.append(toolbarArea, statusBar, this.contentEl);
        main.append(this.sidebarEl, body);

        const resizer = document.createElement("div");
        resizer.className = "hud-fb-resizer";

        this.window.append(header, signature, main, resizer);
        document.body.appendChild(this.window);

        this.dragProxy = document.createElement("div");
        this.dragProxy.className = "hud-fb-drag-proxy";
        document.body.appendChild(this.dragProxy);

        this.setupDragging(header, resizer);
        this.setupMarquee();
        this.applyReadOnlyUI();
    }

    setReadOnlyMode(enabled = false) {
        this.readOnlyMode = !!enabled;
        mediaViewer.setDeleteEnabled(!this.readOnlyMode);
        this.applyReadOnlyUI();
    }

    setElementVisible(el, visible) {
        if (!el) return;
        el.style.display = visible ? "" : "none";
    }

    getContextModeConfig(mode = "default", options = {}) {
        const defaultConfig = {
            showModeHint: false,
            modeHintText: "",
            showRow1: true,
            showNavGroup: true,
            showPathLeft: true,
            showAddressBar: true,
            showPathRight: true,
            showSearch: true,
            showSidebar: true,
            showNewFolder: true,
            showSelectAll: true,
            showDeselect: true,
            showSort: true,
            showRefresh: true,
            showDelete: false,
            showOpenOS: true,
            addLocalLabel: "➕ ADD LOCAL",
            addLocalHandler: this.btnAddLocalDefaultHandler,
            forceHideNewFolder: false,
        };

        if (mode === "checkpoint_preview_edit") {
            return {
                ...defaultConfig,
                showModeHint: true,
                modeHintText: String(options.modeHintText || "Edit preview images. Drag and drop images or choose files."),
                showRow1: false,
                showNavGroup: false,
                showPathLeft: false,
                showAddressBar: false,
                showPathRight: false,
                showSearch: false,
                showSidebar: false,
                showNewFolder: false,
                showSelectAll: false,
                showDeselect: false,
                showSort: false,
                showRefresh: false,
                showDelete: true,
                showOpenOS: false,
                addLocalLabel: "➕ ADD IMAGES",
                addLocalHandler: () => this.pickAndUploadFiles(),
                forceHideNewFolder: true,
            };
        }

        return defaultConfig;
    }

    applyContextModeConfig(config) {
        if (!config) return;

        if (this.modeHintEl) {
            this.setElementVisible(this.modeHintEl, config.showModeHint);
            if (config.showModeHint && config.modeHintText) {
                this.modeHintEl.textContent = String(config.modeHintText);
            }
        }

        this.setElementVisible(this.row1El, config.showRow1);
        this.setElementVisible(this.navGroupEl, config.showNavGroup);
        this.setElementVisible(this.btnPathLeftEl, config.showPathLeft);
        this.setElementVisible(this.addressBar, config.showAddressBar);
        this.setElementVisible(this.btnPathRightEl, config.showPathRight);
        this.setElementVisible(this.searchWrapEl, config.showSearch);

        this.setElementVisible(this.btnNewFolder, config.showNewFolder);
        this.setElementVisible(this.btnAllEl, config.showSelectAll);
        this.setElementVisible(this.btnNoneEl, config.showDeselect);
        this.setElementVisible(this.sortSelectEl, config.showSort);
        this.setElementVisible(this.btnRefreshEl, config.showRefresh);
        this.setElementVisible(this.btnDeleteEl, config.showDelete);
        this.setElementVisible(this.btnOSEl, config.showOpenOS);
        this.setElementVisible(this.sidebarEl, config.showSidebar);

        if (this.btnAddLocal) {
            this.btnAddLocal.textContent = String(config.addLocalLabel || "➕ ADD LOCAL");
            this.btnAddLocal.onclick = typeof config.addLocalHandler === "function"
                ? config.addLocalHandler
                : this.btnAddLocalDefaultHandler;
            this.setElementVisible(this.btnAddLocal, true);
        }
    }

    setContextMode(mode = "default", options = {}) {
        this.contextMode = String(mode || "default");
        this.contextModeOptions = { ...(options || {}) };
        this.currentModeConfig = this.getContextModeConfig(this.contextMode, options);
        this.applyContextModeConfig(this.currentModeConfig);

        this.applyReadOnlyUI();
    }

    setFileExtensionFilter(extensions = null) {
        if (!Array.isArray(extensions) || extensions.length === 0) {
            this.fileExtensionFilterSet = null;
            return;
        }
        const normalized = extensions
            .map((ext) => String(ext || "").trim().toLowerCase().replace(/^\./, ""))
            .filter(Boolean);
        this.fileExtensionFilterSet = normalized.length ? new Set(normalized) : null;
    }

    applyReadOnlyUI() {
        const config = this.currentModeConfig || this.getContextModeConfig(this.contextMode);
        if (this.btnNewFolder) {
            const canShow = config.showNewFolder && !config.forceHideNewFolder && !this.readOnlyMode;
            this.setElementVisible(this.btnNewFolder, canShow);
        }
        if (this.btnAddLocal) {
            this.setElementVisible(this.btnAddLocal, !this.readOnlyMode);
        }
        if (this.btnDeleteEl) {
            this.setElementVisible(this.btnDeleteEl, !!config.showDelete && !this.readOnlyMode);
        }
    }

    createBtn(text, onclick) {
        const btn = document.createElement("button");
        btn.className = "hud-fb-btn";
        btn.textContent = text;
        btn.onclick = onclick;
        return btn;
    }

    async pickDirectory() {
        try {
            const { data } = await this.fmApi.pickDirectory();
            if (data.success) {
                this.addBookmark(data.path);
            } else if (data.error !== "Cancelled") {
                alert("Remote/Headless environment detected. Native folder picker is only available in local environments.");
            }
        } catch(e) { alert("Failed to open picker."); }
    }

    async pickAndUploadFiles() {
        if (this.readOnlyMode) return;
        const input = document.createElement("input");
        input.type = "file";
        input.multiple = true;
        if (this.fileExtensionFilterSet && this.fileExtensionFilterSet.size) {
            const exts = Array.from(this.fileExtensionFilterSet.values());
            input.accept = exts.map((ext) => `.${ext}`).join(",");
        }

        const files = await new Promise((resolve) => {
            input.onchange = () => resolve(Array.from(input.files || []));
            input.click();
        });

        if (!files.length) return;
        await this.uploadDroppedFiles(files);
    }

    async uploadDroppedFiles(fileList) {
        if (this.readOnlyMode) return;
        const { files, originalCount } = filterFilesByExtensions(fileList, this.fileExtensionFilterSet);
        if (!files.length) {
            if (originalCount > 0) alert("Only supported image formats can be uploaded in this mode.");
            return;
        }
        try {
            const { data } = this.contextMode === "checkpoint_preview_edit"
                ? await this.uploadCheckpointPreviewFiles(files)
                : await this.fmApi.upload(this.currentPath, files);
            if (!data?.success) {
                alert(data?.error || "Upload failed");
                return;
            }
            this.refreshCurrentPath();
        } catch (e) {
            console.error(e);
            alert("Upload failed");
        }
    }

    async uploadCheckpointPreviewFiles(files) {
        const ckptName = String(this.contextModeOptions?.checkpointName || "").trim();
        if (!ckptName) {
            return { data: { success: false, error: "Checkpoint name is missing." } };
        }
        return this.fmApi.uploadCheckpointPreview(ckptName, files);
    }

    async renderSidebar() {
        if (this.contextMode === "checkpoint_preview_edit") return;
        if (!this.sidebarEl || this.isSidebarRendering) return;
        this.isSidebarRendering = true;
        try {
            const { data } = await this.fmApi.getBookmarks();
            const bookmarks = Array.isArray(data) ? data : [];
            this.sidebarEl.innerHTML = "";
            const sections = [
                { title: "Library", items: [
                    { name: "Output", icon: "🖼️", path: "output" },
                    { name: "Input", icon: "📥", path: "input" }
                ]},
                { title: "Bookmarks", items: bookmarks.map(b => {
                    let parts = b.split(/[\\/]/).filter(p => p);
                    let dirDepth = parts.length;
                    let rootDir = dirDepth > 0 ? parts[0].toLowerCase() : "";
                    
                    let name = "Output";
                    if (b === "input") name = "Input";
                    else if (dirDepth > 0) name = parts[dirDepth - 1];

                    let targetDir = name.toLowerCase();

                    // Apply the user's exact "Inside" condition
                    if (dirDepth > 1 && (rootDir === "output" || rootDir === "input") && (targetDir === "output" || targetDir === "input")) {
                        name = `${name} (Inside)`;
                    }

                    return { name: name, fullName: b, icon: "📌", path: b, isBookmark: true };
                }) }
            ];
            sections.forEach(sec => {
                if (sec.title === "Bookmarks" && sec.items.length === 0) return;
                const head = document.createElement("div");
                head.className = "hud-fb-sidebar-section";
                head.textContent = sec.title;
                this.sidebarEl.appendChild(head);
                sec.items.forEach(it => {
                    const el = document.createElement("div");
                    el.className = "hud-fb-side-item" + (this.currentPath === it.path ? " active" : "");
                    const displayName = it.name && it.name.length > 14 ? `${it.name.slice(0, 14)}...` : it.name;
                    const fullName = it.fullName || it.name || "";
                    el.innerHTML = `<span class="icon">${it.icon}</span><span title="${String(fullName).replace(/"/g, "&quot;")}">${displayName}</span>`;
                    if (it.isBookmark) {
                        const del = document.createElement("span");
                        del.className = "delete-bookmark";
                        del.textContent = "✕";
                        del.onclick = (e) => { e.stopPropagation(); this.removeBookmark(it.path); };
                        el.appendChild(del);
                    }
                    el.onclick = () => this.loadPath(it.path);
                    this.sidebarEl.appendChild(el);
                });
            });
        } catch(e) { console.error(e); }
        finally { this.isSidebarRendering = false; }
    }

    async loadPath(path, targetIndex = -1, skipHistory = false) {
        const pathChanged = path !== this.currentPath;
        if (pathChanged) {
            this.resetTransientViewState();
            this.beginPathSwitchTransition();
        }
        let loadedItemCount = 0;

        if (!skipHistory) this.pathHistory.record(this.currentPath, path);
        
        this.currentPath = path;
        const requestId = ++this.loadPathRequestId;
        if (this.loadPathAbortController) this.loadPathAbortController.abort();
        this.loadPathAbortController = new AbortController();

        try {
            const { data } = await this.fmApi.list(path, this.loadPathAbortController.signal);
            if (requestId !== this.loadPathRequestId) return;
            if (data.error) { alert(data.error); return; }
            const now = Date.now() / 1000;
            this.items = data.items;
            loadedItemCount = Array.isArray(data.items) ? data.items.length : 0;
            this.items.forEach(it => {
                it._nameLower = it.name.toLowerCase();
                if (now - it.mtime < 60) it.isNew = true;
            });
            this.lastDirtyHash = generateItemsDirtyHash(this.items);
            this.sortAndRender(targetIndex);
            this.renderAddressBar();
            this.renderSidebar();
        } catch(e) {
            if (e?.name !== "AbortError") console.error(e);
        } finally {
            if (requestId === this.loadPathRequestId) {
                this.loadPathAbortController = null;
                if (pathChanged) this.endPathSwitchTransition(loadedItemCount);
            }
        }
    }

    sortAndRender(targetIndex = -1) {
        this.items.sort((a, b) => {
            if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
            switch(this.sortMode) {
                case "date_desc": return b.mtime - a.mtime;
                case "date_asc": return a.mtime - b.mtime;
                case "name_asc": return a.name.localeCompare(b.name);
                case "name_desc": return b.name.localeCompare(a.name);
                default: return 0;
            }
        });
        this.render(targetIndex);
    }

    getFilteredItems() {
        const q = this.searchQuery.toLowerCase();
        const filtered = [];
        for (let i = 0; i < this.items.length; i++) {
            const item = this.items[i];
            if (this.contextMode === "checkpoint_preview_edit" && item?.type === "dir") continue;
            if (
                this.fileExtensionFilterSet &&
                item?.type === "file" &&
                !this.fileExtensionFilterSet.has(String(item?.name || "").toLowerCase().split(".").pop() || "")
            ) {
                continue;
            }
            if (!(item._nameLower || item.name.toLowerCase()).includes(q)) continue;
            filtered.push({ item, index: i });
        }
        return filtered;
    }

    render(targetIndex = -1) {
        this.renderPooled(targetIndex);
    }

    ensurePooledCard(poolIndex) {
        if (this.itemPool[poolIndex]) return this.itemPool[poolIndex];

        const el = document.createElement("div");
        el.className = "hud-fb-item";
        el.draggable = true;

        const badge = document.createElement("div");
        badge.className = "hud-fb-is-new";
        badge.textContent = "NEW";

        const lock = document.createElement("div");
        lock.className = "hud-fb-item-lock";
        const pin = document.createElement("div");
        pin.className = "hud-fb-pin-badge";
        pin.textContent = "📌 REGISTER";
        pin.onclick = (e) => {
            e.stopPropagation();
            const path = el.__hudBookmarkPath;
            if (path) this.addBookmark(path);
        };
        lock.appendChild(pin);

        const thumbWrap = document.createElement("div");
        thumbWrap.className = "hud-fb-item-thumb-wrap";
        const thumbImg = document.createElement("img");
        thumbImg.className = "hud-fb-thumb";
        thumbImg.loading = "lazy";
        thumbImg.style.display = "none";
        const thumbVideo = document.createElement("video");
        thumbVideo.className = "hud-fb-thumb";
        thumbVideo.muted = true;
        thumbVideo.preload = "metadata";
        thumbVideo.style.display = "none";
        thumbVideo.onloadedmetadata = () => { thumbVideo.currentTime = 1; };
        const thumbIcon = document.createElement("span");
        thumbIcon.className = "hud-fb-icon";
        thumbIcon.style.display = "none";
        thumbWrap.append(thumbImg, thumbVideo, thumbIcon);

        const name = document.createElement("div");
        name.className = "hud-fb-name";

        el.append(badge, lock, thumbWrap, name);

        el.onclick = (e) => {
            const data = el.__hudData;
            if (!data) return;
            this.handleItemClick(e, data.index, data.item);
        };
        el.ondblclick = () => {
            const data = el.__hudData;
            if (!data) return;
            const { item, index } = data;
            if (item.type === "dir") this.loadPath(joinHudPath(this.currentPath, item.name));
            else mediaViewer.show(index, this.items, this.currentPath);
        };
        el.oncontextmenu = (e) => {
            const data = el.__hudData;
            if (!data) return;
            this.showContextMenu(e, data.item);
        };
        el.ondragstart = (e) => {
            const data = el.__hudData;
            if (!data) return;
            this.handleDragStart(e, data.item);
        };
        el.onmousedown = (e) => {
            if (!this.webViewDragCompatEnabled) return;
            if (e.button !== 0) return;
            const data = el.__hudData;
            if (!data || data.item?.type === "dir") return;
            this.beginPseudoDrag(e, data.item);
        };

        this.gridEl.appendChild(el);
        const card = { el, badge, lock, thumbImg, thumbVideo, thumbIcon, name };
        this.itemPool[poolIndex] = card;
        return card;
    }

    renderPooled(targetIndex = -1) {
        const filtered = this.getFilteredItems();
        this.filteredItemsCache = filtered;
        this.statsEl.textContent = `${filtered.length} items found`;
        this.renderedItemEls = [];
        this.updateSelectedNameStatus();

        const visibleCount = filtered.length;

        for (let i = 0; i < visibleCount; i++) {
            const { item, index: actualIndex } = filtered[i];
            const card = this.ensurePooledCard(i);
            const { el, badge, lock, thumbImg, thumbVideo, thumbIcon, name } = card;

            el.style.display = "";
            el.__hudData = { item, index: actualIndex };
            el.__hudBookmarkPath = "";

            el.classList.toggle("selected", this.selectionState.has(item.name));
            el.classList.toggle("focused", actualIndex === this.selectionState.lastIndex);

            const fullPath = joinHudPath(this.currentPath, item.name);
            const isCut = this.clipboardState.isCut() && this.clipboardState.includes(fullPath);
            el.classList.toggle("is-cut", isCut);
            badge.style.display = item.isNew ? "" : "none";

            const url = `/hud/view?filename=${encodeURIComponent(item.name)}&subfolder=${encodeURIComponent(this.currentPath)}`;

            if (item.type === "dir") {
                thumbImg.style.display = "none";
                thumbVideo.style.display = "none";
                thumbIcon.style.display = "";
                thumbIcon.textContent = "📁";

                const isHUDPath = this.currentPath === "input" || this.currentPath.startsWith("input/") ||
                    this.currentPath === "output" || this.currentPath.startsWith("output/");
                const isExternal = !isHUDPath && (this.currentPath.includes(":") || this.currentPath.startsWith("/"));
                lock.style.display = isExternal ? "" : "none";
                if (isExternal) el.__hudBookmarkPath = fullPath;
            } else if (item.is_image) {
                lock.style.display = "none";
                thumbVideo.style.display = "none";
                thumbIcon.style.display = "none";
                thumbImg.style.display = "";
                if (thumbImg.dataset.src !== url) {
                    thumbImg.src = url;
                    thumbImg.dataset.src = url;
                }
            } else if (item.is_video) {
                lock.style.display = "none";
                thumbImg.style.display = "none";
                thumbIcon.style.display = "none";
                thumbVideo.style.display = "";
                if (thumbVideo.dataset.src !== url) {
                    thumbVideo.src = url;
                    thumbVideo.dataset.src = url;
                }
            } else {
                lock.style.display = "none";
                thumbImg.style.display = "none";
                thumbVideo.style.display = "none";
                thumbIcon.style.display = "";
                thumbIcon.textContent = "📄";
            }

            name.textContent = item.name;
            name.title = item.name;
            el.title = item.name;
            this.renderedItemEls.push(el);
        }

        for (let i = visibleCount; i < this.itemPool.length; i++) {
            const card = this.itemPool[i];
            if (!card) continue;
            card.el.style.display = "none";
            card.el.__hudData = null;
            card.el.__hudBookmarkPath = "";
        }

        if (targetIndex !== -1 && this.renderedItemEls[targetIndex]) {
            this.renderedItemEls[targetIndex].scrollIntoView({ block: "nearest" });
        }
    }

    handleItemClick(e, index, item) {
        if (e.shiftKey && this.selectionState.lastIndex !== -1) {
            this.selectionState.addRange(this.items, this.selectionState.lastIndex, index);
        } else if (e.ctrlKey || e.metaKey) {
            this.selectionState.toggle(item.name);
        } else {
            this.selectionState.setOnly(item.name, index);
        }
        this.selectionState.lastIndex = index;
        this.updateSelectionUI();
    }

    handleDragStart(e, item) {
        const target = e.currentTarget;
        const dt = e.dataTransfer;
        this.dndLog("dragstart begin", {
            build: this.dndBuildTag,
            item: item?.name || "",
            webViewCompat: this.webViewDragCompatEnabled,
            selectedCount: this.selectionState.size,
        });
        if (!dt) {
            this.dndLog("dragstart abort: missing dataTransfer");
            return;
        }
        if (!this.selectionState.has(item.name)) {
            this.selectionState.setOnly(item.name, this.selectionState.lastIndex);
            // Delay UI update slightly so it doesn't break the browser's drag snapshot.
            // WebView2 is extra sensitive here, so keep the snapshot stable until drag settles.
            if (!this.webViewDragCompatEnabled) {
                requestAnimationFrame(() => this.updateSelectionUI());
            }
        }

        try {
            dt.setData("text/plain", this.selectionState.toArray().join("\n"));
            this.dndLog("dragstart setData ok: text/plain");
        } catch (err) {
            this.dndLog("dragstart setData fail: text/plain", String(err));
        }

        if (this.webViewDragCompatEnabled) {
            dt.effectAllowed = "copy";
            this.dndLog("dragstart webview-minimal profile active");
            this.dndLog("dragstart webview-compat: custom mime payload skipped");
            this.dndLog("dragstart webview-compat: comfy payload skipped");
            this.dndLog("dragstart payload (minimal)", {
                filename: item?.name || "",
                selected: this.selectionState.toArray(),
            });
            return;
        }

        if (!this.webViewDragCompatEnabled) {
            try {
                dt.setData("application/x-comfyui-hud-origin", "true");
                this.dndLog("dragstart setData ok: application/x-comfyui-hud-origin");
            } catch (err) {
                this.dndLog("dragstart setData fail: application/x-comfyui-hud-origin", String(err));
            }
            try {
                dt.setData("text/hud-selection-count", String(this.selectionState.size));
                this.dndLog("dragstart setData ok: text/hud-selection-count");
            } catch (err) {
                this.dndLog("dragstart setData fail: text/hud-selection-count", String(err));
            }
        } else {
            this.dndLog("dragstart webview-compat: custom mime payload skipped");
        }
        dt.effectAllowed = "copyMove";
        
        // WebView2 can cancel drag when custom drag images are applied to complex cards.
        if (!this.webViewDragCompatEnabled && dt.setDragImage && target) {
            dt.setDragImage(target, e.offsetX || 80, e.offsetY || 100);
            this.dndLog("dragstart setDragImage applied");
        } else {
            this.dndLog("dragstart setDragImage skipped (webview compatibility)");
        }

        let type = "output", sub = this.currentPath;
        if (sub === "input") { type = "input"; sub = ""; }
        else if (sub.startsWith("input/")) { type = "input"; sub = sub.substring(6); }
        else if (sub === "output") { type = "output"; sub = ""; }
        else if (sub.startsWith("output/")) { type = "output"; sub = sub.substring(7); }
        else if (sub.includes(":") || sub.startsWith("/")) { type = "absolute"; }
        const payload = { filename: item.name, subfolder: sub, type };
        if (!this.webViewDragCompatEnabled) {
            try {
                dt.setData("comfyui/image", JSON.stringify(payload));
                this.dndLog("dragstart setData ok: comfyui/image");
            } catch (err) {
                this.dndLog("dragstart setData fail: comfyui/image", String(err));
            }
            try {
                dt.setData("text/uri-list", `${location.origin}/hud/view?filename=${encodeURIComponent(item.name)}&subfolder=${encodeURIComponent(this.currentPath)}`);
                this.dndLog("dragstart setData ok: text/uri-list");
            } catch (err) {
                this.dndLog("dragstart setData fail: text/uri-list", String(err));
            }
        } else {
            this.dndLog("dragstart webview-compat: comfy payload skipped");
        }
        this.dndLog("dragstart payload", payload, "currentPath=", this.currentPath, "selected=", this.selectionState.toArray());
    }

    beginPseudoDrag(e, item) {
        if (!this.webViewDragCompatEnabled) return;
        this.webViewPseudoDragState = {
            item,
            startX: e.clientX,
            startY: e.clientY,
            active: false,
        };
        this.dndLog("pseudo-drag armed", { item: item?.name || "" });

        if (!this.boundPseudoDragMove) {
            this.boundPseudoDragMove = (me) => this.onPseudoDragMove(me);
        }
        if (!this.boundPseudoDragUp) {
            this.boundPseudoDragUp = (me) => this.onPseudoDragEnd(me);
        }
        window.addEventListener("mousemove", this.boundPseudoDragMove, true);
        window.addEventListener("mouseup", this.boundPseudoDragUp, true);
    }

    onPseudoDragMove(e) {
        const state = this.webViewPseudoDragState;
        if (!state) return;

        const dx = Math.abs(e.clientX - state.startX);
        const dy = Math.abs(e.clientY - state.startY);
        if (!state.active && dx + dy < 6) return;
        if (!state.active) {
            state.active = true;
            this.dndLog("pseudo-drag started", { item: state.item?.name || "" });
        }

        const node = this.resolveDropNodeFromPoint?.(e.clientX, e.clientY) || null;
        this.updateDropHighlight?.(node);
        this.dndLog("pseudo-drag move", {
            x: e.clientX,
            y: e.clientY,
            valid: !!node,
            node: node ? { title: node.title, comfyClass: node.comfyClass } : null,
        });
    }

    async onPseudoDragEnd(e) {
        const state = this.webViewPseudoDragState;
        this.webViewPseudoDragState = null;

        if (this.boundPseudoDragMove) {
            window.removeEventListener("mousemove", this.boundPseudoDragMove, true);
        }
        if (this.boundPseudoDragUp) {
            window.removeEventListener("mouseup", this.boundPseudoDragUp, true);
        }

        this.updateDropHighlight?.(null);
        if (!state || !state.active) {
            this.dndLog("pseudo-drag cancelled before activation");
            return;
        }

        const node = this.resolveDropNodeFromPoint?.(e.clientX, e.clientY) || null;
        if (!node) {
            this.dndLog("pseudo-drag drop ignored: no node under pointer");
            return;
        }

        const payload = this.buildImagePayloadForItem(state.item);
        const plain = this.selectionState.size > 0
            ? this.selectionState.toArray().join("\n")
            : String(state.item?.name || "");
        const mockDataTransfer = {
            getData: (key) => {
                if (key === "comfyui/image") return JSON.stringify(payload);
                if (key === "text/plain") return plain;
                if (key === "application/x-comfyui-hud-origin") return "true";
                return "";
            },
        };

        try {
            const bridged = await this.bridgeHudDropToLoadImage(node, mockDataTransfer);
            this.dndLog("pseudo-drag drop bridged", {
                item: state.item?.name || "",
                bridged,
                node: { title: node.title, comfyClass: node.comfyClass },
            });
            if (!bridged) {
                this.dndLog("pseudo-drag bridge returned false", {
                    node: { title: node.title, comfyClass: node.comfyClass, type: node.type },
                    widgets: Array.isArray(node.widgets) ? node.widgets.map((w) => String(w?.name || "")) : [],
                });
            }
        } catch (err) {
            this.dndLog("pseudo-drag drop exception", String(err));
        }
    }

    buildImagePayloadForItem(item) {
        let type = "output";
        let sub = this.currentPath;
        if (sub === "input") { type = "input"; sub = ""; }
        else if (sub.startsWith("input/")) { type = "input"; sub = sub.substring(6); }
        else if (sub === "output") { type = "output"; sub = ""; }
        else if (sub.startsWith("output/")) { type = "output"; sub = sub.substring(7); }
        else if (sub.includes(":") || sub.startsWith("/")) { type = "absolute"; }
        return { filename: item?.name || "", subfolder: sub, type };
    }

    updateSelectionUI() {
        const filtered = this.filteredItemsCache;
        const els = this.renderedItemEls;
        filtered.forEach(({ item: it, index }, i) => {
            if (els[i]) {
                els[i].classList.toggle("selected", this.selectionState.has(it.name));
                els[i].classList.toggle("focused", index === this.selectionState.lastIndex);
            }
        });
        this.updateSelectedNameStatus();
    }

    updateSelectedNameStatus() {
        if (!this.selectedNameEl) return;
        const selectedCount = this.selectionState.size;
        if (!selectedCount) {
            this.selectedNameEl.textContent = "Selected: (none)";
            this.selectedNameEl.title = "";
            return;
        }

        let name = "";
        const index = this.selectionState.lastIndex;
        if (Number.isFinite(index) && index >= 0 && index < this.items.length) {
            name = String(this.items[index]?.name || "");
        }
        if (!name) {
            name = this.selectionState.toArray()[0] || "";
        }

        const prefix = selectedCount > 1 ? `Selected (${selectedCount}): ` : "Selected: ";
        this.selectedNameEl.textContent = `${prefix}${name}`;
        this.selectedNameEl.title = name;
    }

    updateCutUI() {
        const isCutMode = this.clipboardState.isCut();
        const filtered = this.filteredItemsCache;
        const els = this.renderedItemEls;
        filtered.forEach(({ item }, i) => {
            const el = els[i];
            if (!el) return;
            const fullPath = joinHudPath(this.currentPath, item.name);
            el.classList.toggle("is-cut", isCutMode && this.clipboardState.includes(fullPath));
        });
    }

    handleKeyDown(e) {
        if (!this.isVisible || !this.contentEl) return;
        if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.isContentEditable) return;

        const items = this.renderedItemEls;
        const filtered = this.filteredItemsCache || [];
        
        // Handle CTRL shortcuts
        if (e.ctrlKey || e.metaKey) {
            switch(e.code) {
                case "KeyA": e.preventDefault(); e.stopPropagation(); this.selectAll(); return;
                case "KeyC": e.preventDefault(); e.stopPropagation(); this.copySelected(false); return;
                case "KeyX":
                    if (this.readOnlyMode) return;
                    e.preventDefault(); e.stopPropagation(); this.copySelected(true); return;
                case "KeyV":
                    if (this.readOnlyMode) return;
                    e.preventDefault(); e.stopPropagation(); this.paste(); return;
            }
            return;
        }

        if (items.length === 0 || filtered.length === 0) return;

        let cursor = filtered.findIndex((entry) => entry?.index === this.selectionState.lastIndex);
        if (cursor === -1) cursor = 0;
        
        const firstItem = items[0];
        const cols = firstItem ? Math.floor(this.contentEl.clientWidth / (firstItem.offsetWidth + 20)) : 1;
        let moved = true;
        
        switch(e.key) {
            case "ArrowLeft": cursor = Math.max(0, cursor - 1); break;
            case "ArrowRight": cursor = Math.min(filtered.length - 1, cursor + 1); break;
            case "ArrowUp": cursor = Math.max(0, cursor - cols); break;
            case "ArrowDown": cursor = Math.min(filtered.length - 1, cursor + cols); break;
            case "Enter":
                e.stopPropagation();
                const selected = filtered[cursor];
                const sel = selected?.item;
                if (sel) {
                    if (sel.type === "dir") this.loadPath(joinHudPath(this.currentPath, sel.name));
                    else mediaViewer.show(selected.index, this.items, this.currentPath);
                }
                return;
            case "Backspace": e.stopPropagation(); this.navigateUp(); return;
            case "Delete":
                if (this.readOnlyMode) return;
                e.stopPropagation(); this.deleteSelected(); return;
            case "F2": {
                if (this.readOnlyMode) return;
                e.preventDefault();
                e.stopPropagation();
                const sel = filtered[cursor]?.item;
                if (sel) this.renameItem(sel);
                return;
            }
            case "Escape": e.stopPropagation(); this.hide(); return;
            default: moved = false;
        }
        
        if (moved) {
            e.preventDefault();
            e.stopPropagation();
            const selected = filtered[cursor];
            if (!selected) return;
            this.handleItemClick(e, selected.index, selected.item);
            if (items[cursor]) items[cursor].scrollIntoView({ block: "nearest" });
        }
    }

    selectAll() {
        this.selectionState.selectAll(this.items);
        this.updateSelectionUI();
    }
    copySelected(isCut = false) {
        if (this.readOnlyMode && isCut) return;
        if (this.selectionState.size === 0) return;
        const paths = this.selectionState.toArray().map((name) => joinHudPath(this.currentPath, name));
        this.clipboardState.set(isCut ? "cut" : "copy", paths);
        this.updateCutUI();
    }

    async paste() {
        if (this.readOnlyMode) return;
        if (!this.clipboardState.hasPaths()) return;
        try {
            const action = this.clipboardState.isCut() ? "move" : "copy";
            const { data } = await this.fmApi.action({ action, path: this.currentPath, sources: this.clipboardState.data.paths });
            if (data.success) {
                if (this.clipboardState.isCut()) this.clipboardState.clear();
            this.refreshCurrentPath();
            }
            else alert(data.error);
        } catch(e) { console.error(e); }
    }

    async createNewFolder() {
        if (this.readOnlyMode) return;
        const name = prompt("Enter new folder name:");
        if (!name) return;
        try {
            const { data } = await this.fmApi.action({ action: "create_folder", path: this.currentPath, name });
            if (data.success) this.refreshCurrentPath();
            else alert(data.error || "Failed to create folder");
        } catch(e) { console.error(e); }
    }

    async deleteSelected() {
        if (this.readOnlyMode) return;
        if (!this.selectionState.size || !confirm(`Delete ${this.selectionState.size} items?`)) return;
        try {
            const targets = this.selectionState.toArray().map((name) => joinHudPath(this.currentPath, name));
            const requests = targets.map((path) =>
                this.fmApi.action({ action: "delete", path }).then(({ data }) => {
                    return { ok: !!data?.success, error: data?.error || "Delete failed" };
                }).catch((err) => ({ ok: false, error: String(err) }))
            );
            const results = await Promise.all(requests);
            const failed = results.filter((r) => !r.ok);
            this.selectionState.clear();
            this.refreshCurrentPath();
            if (failed.length) {
                alert(`Delete partial failure: ${failed.length}/${results.length} failed`);
            }
        } catch(e) { alert("Delete failed"); }
    }

    async addBookmark(path) {
        if (this.readOnlyMode) return;
        try {
            const { data } = await this.fmApi.addBookmark(path);
            if (data.success) { 
                await this.renderSidebar(); 
            } else {
                alert(data.error || "Failed to add bookmark");
            }
        } catch (err) {
            console.error("Add bookmark error:", err);
        }
    }

    async removeBookmark(path) {
        if (this.readOnlyMode) return;
        await this.fmApi.removeBookmark(path);
        this.renderSidebar();
    }

    async openInOS(path = this.currentPath) {
        const { data } = await this.fmApi.action({ action: "open_os", path });
        if (!data.success) alert(data.error);
    }

    renderAddressBar() {
        if (!this.addressBar || !this.addressBarContent) return;
        this.addressBarContent.innerHTML = "";
        const mount = this.addressBarContent;
        
        const pathLower = this.currentPath.toLowerCase();
        const isInput = pathLower === "input" || pathLower.startsWith("input/");
        const isOutput = pathLower === "output" || pathLower.startsWith("output/");
        const isExternal = !isInput && !isOutput && (this.currentPath.includes(":") || this.currentPath.startsWith("/"));
        
        const parts = this.currentPath.split(/[\\/]/).filter(p => p);
        
        if (isExternal) {
            // For external paths, don't show "Library" root, just show path parts
            let build = "";
            parts.forEach((p, i) => {
                if (i > 0) {
                    const sep = document.createElement("span");
                    sep.style.margin = "0 5px";
                    sep.style.opacity = "0.3";
                    sep.textContent = ">";
                    mount.appendChild(sep);
                }
                
                if (i === 0 && p.includes(":")) build = p; 
                else build = build ? `${build}/${p}` : p;
                
                const span = document.createElement("span"); 
                span.className = "hud-fb-path-part"; 
                span.textContent = p;
                const target = build;
                span.onclick = () => this.loadPath(target);
                mount.appendChild(span);
            });
        } else {
            // For internal paths, show Output/Input root
            const root = document.createElement("span");
            root.className = "hud-fb-path-part";
            root.textContent = isInput ? "Input" : "Output";
            root.onclick = () => this.loadPath(isInput ? "input" : "output");
            mount.appendChild(root);

            let current = isInput ? "input" : "output";
            parts.forEach((p, i) => {
                const pLower = p.toLowerCase();
                if (i === 0 && (pLower === "input" || pLower === "output")) return;

                const sep = document.createElement("span");
                sep.style.margin = "0 5px";
                sep.style.opacity = "0.3";
                sep.textContent = ">";
                mount.appendChild(sep);

                current = current ? `${current}/${p}` : p;
                const part = document.createElement("span");
                part.className = "hud-fb-path-part";
                part.textContent = p;
                const target = current;
                part.onclick = () => this.loadPath(target);
                mount.appendChild(part);
            });
        }
        this.scrollAddressToEnd();
    }

    scrollAddressBar(delta = 160) {
        if (!this.addressBar) return;
        this.addressBar.scrollBy({ left: delta, behavior: "smooth" });
    }

    scrollAddressToEnd() {
        if (!this.addressBar) return;
        requestAnimationFrame(() => {
            this.addressBar.scrollLeft = this.addressBar.scrollWidth;
        });
    }

    async historyBack() {
        const path = this.pathHistory.back();
        if (path) this.loadPath(path, -1, true);
    }
    async historyForward() {
        const path = this.pathHistory.forward();
        if (path) this.loadPath(path, -1, true);
    }
    async navigateUp() { 
        if (!this.currentPath) return; 
        const parts = this.currentPath.split(/[\\/]/); 
        parts.pop(); 
        const parent = parts.join("/"); 
        
        // Check if parent is authorized
        const { status } = await this.fmApi.list(parent);
        if (status === 403) {
            if (confirm(`The parent folder is not registered. Register "${parent}" as a bookmark?`)) {
                await this.addBookmark(parent);
                this.loadPath(parent);
            }
        } else {
            this.loadPath(parent);
        }
    }

    showContextMenu(e, item) {
        e.preventDefault();
        e.stopPropagation();
        
        if (!item.is_empty_area && !this.selectionState.has(item.name)) {
            this.selectionState.setOnly(item.name, this.selectionState.lastIndex);
            this.updateSelectionUI();
        }

        this.closeContextMenu();

        const menu = document.createElement("div");
        menu.className = "hud-fb-context-menu";
        menu.style.left = e.clientX + "px";
        menu.style.top = e.clientY + "px";

        const addItem = (text, icon, action) => {
            const div = document.createElement("div");
            div.className = "hud-fb-cm-item";
            div.innerHTML = `<span>${icon}</span><span>${text}</span>`;
            div.onclick = () => { action(); menu.remove(); };
            menu.appendChild(div);
            return div;
        };

        if (item.is_empty_area) {
            if (!this.readOnlyMode && this.clipboardState.hasPaths()) {
                addItem("Paste", "📋", () => this.paste());
            }
            addItem("Open in OS", "📂", () => this.openInOS(this.currentPath));
            addItem("Refresh", "🔄", () => this.refreshCurrentPath());
        } else {
            if (!this.readOnlyMode && item.type === "dir") {
                addItem("Add to Bookmark", "📌", () => this.addBookmark(joinHudPath(this.currentPath, item.name)));
            }
            if (!this.readOnlyMode) addItem("Rename", "✏️", () => this.renameItem(item));

            if (!this.readOnlyMode) {
                const sep = document.createElement("div"); sep.className = "hud-fb-cm-sep"; menu.appendChild(sep);

                addItem("Copy", "📄", () => this.copySelected(false));
                addItem("Cut", "✂️", () => this.copySelected(true));
                if (this.clipboardState.hasPaths()) {
                    addItem("Paste", "📋", () => this.paste());
                }

                const sep2 = document.createElement("div"); sep2.className = "hud-fb-cm-sep"; menu.appendChild(sep2);
                addItem("Delete", "🗑️", () => this.deleteSelected());
            }
            addItem("Open in OS", "📂", () => this.openInOS(item.type === "dir" ? joinHudPath(this.currentPath, item.name) : this.currentPath));
        }

        document.body.appendChild(menu);
        
        const closeMenu = (ev) => { if (!menu.contains(ev.target)) { menu.remove(); document.removeEventListener("mousedown", closeMenu); } };
        document.addEventListener("mousedown", closeMenu, { once: true });
    }

    closeContextMenu() {
        const existing = document.querySelector(".hud-fb-context-menu");
        if (existing) existing.remove();
    }

    clearNodeDropHighlight() {
        const hl = document.getElementById("hud-fb-hl");
        if (hl) hl.style.display = "none";
    }

    resetTransientViewState() {
        this.selectionState.clear({ resetIndex: true });
        this.closeContextMenu();
        this.clearNodeDropHighlight();
        this.updateSelectionUI();
    }

    beginPathSwitchTransition() {
        if (!this.contentEl) return;
        this.isPathSwitching = true;
        this.pathSwitchStartedAt = Date.now();
        if (this.loadingOverlayEl) this.loadingOverlayEl.style.display = "flex";
        this.contentEl.style.pointerEvents = "none";
    }

    getPathSwitchMinLoadingMs(itemCount = 0) {
        const count = Number.isFinite(itemCount) ? Math.max(0, itemCount) : 0;
        // Fast for empty/small folders, slightly longer for dense folders.
        // 140ms + 2ms per item, clamped to [140ms, 500ms]
        return Math.max(140, Math.min(500, 140 + Math.floor(count * 2)));
    }

    endPathSwitchTransition(itemCount = 0) {
        if (!this.contentEl) return;
        this.isPathSwitching = false;
        const MIN_LOADING_MS = this.getPathSwitchMinLoadingMs(itemCount);
        const elapsed = Date.now() - (this.pathSwitchStartedAt || 0);
        const remaining = Math.max(0, MIN_LOADING_MS - elapsed);

        const finish = () => {
            requestAnimationFrame(() => {
                if (this.isPathSwitching || !this.contentEl) return;
                if (this.loadingOverlayEl) this.loadingOverlayEl.style.display = "none";
                this.contentEl.style.pointerEvents = "";
            });
        };

        if (remaining > 0) setTimeout(finish, remaining);
        else finish();
    }

    async renameItem(item) {
        if (this.readOnlyMode) return;
        const oldName = item.name;
        const newName = prompt(`Rename "${oldName}" to:`, oldName);
        if (!newName || newName === oldName) return;

        try {
            const oldPath = joinHudPath(this.currentPath, oldName);
            const { data } = await this.fmApi.action({ action: "rename", path: oldPath, new_name: newName });
            if (data.success) this.refreshCurrentPath();
            else alert(data.error);
        } catch(e) { alert("Rename failed"); }
    }

    refreshCurrentPath() {
        return this.loadPath(this.currentPath);
    }

    async inferCopiedInputFilename(sourceName) {
        const extIndex = sourceName.lastIndexOf(".");
        const base = extIndex > 0 ? sourceName.slice(0, extIndex) : sourceName;
        const ext = extIndex > 0 ? sourceName.slice(extIndex).toLowerCase() : "";

        const { data } = await this.fmApi.list("input");
        if (data?.error || !Array.isArray(data.items)) return sourceName;

        const files = data.items.filter((it) => it.type === "file");
        const candidates = files.filter((it) => {
            const name = String(it.name || "");
            if (!name) return false;
            if (ext && !name.toLowerCase().endsWith(ext)) return false;
            const nameBase = ext ? name.slice(0, -ext.length) : name;
            return nameBase === base || nameBase.startsWith(`${base}_`);
        });

        if (!candidates.length) return sourceName;
        candidates.sort((a, b) => (b.mtime || 0) - (a.mtime || 0));
        return candidates[0].name || sourceName;
    }

    async bridgeHudDropToLoadImage(node, dataTransfer) {
        if (!node || !dataTransfer) return false;
        const cls = String(node.comfyClass || "").toLowerCase();
        const title = String(node.title || "").toLowerCase();
        const isLoadImageNode = cls.includes("loadimage") || title.includes("load image");
        if (!isLoadImageNode) {
            this.dndLog("bridge skip: not load image node", { comfyClass: node.comfyClass, title: node.title });
            return false;
        }

        let sourcePath = "";
        let sourceFilename = "";

        try {
            const raw = dataTransfer.getData("comfyui/image");
            if (raw) {
                const payload = JSON.parse(raw);
                sourcePath = buildHudSourcePathFromPayload(payload);
                sourceFilename = String(payload?.filename || "").trim();
                this.dndLog("bridge payload parsed", payload, "-> sourcePath=", sourcePath);
            }
        } catch (_) {}

        if (!sourcePath) {
            const names = String(dataTransfer.getData("text/plain") || "")
                .split(/\r?\n/)
                .map((x) => x.trim())
                .filter(Boolean);
            const firstName = names[0] || "";
            if (!firstName) return false;
            sourceFilename = firstName;
            sourcePath = joinHudPath(this.currentPath, firstName);
            this.dndLog("bridge fallback text/plain", { names, sourcePath });
        }
        this.dndLog("bridge copy request", { sourcePath, sourceFilename, targetNode: { comfyClass: node.comfyClass, title: node.title } });

        const copyResult = await this.fmApi.action({
            action: "copy",
            path: "input",
            sources: [sourcePath],
        });
        const copyData = copyResult.data;
        this.dndLog("bridge copy response", { ok: copyResult.ok, status: copyResult.status, copyData });
        if (!copyResult.ok || !copyData?.success) {
            this.dndLog("bridge copy failed", { sourcePath, copyData });
            return false;
        }
        const copiedItem = Array.isArray(copyData?.items) ? copyData.items[0] : null;
        const targetFilename = String(copiedItem?.dest_name || "").trim() || await this.inferCopiedInputFilename(sourceFilename || "");
        if (!targetFilename) {
            this.dndLog("bridge target filename resolve failed", { copiedItem, sourceFilename });
            return false;
        }
        this.dndLog("bridge target filename", targetFilename);

        const imageWidget = node.widgets?.find((w) => String(w?.name || "").toLowerCase() === "image");
        if (imageWidget) {
            imageWidget.value = targetFilename;
            this.dndLog("bridge widget set", { widget: imageWidget.name, value: imageWidget.value });
        } else {
            this.dndLog("bridge widget missing", { nodeTitle: node.title, comfyClass: node.comfyClass });
        }

        if (typeof node.onWidgetChanged === "function" && imageWidget) {
            try { node.onWidgetChanged(imageWidget.name, imageWidget.value); } catch (_) {}
        }

        node.setDirtyCanvas?.(true, true);
        app.graph?.setDirtyCanvas?.(true, true);
        app.graph?.change?.();
        this.dndLog("bridge done");
        return true;
    }

    startLiveUpdate() {
        if (this.pollTimer) clearTimeout(this.pollTimer);
        const delay = document.hidden ? 20000 : 8000;
        this.pollTimer = setTimeout(async () => {
            if (!this.isVisible) return;
            if (document.hidden) {
                this.startLiveUpdate();
                return;
            }
            if (this.liveUpdateInFlight) {
                this.startLiveUpdate();
                return;
            }
            this.liveUpdateInFlight = true;
            this.liveUpdateAbortController = new AbortController();
            try {
                const { data } = await this.fmApi.list(this.currentPath, this.liveUpdateAbortController.signal);
                if (!data.error && generateItemsDirtyHash(data.items) !== this.lastDirtyHash) {
                    await this.refreshCurrentPath();
                }
            } catch (e) {
                if (e?.name !== "AbortError") console.error(e);
            } finally {
                this.liveUpdateInFlight = false;
                this.liveUpdateAbortController = null;
                this.startLiveUpdate();
            }
        }, delay);
    }
    toggle() { if (this.isVisible) this.hide(); else this.show(); }
    show(options = {}) { 
        if (!this.window) this.createWindow(); 
        this.setReadOnlyMode(!!options.readOnly);
        this.setFileExtensionFilter(options.fileExtensions || null);
        this.setContextMode(options.mode || "default", options);
        this.isVisible = true; 
        this.selectionState.clear();
        this.window.style.display = "flex"; 
        this.window.style.animation = "hudFadeScaleIn 0.3s ease-out"; 
        this.normalizeWindowGeometry();
        this.clampWindowToViewport();
        
        // Ensure focus
        requestAnimationFrame(() => {
            this.window.focus();
            if (document.activeElement !== this.window) {
                this.window.setAttribute("tabindex", "0");
                this.window.focus();
            }
        });
        
        this.refreshCurrentPath(); 
        this.startLiveUpdate(); 
    }
    hide() {
        if (!this.window) return;
        this.isVisible = false;
        this.closeContextMenu();
        this.clearNodeDropHighlight();
        this.window.style.display = "none";
        if (this.searchRenderRaf) {
            cancelAnimationFrame(this.searchRenderRaf);
            this.searchRenderRaf = null;
        }
        if (this.pollTimer) clearTimeout(this.pollTimer);
        this.pollTimer = null;
        if (this.liveUpdateAbortController) {
            this.liveUpdateAbortController.abort();
            this.liveUpdateAbortController = null;
        }
        this.liveUpdateInFlight = false;
    }

    destroy() {
        this.hide();
        if (this.loadPathAbortController) {
            this.loadPathAbortController.abort();
            this.loadPathAbortController = null;
        }
        if (this.boundGlobalToggleKeydown) {
            window.removeEventListener("keydown", this.boundGlobalToggleKeydown);
            this.boundGlobalToggleKeydown = null;
        }
        if (this.boundApiExecuted) {
            api.removeEventListener?.("executed", this.boundApiExecuted);
            this.boundApiExecuted = null;
        }
        if (this.safeDropHandlersAdded) {
            if (this.boundSafeDragEnter) document.removeEventListener("dragenter", this.boundSafeDragEnter, true);
            if (this.boundSafeDragLeave) document.removeEventListener("dragleave", this.boundSafeDragLeave, true);
            if (this.boundSafeDragOver) document.removeEventListener("dragover", this.boundSafeDragOver, true);
            if (this.boundSafeDrop) document.removeEventListener("drop", this.boundSafeDrop, true);
            if (this.boundSafeDragEnd) document.removeEventListener("dragend", this.boundSafeDragEnd, true);
            if (this.boundSafeDragEnter) window.removeEventListener("dragenter", this.boundSafeDragEnter, true);
            if (this.boundSafeDragLeave) window.removeEventListener("dragleave", this.boundSafeDragLeave, true);
            if (this.boundSafeDragOver) window.removeEventListener("dragover", this.boundSafeDragOver, true);
            if (this.boundSafeDrop) window.removeEventListener("drop", this.boundSafeDrop, true);
            if (this.boundSafeDragEnd) window.removeEventListener("dragend", this.boundSafeDragEnd, true);
            this.boundSafeDragEnter = null;
            this.boundSafeDragLeave = null;
            this.boundSafeDragOver = null;
            this.boundSafeDrop = null;
            this.boundSafeDragEnd = null;
            this.safeDropHandlersAdded = false;
            this.resolveDropNodeFromPoint = null;
            this.updateDropHighlight = null;
        }
        if (this.boundPseudoDragMove) {
            window.removeEventListener("mousemove", this.boundPseudoDragMove, true);
            this.boundPseudoDragMove = null;
        }
        if (this.boundPseudoDragUp) {
            window.removeEventListener("mouseup", this.boundPseudoDragUp, true);
            this.boundPseudoDragUp = null;
        }
        this.webViewPseudoDragState = null;
        if (this.boundBeforeUnload) {
            window.removeEventListener("beforeunload", this.boundBeforeUnload);
            this.boundBeforeUnload = null;
        }
        if (this.boundPageHide) {
            window.removeEventListener("pagehide", this.boundPageHide);
            this.boundPageHide = null;
        }
        if (this.boundWindowResize) {
            window.removeEventListener("resize", this.boundWindowResize);
            this.boundWindowResize = null;
        }
    }

    isTextEditingTarget(target) {
        if (!target) return false;
        if (target.isContentEditable) return true;
        const tag = String(target.tagName || "").toUpperCase();
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
        return !!target.closest?.("input, textarea, select, [contenteditable='true']");
    }
    setupDragging(header, resizer) {
        let isDragging = false, isResizing = false; let startX, startY, startW, startH, winX, winY;
        const onMouseDown = (e) => {
            if (e.target.closest(".hud-fb-close") || e.target.closest("button") || e.target.closest("select") || e.target.closest("input")) return;
            const hHit = e.target.closest(".hud-fb-header"); const rHit = e.target.closest(".hud-fb-resizer"); if (!hHit && !rHit) return;
            e.preventDefault();
            this.window.focus();
            this.normalizeWindowGeometry();
            const r = this.window.getBoundingClientRect();
            if (hHit) {
                isDragging = true;
                winX = r.left;
                winY = r.top;
            } else {
                isResizing = true;
                startW = r.width;
                startH = r.height;
                winX = r.left;
                winY = r.top;
            }
            startX = e.clientX;
            startY = e.clientY;
            const onMove = (me) => {
                const dx = me.clientX - startX;
                const dy = me.clientY - startY;
                if (isDragging) {
                    this.window.style.left = `${Math.round(winX + dx)}px`;
                    this.window.style.top = `${Math.round(winY + dy)}px`;
                } else if (isResizing) {
                    const margin = 12;
                    const minW = 560;
                    const minH = 420;
                    const maxW = Math.max(minW, window.innerWidth - margin * 2);
                    const maxH = Math.max(minH, window.innerHeight - margin * 2);
                    const nextW = Math.min(Math.max(startW + dx, minW), maxW);
                    const nextH = Math.min(Math.max(startH + dy, minH), maxH);
                    this.window.style.width = `${Math.round(nextW)}px`;
                    this.window.style.height = `${Math.round(nextH)}px`;
                    this.window.style.left = `${Math.round(winX)}px`;
                    this.window.style.top = `${Math.round(winY)}px`;
                }
                this.clampWindowToViewport();
            };
            const onUp = () => {
                isDragging = false;
                isResizing = false;
                this.clampWindowToViewport();
                document.removeEventListener("mousemove", onMove);
                document.removeEventListener("mouseup", onUp);
            };
            document.addEventListener("mousemove", onMove);
            document.addEventListener("mouseup", onUp);
        };
        header.addEventListener("mousedown", onMouseDown);
        resizer.addEventListener("mousedown", onMouseDown);

        this.boundWindowResize = () => this.clampWindowToViewport();
        window.addEventListener("resize", this.boundWindowResize);
    }
    setupMarquee() {
        this.contentEl.onmousedown = (e) => {
            if (e.button !== 0 || e.target !== this.contentEl) return;
            const rect = this.contentEl.getBoundingClientRect();
            const startX = e.clientX - rect.left + this.contentEl.scrollLeft;
            const startY = e.clientY - rect.top + this.contentEl.scrollTop;
            const marquee = document.createElement("div"); marquee.className = "hud-fb-marquee"; this.contentEl.appendChild(marquee);
            if (!e.ctrlKey && !e.metaKey) this.selectionState.clear();
            const onMove = (me) => {
                const curX = me.clientX - rect.left + this.contentEl.scrollLeft; const curY = me.clientY - rect.top + this.contentEl.scrollTop;
                const l = Math.min(startX, curX), t = Math.min(startY, curY), w = Math.abs(startX - curX), h = Math.abs(startY - curY);
                marquee.style.left = l + "px"; marquee.style.top = t + "px"; marquee.style.width = w + "px"; marquee.style.height = h + "px"; marquee.style.display = "block";
                const items = this.renderedItemEls;
                items.forEach((el, i) => {
                    const ir = { l: el.offsetLeft, t: el.offsetTop, r: el.offsetLeft + el.offsetWidth, b: el.offsetTop + el.offsetHeight };
                    const intersect = !(l > ir.r || l + w < ir.l || t > ir.b || t + h < ir.t);
                    if (!intersect) return;
                    const cached = this.filteredItemsCache[i];
                    if (cached?.item?.name) this.selectionState.add(cached.item.name);
                });
                this.updateSelectionUI();
            };
            const onUp = () => { this.contentEl.removeChild(marquee); document.removeEventListener("mousemove", onMove); document.removeEventListener("mouseup", onUp); };
            document.addEventListener("mousemove", onMove); document.addEventListener("mouseup", onUp);
        };
        
        // Handle context menu for empty area
        this.contentEl.oncontextmenu = (e) => {
            if (e.target === this.contentEl || e.target.className === "hud-fb-grid") {
                this.showContextMenu(e, { name: "", type: "dir", is_empty_area: true });
            }
        };

        // Handle deselection on simple click in empty area
        this.contentEl.addEventListener("click", (e) => {
            if (!e.target.closest(".hud-fb-item")) {
                this.selectionState.clear({ resetIndex: true });
                this.updateSelectionUI();
            }
        });
    }
    setupSafeDrop() {
        if (this.safeDropHandlersAdded) return;
        const isHUDDrag = (e) => {
            const types = Array.from(e?.dataTransfer?.types || []);
            return (
                types.includes("application/x-nexus-asset-intent") ||
                types.includes("application/x-comfyui-hud-origin") ||
                types.includes("comfyui/image") ||
                types.includes("text/plain") ||
                types.includes("Files")
            );
        };
        const isOverNode = (clientX, clientY) => {
            const canvas = document.getElementById("graph-canvas");
            if (!canvas) return null;
            const r = canvas.getBoundingClientRect();
            return app.graph.getNodeOnPos(clientX - r.left, clientY - r.top);
        };
        const getNodeById = (id) => {
            if (id == null || !Array.isArray(app.graph?._nodes)) return null;
            const targetId = String(id);
            for (let i = 0; i < app.graph._nodes.length; i++) {
                const n = app.graph._nodes[i];
                if (String(n?.id) === targetId) return n;
            }
            return null;
        };
        const resolveNodeFromDomPoint = (clientX, clientY) => {
            const elements = document.elementsFromPoint?.(clientX, clientY) || [];
            for (let i = 0; i < elements.length; i++) {
                const el = elements[i];
                const carrier = el?.closest?.("[data-node-id]");
                const nodeId = carrier?.getAttribute?.("data-node-id");
                if (!nodeId) continue;
                const node = getNodeById(nodeId);
                if (node) return node;
            }
            return null;
        };
        const toCanvasPos = (clientX, clientY) => {
            const canvas = document.getElementById("graph-canvas");
            if (!canvas) return null;
            const r = canvas.getBoundingClientRect();
            return {
                x: clientX - r.left,
                y: clientY - r.top,
                canvasRect: r,
            };
        };
        const toGraphPos = (clientX, clientY) => {
            const pos = toCanvasPos(clientX, clientY);
            if (!pos) return null;
            const scale = Number(app.canvas?.ds?.scale || 1);
            const offset = app.canvas?.ds?.offset || [0, 0];
            return [
                (pos.x - Number(offset[0] || 0)) / Math.max(scale, 0.001),
                (pos.y - Number(offset[1] || 0)) / Math.max(scale, 0.001),
            ];
        };
        const getActiveNexusAssetDrag = () => {
            const intent = window.__nexusActiveAssetDrag;
            if (!intent) return null;
            if (intent.expiresAt && Date.now() > intent.expiresAt) {
                window.__nexusActiveAssetDrag = null;
                return null;
            }
            return intent;
        };
        const getNexusAssetDropFeedbackSource = () => {
            const source = window.__nexusAssetDropFeedbackSource;
            if (!source) return null;
            if (source.expiresAt && Date.now() > source.expiresAt) {
                window.__nexusAssetDropFeedbackSource = null;
                return null;
            }
            return source;
        };
        const getNexusRailDropFeedbackOrigin = (intent) => ({
            x: Math.max(10, Number(intent?.railWidth || 0) + 10),
            y: window.innerHeight / 2,
        });
        const parseNexusAssetIntentText = (text) => {
            if (!text || typeof text !== "string") return null;
            const prefix = "nexus-asset-intent:";
            if (!text.startsWith(prefix)) return null;
            try {
                const parsed = JSON.parse(text.slice(prefix.length));
                if (!parsed || typeof parsed !== "object") return null;
                parsed.dragStartedAt = parsed.dragStartedAt || Date.now();
                parsed.expiresAt = parsed.expiresAt || Date.now() + 15000;
                parsed.dragId = parsed.dragId || "";
                return parsed;
            } catch {
                return null;
            }
        };
        const readNexusAssetIntentFromDataTransfer = (dataTransfer) => {
            if (!dataTransfer) return null;
            const types = Array.from(dataTransfer.types || []);
            const keys = [
                "application/x-nexus-asset-intent",
                "text/plain",
                "Text",
            ].filter((key) => types.includes(key) || key === "Text");
            for (const key of keys) {
                try {
                    const parsed = parseNexusAssetIntentText(dataTransfer.getData(key));
                    if (parsed) return parsed;
                } catch (_) {}
            }
            return null;
        };
        const hasNexusAssetIntentType = (dataTransfer) =>
            Array.from(dataTransfer?.types || []).includes("application/x-nexus-asset-intent");
        const getNexusDragIntent = (dataTransfer = null) =>
            getActiveNexusAssetDrag() ||
            readNexusAssetIntentFromDataTransfer(dataTransfer) ||
            (hasNexusAssetIntentType(dataTransfer)
                ? { mode: "Model", kind: "ModelFile", name: "model", displayName: "model" }
                : null);
        const isResolvedNexusModelIntent = (intent) => {
            if (!intent || (intent.mode !== "Model" && intent.kind !== "ModelFile")) return false;
            const hasIdentity = !!(intent.path || intent.modelDirectory || intent.sourceRoot === "models");
            const hasName = !!intent.name && intent.name !== "model";
            return hasIdentity && hasName;
        };
        const waitForResolvedNexusIntent = (initialIntent, timeoutMs = 220) => new Promise((resolve) => {
            if (isResolvedNexusModelIntent(initialIntent)) {
                resolve(initialIntent);
                return;
            }

            const startedAt = performance.now();
            const tick = () => {
                const activeIntent = getActiveNexusAssetDrag();
                if (isResolvedNexusModelIntent(activeIntent)) {
                    resolve(activeIntent);
                    return;
                }

                if (performance.now() - startedAt >= timeoutMs) {
                    resolve(isResolvedNexusModelIntent(initialIntent) ? initialIntent : null);
                    return;
                }

                requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);
        });
        const isNexusModelDrag = (dataTransfer = null) => {
            const intent = getNexusDragIntent(dataTransfer);
            return !!intent && (intent.mode === "Model" || intent.kind === "ModelFile");
        };
        const nodeInfo = (n) => ({
            title: String(n?.title || ""),
            comfyClass: String(n?.comfyClass || ""),
            type: String(n?.type || ""),
            widgetNames: Array.isArray(n?.widgets) ? n.widgets.map((w) => String(w?.name || "").toLowerCase()) : [],
        });
        const isLoadImageNode = (n) => {
            if (!n) return false;
            const cls = String(n.comfyClass || "").toLowerCase();
            const title = String(n.title || "").toLowerCase();
            const type = String(n.type || "").toLowerCase();
            const widgetNames = Array.isArray(n.widgets) ? n.widgets.map((w) => String(w?.name || "").toLowerCase()) : [];
            const hasImageWidget = widgetNames.includes("image");
            return (
                hasImageWidget ||
                cls.includes("loadimage") ||
                type.includes("loadimage") ||
                title.includes("load image")
            );
        };
        const isBatchLikeDropNode = (n) => {
            if (!n) return false;
            const cls = String(n.comfyClass || "").toLowerCase();
            const title = String(n.title || "").toLowerCase();
            const type = String(n.type || "").toLowerCase();
            return (
                cls.includes("batchimages") ||
                cls.includes("maskeditor") ||
                type.includes("batchimages") ||
                type.includes("maskeditor") ||
                title.includes("batch images")
            );
        };
        const hasImageLikeWidget = (n) => {
            if (!n || !Array.isArray(n.widgets)) return false;
            return n.widgets.some((w) => {
                const name = String(w?.name || "").toLowerCase();
                return name.includes("image") || name.includes("img") || name.includes("file") || name.includes("path");
            });
        };
        const isSupportedDropNode = (n) => isLoadImageNode(n) || isBatchLikeDropNode(n) || hasImageLikeWidget(n);
        const resolveDropNode = (clientX, clientY) => {
            const domPrimary = resolveNodeFromDomPoint(clientX, clientY);
            if (isSupportedDropNode(domPrimary)) return domPrimary;

            const primary = isOverNode(clientX, clientY);
            if (isSupportedDropNode(primary)) return primary;

            const pos = toCanvasPos(clientX, clientY);
            if (!pos || !Array.isArray(app.graph?._nodes)) return primary;
            const scale = Number(app.canvas?.ds?.scale || 1);
            const offset = app.canvas?.ds?.offset || [0, 0];
            const marginWorld = 18 / Math.max(scale, 0.001);
            const worldX = (pos.x - offset[0]) / Math.max(scale, 0.001);
            const worldY = (pos.y - offset[1]) / Math.max(scale, 0.001);

            const nodes = app.graph._nodes;
            for (let i = nodes.length - 1; i >= 0; i--) {
                const candidate = nodes[i];
                if (!isSupportedDropNode(candidate)) continue;
                const x = Number(candidate.pos?.[0] || 0);
                const y = Number(candidate.pos?.[1] || 0);
                const w = Number(candidate.size?.[0] || 0);
                const h = Number(candidate.size?.[1] || 0);
                if (worldX >= x - marginWorld && worldX <= x + w + marginWorld &&
                    worldY >= y - marginWorld && worldY <= y + h + marginWorld) {
                    return candidate;
                }
            }
            return domPrimary || primary;
        };
        const updateHL = (n) => {
            let hl = document.getElementById("hud-fb-hl"); if (!hl) { hl = document.createElement("div"); hl.id = "hud-fb-hl"; hl.className = "hud-fb-node-highlight"; document.body.appendChild(hl); }
            if (n) { const r = document.getElementById("graph-canvas").getBoundingClientRect(); const s = app.canvas.ds.scale, o = app.canvas.ds.offset; hl.style.left = ((n.pos[0] + o[0]) * s + r.left - 5) + "px"; hl.style.top = ((n.pos[1] + o[1]) * s + r.top - 5) + "px"; hl.style.width = (n.size[0] * s + 10) + "px"; hl.style.height = (n.size[1] * s + 10) + "px"; hl.style.display = "block"; } else hl.style.display = "none";
        };
        const nodeCenterToClient = (node) => {
            const canvas = document.getElementById("graph-canvas");
            if (!canvas || !node) return null;
            const rect = canvas.getBoundingClientRect();
            const scale = Number(app.canvas?.ds?.scale || 1);
            const offset = app.canvas?.ds?.offset || [0, 0];
            const size = Array.isArray(node.size) ? node.size : [180, 80];
            return {
                x: rect.left + (Number(node.pos?.[0] || 0) + Number(size[0] || 0) / 2 + Number(offset[0] || 0)) * scale,
                y: rect.top + (Number(node.pos?.[1] || 0) + 24 + Number(offset[1] || 0)) * scale,
            };
        };
        let nexusDragCue = null;
        let nexusDragCueTimer = null;
        const removeNexusDragCue = (immediate = false) => {
            if (nexusDragCueTimer) {
                clearTimeout(nexusDragCueTimer);
                nexusDragCueTimer = null;
            }
            const cue = nexusDragCue;
            nexusDragCue = null;
            if (!cue) return;
            if (immediate) {
                cue.remove();
                return;
            }
            cue.style.opacity = "0";
            cue.style.transform = "scale(.985)";
            setTimeout(() => cue.remove(), 180);
        };
        const updateNexusCanvasCueState = (intent, state = "ready") => {
            // Canvas overlay cue is intentionally disabled; native cursor + completion flyout are more reliable in WebView2.
        };
        const showNexusDragCue = (intent) => {
            removeNexusDragCue(true);
        };
        const showNexusDropAccepted = (from, intent) => {
            removeNexusDragCue(true);
        };
        const showNexusDropFlyout = (from, result) => {
            try {
                const targetNode = getNodeById(result?.nodeId);
                const targetPoint = Number.isFinite(result?.targetClientX) && Number.isFinite(result?.targetClientY)
                    ? { x: Number(result.targetClientX), y: Number(result.targetClientY) }
                    : null;
                const to = targetPoint || nodeCenterToClient(targetNode) || from;
                const chip = document.createElement("div");
                chip.textContent = result?.modelName || "Model";
                chip.style.position = "fixed";
                chip.style.left = `${from.x}px`;
                chip.style.top = `${from.y}px`;
                chip.style.maxWidth = "220px";
                chip.style.padding = "7px 10px";
                chip.style.borderRadius = "999px";
                chip.style.background = "linear-gradient(135deg, rgba(255,204,51,.96), rgba(141,231,255,.94))";
                chip.style.color = "#101723";
                chip.style.font = "700 11px/1.1 sans-serif";
                chip.style.whiteSpace = "nowrap";
                chip.style.overflow = "hidden";
                chip.style.textOverflow = "ellipsis";
                chip.style.pointerEvents = "none";
                chip.style.zIndex = "2147483647";
                chip.style.boxShadow = "0 10px 28px rgba(0,0,0,.32)";
                chip.style.transform = "translate3d(-50%, -50%, 0) scale(.92)";
                chip.style.willChange = "transform, opacity";
                document.body.appendChild(chip);

                const dx = to.x - from.x;
                const dy = to.y - from.y;
                chip.animate([
                    { transform: "translate3d(-50%, -50%, 0) scale(.92)", opacity: 0 },
                    { transform: "translate3d(-50%, -70%, 0) scale(1.05)", opacity: 1, offset: 0.18 },
                    { transform: `translate3d(calc(-50% + ${dx}px), calc(-50% + ${dy}px), 0) scale(.7)`, opacity: .92, offset: 0.78 },
                    { transform: `translate3d(calc(-50% + ${dx}px), calc(-50% + ${dy}px), 0) scale(1.18)`, opacity: 0 },
                ], {
                    duration: 760,
                    easing: "cubic-bezier(.18,.9,.2,1)",
                    fill: "forwards",
                }).onfinish = () => chip.remove();

                if (targetNode) {
                    updateHL(targetNode);
                    setTimeout(() => updateHL(null), 620);
                }
            } catch (err) {
                console.warn("Nexus drop flyout failed", err);
            }
        };
        window.NexusShowAssetDragCue = (intent) => showNexusDragCue(intent);
        window.NexusHideAssetDragCue = () => removeNexusDragCue(true);
        window.NexusShowAssetDropFeedback = (from, result) => showNexusDropFlyout(from, result);
        this.resolveDropNodeFromPoint = (clientX, clientY) => {
            const n = resolveDropNode(clientX, clientY);
            if (isSupportedDropNode(n)) return n;
            // Fallback: try raw node under pointer and let bridge-side widget resolution decide.
            const raw = isOverNode(clientX, clientY) || resolveNodeFromDomPoint(clientX, clientY);
            return raw || null;
        };
        this.updateDropHighlight = (n) => updateHL(n);
        this.boundSafeDragEnter = (e) => {
            this.dndLog("dragenter observed", {
                target: e?.target?.tagName || null,
                types: Array.from(e?.dataTransfer?.types || []),
            });
        };
        this.boundSafeDragLeave = (e) => {
            this.dndLog("dragleave observed", {
                target: e?.target?.tagName || null,
                types: Array.from(e?.dataTransfer?.types || []),
            });
        };
        this.boundSafeDragOver = (e) => {
            if (!isHUDDrag(e)) {
                this.dndLog("dragover ignored (not HUD drag)", {
                    types: Array.from(e?.dataTransfer?.types || []),
                });
                return;
            }
            e.preventDefault();
            e.stopPropagation();
            if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";

            if (isNexusModelDrag(e.dataTransfer)) {
                this.pendingDragOverEvent = null;
                this.safeDropLastValidNode = null;
                updateHL(null);
                return;
            }

            this.pendingDragOverEvent = { x: e.clientX, y: e.clientY, dataTransfer: e.dataTransfer };
            if (this.dragOverRaf) return;
            this.dragOverRaf = requestAnimationFrame(() => {
                this.dragOverRaf = null;
                const pending = this.pendingDragOverEvent;
                this.pendingDragOverEvent = null;
                if (!pending) return;
                const domNode = resolveNodeFromDomPoint(pending.x, pending.y);
                const n = resolveDropNode(pending.x, pending.y);
                const v = isSupportedDropNode(n);
                this.safeDropLastValidNode = v ? n : null;
                updateHL(v ? n : null);
                if (pending.dataTransfer) pending.dataTransfer.dropEffect = "copy";
                this.dndLog("dragover", {
                    x: pending.x,
                    y: pending.y,
                    domNode: domNode ? nodeInfo(domNode) : null,
                    overNode: n ? nodeInfo(n) : null,
                    valid: v,
                    types: Array.from(pending.dataTransfer?.types || []),
                });
            });
        };
        this.boundSafeDrop = async (e) => {
            if (!isHUDDrag(e)) {
                this.dndLog("drop ignored (not HUD drag)", {
                    types: Array.from(e?.dataTransfer?.types || []),
                });
                return;
            }
            const types = Array.from(e.dataTransfer?.types || []);
            const isStrictHUDDrag = types.includes("application/x-comfyui-hud-origin");
            const initialNexusDrag = getNexusDragIntent(e.dataTransfer);
            const isActiveNexusModelDrag = !!initialNexusDrag && (initialNexusDrag.mode === "Model" || initialNexusDrag.kind === "ModelFile");
            if (isActiveNexusModelDrag && typeof window.NexusHandleAssetDrop === "function") {
                e.stopImmediatePropagation();
                e.preventDefault();
                e.stopPropagation();

                const dropPoint = { x: e.clientX, y: e.clientY };
                this.safeDropLastValidNode = null;
                updateHL(null);

                const dropPayload = {
                    targetNode: null,
                    canvasPos: toGraphPos(e.clientX, e.clientY),
                    clientX: e.clientX,
                    clientY: e.clientY,
                };

                requestAnimationFrame(async () => {
                    try {
                        const resolvedIntent = await waitForResolvedNexusIntent(initialNexusDrag);
                        if (!resolvedIntent) {
                            removeNexusDragCue();
                            this.dndLog("drop nexus asset intent unresolved");
                            return;
                        }

                        updateNexusCanvasCueState(resolvedIntent, "creating");
                        const dropResult = window.NexusHandleAssetDrop(resolvedIntent, dropPayload);
                        removeNexusDragCue();
                        if (dropResult?.handled ?? dropResult) {
                            showNexusDropFlyout(getNexusRailDropFeedbackOrigin(resolvedIntent), {
                                ...dropResult,
                                targetClientX: dropPoint.x,
                                targetClientY: dropPoint.y,
                            });
                            this.dndLog("drop handled by nexus asset intent");
                        } else {
                            this.dndLog("drop nexus asset intent not handled");
                        }
                    } catch (err) {
                        removeNexusDragCue();
                        console.error("Nexus asset intent drop failed:", err);
                        this.dndLog("drop nexus asset intent exception", err);
                    }
                });
                return;
            }

            const n = resolveDropNode(e.clientX, e.clientY);
            const valid = isSupportedDropNode(n) || isSupportedDropNode(this.safeDropLastValidNode);
            const targetNode = isSupportedDropNode(n) ? n : this.safeDropLastValidNode;
            this.dndLog("drop captured", {
                overNode: n ? nodeInfo(n) : null,
                fallbackNode: this.safeDropLastValidNode ? nodeInfo(this.safeDropLastValidNode) : null,
                valid,
                nexusModelDrag: false,
                types,
            });
            let handled = false;
            if (targetNode) {
                // For Load Image, bridge HUD payload -> input copy + widget value set.
                // Prevent default only when bridge succeeds.
                if (!handled) {
                    try {
                        const bridged = await this.bridgeHudDropToLoadImage(targetNode, e.dataTransfer);
                        if (bridged) {
                            e.stopImmediatePropagation();
                            e.preventDefault();
                            e.stopPropagation();
                            handled = true;
                            this.dndLog("drop handled by bridge (default prevented)");
                        } else {
                            this.dndLog("drop passthrough (bridge not handled)");
                        }
                    } catch (err) {
                        console.error("HUD drop bridge failed:", err);
                        this.dndLog("drop bridge exception", err);
                    }
                }
            } else {
                this.dndLog("drop passthrough (no target node)");
            }
            // For strict HUD drag, block everything except explicitly supported targets.
            // This prevents accidental workflow-open when dropping on canvas/unsupported nodes.
            if (isStrictHUDDrag && !handled && !valid) {
                e.stopImmediatePropagation();
                e.preventDefault();
                e.stopPropagation();
                this.dndLog("drop blocked: strict HUD drag on unsupported target");
            } else if (isStrictHUDDrag && !handled && valid) {
                this.dndLog("drop passthrough: strict HUD drag on supported target");
            }
            const feedbackSource = types.includes("Files") ? getNexusAssetDropFeedbackSource() : null;
            if (feedbackSource) {
                window.__nexusAssetDropFeedbackSource = null;
                showNexusDropFlyout(getNexusRailDropFeedbackOrigin(feedbackSource), {
                    modelName: feedbackSource.displayName || feedbackSource.name || "Image",
                    targetClientX: e.clientX,
                    targetClientY: e.clientY,
                });
            }
            this.safeDropLastValidNode = null;
            updateHL(null);
        };
        this.boundSafeDragEnd = () => {
            this.safeDropLastValidNode = null;
            updateHL(null);
            removeNexusDragCue();
            this.dndLog("dragend observed");
        };
        // WebView2 can drop events on different dispatch roots depending on host state.
        // Register on both window and document to maximize capture reliability.
        document.addEventListener("dragenter", this.boundSafeDragEnter, true);
        document.addEventListener("dragleave", this.boundSafeDragLeave, true);
        document.addEventListener("dragover", this.boundSafeDragOver, true);
        document.addEventListener("drop", this.boundSafeDrop, true);
        document.addEventListener("dragend", this.boundSafeDragEnd, true);
        window.addEventListener("dragover", this.boundSafeDragOver, true);
        window.addEventListener("drop", this.boundSafeDrop, true);
        window.addEventListener("dragend", this.boundSafeDragEnd, true);
        window.addEventListener("dragenter", this.boundSafeDragEnter, true);
        window.addEventListener("dragleave", this.boundSafeDragLeave, true);
        this.safeDropHandlersAdded = true;
        this.dndLog("safeDrop handlers attached", { roots: ["window", "document"] });
    }
}

export const fileBrowser = new HUDFileBrowser();

