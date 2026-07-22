import { app } from "../../../scripts/app.js";
import { api } from "../../../scripts/api.js";

const ITEM_SIZE = 120;
const POOL_SIZE = 80;

const css = (el, obj) => {
    for (const k in obj) el.style[k] = obj[k];
    return el;
};

class ComfyUI_HUD_FileManager {
    constructor() {
        this.fileData = [];
        this.basePath = "";
        this.onSelect = null;
        this.currentPath = "output";
        this.initialized = false;
        this.updateViewRaf = null;
        this.boundScheduleUpdateView = null;
        this.boundEscKeydown = null;
        this.boundBeforeUnload = null;
        this.boundPageHide = null;
    }

    _init() {
        if (this.initialized) return;

        // 1. Global Overlay
        this.overlay = css(document.createElement("div"), {
            position: "fixed", top: "0", left: "0", width: "100vw", height: "100vh",
            background: "rgba(0,0,0,0.85)", zIndex: "10000", display: "none",
            justifyContent: "center", alignItems: "center", backdropFilter: "blur(8px)",
            fontFamily: "monospace", pointerEvents: "auto"
        });
        document.body.appendChild(this.overlay);

        // 2. Main Dialog
        this.dialog = css(document.createElement("div"), {
            width: "90%", height: "90%", background: "#0a0a0a", border: "1px solid #00ffcc44",
            borderRadius: "12px", display: "flex", flexDirection: "column", overflow: "hidden",
            boxShadow: "0 0 50px rgba(0,255,204,0.15)"
        });
        this.overlay.appendChild(this.dialog);

        // Header
        const header = css(document.createElement("div"), {
            padding: "15px 25px", background: "#111", borderBottom: "1px solid #222",
            display: "flex", justifyContent: "space-between", alignItems: "center"
        });
        header.innerHTML = `
            <div style="display:flex; align-items:center; gap:12px;">
                <div style="color:#00ffcc; font-weight:bold; font-size:18px; text-shadow:0 0 10px #00ffcc44;">📂 CUSTOM UTILITY FILE BROWSER</div>
                <div id="cu-path-badge" style="background:#222; padding:4px 10px; border-radius:4px; font-size:10px; color:#666;">PATH: -</div>
            </div>
        `;
        const closeBtn = css(document.createElement("button"), {
            background: "#ff4d6d22", border: "1px solid #ff4d6d44", color: "#ff4d6d",
            borderRadius: "4px", padding: "6px 16px", cursor: "pointer", fontWeight: "bold", transition: "all 0.2s"
        });
        closeBtn.textContent = "CLOSE ESC";
        closeBtn.onclick = () => this.hide();
        header.appendChild(closeBtn);
        this.dialog.appendChild(header);

        // Grid Area
        this.scrollViewport = css(document.createElement("div"), {
            flex: "1", overflowY: "auto", position: "relative", padding: "20px"
        });
        this.scrollContent = css(document.createElement("div"), { position: "relative", width: "100%" });
        this.scrollViewport.appendChild(this.scrollContent);
        this.dialog.appendChild(this.scrollViewport);

        // Object Pool
        this.itemPool = [];
        for (let i = 0; i < POOL_SIZE; i++) {
            const item = css(document.createElement("div"), {
                position: "absolute", width: ITEM_SIZE + "px", height: (ITEM_SIZE + 35) + "px",
                background: "#111", borderRadius: "8px", border: "1px solid #222",
                overflow: "hidden", cursor: "pointer", display: "flex", flexDirection: "column",
                transition: "all 0.2s"
            });
            const thumb = css(document.createElement("img"), { width: "100%", height: ITEM_SIZE + "px", objectFit: "cover", background: "#000" });
            const label = css(document.createElement("div"), { fontSize: "10px", padding: "6px 4px", textAlign: "center", color: "#aaa", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" });
            
            const overlay = css(document.createElement("div"), {
                position: "absolute", top: "0", left: "0", width: "100%", height: "100%",
                background: "rgba(0,0,0,0.8)", display: "flex", flexDirection: "column", 
                justifyContent: "center", alignItems: "center", opacity: "0", transition: "opacity 0.2s", gap: "10px"
            });
            
            const selectBtn = css(document.createElement("button"), { background: "#00ffcc", border: "none", borderRadius: "4px", color: "#000", fontSize: "11px", padding: "6px 20px", cursor: "pointer", fontWeight: "bold" });
            selectBtn.textContent = "SELECT";
            const deleteBtn = css(document.createElement("button"), { background: "#ff4d6d", border: "none", borderRadius: "4px", color: "#fff", fontSize: "11px", padding: "6px 20px", cursor: "pointer" });
            deleteBtn.textContent = "PURGE";

            overlay.appendChild(selectBtn);
            overlay.appendChild(deleteBtn);
            item.appendChild(thumb);
            item.appendChild(label);
            item.appendChild(overlay);

            item.onmouseenter = () => { overlay.style.opacity = "1"; item.style.borderColor = "#00ffcc"; item.style.transform = "scale(1.02)"; };
            item.onmouseleave = () => { overlay.style.opacity = "0"; item.style.borderColor = "#222"; item.style.transform = "scale(1)"; };

            this.itemPool.push({ el: item, thumb, label, selectBtn, deleteBtn, dataIdx: -1 });
            this.scrollContent.appendChild(item);
        }

        this.boundScheduleUpdateView = () => {
            if (this.updateViewRaf) return;
            this.updateViewRaf = requestAnimationFrame(() => {
                this.updateViewRaf = null;
                if (this.overlay.style.display === "flex") this.updateView();
            });
        };

        this.boundEscKeydown = (e) => {
            if (e.key === "Escape" && this.overlay.style.display === "flex") this.hide();
        };

        this.scrollViewport.onscroll = this.boundScheduleUpdateView;
        window.addEventListener("resize", this.boundScheduleUpdateView);
        window.addEventListener("keydown", this.boundEscKeydown);

        this.boundBeforeUnload = () => this.destroy();
        this.boundPageHide = () => this.destroy();
        window.addEventListener("beforeunload", this.boundBeforeUnload);
        window.addEventListener("pagehide", this.boundPageHide);

        this.initialized = true;
    }

    updateView() {
        const gap = 20;
        const width = this.scrollViewport.clientWidth - 40;
        const cols = Math.floor(width / (ITEM_SIZE + gap)) || 1;
        const scrollTop = this.scrollViewport.scrollTop;
        const startRow = Math.floor(scrollTop / (ITEM_SIZE + 35 + gap));
        
        this.itemPool.forEach((itemObj, i) => {
            const pRow = Math.floor(i / cols);
            const pCol = i % cols;
            const dataRow = startRow + pRow;
            const dataIdx = dataRow * cols + pCol;

            if (dataIdx < this.fileData.length) {
                const file = this.fileData[dataIdx];
                itemObj.el.style.display = "flex";
                itemObj.el.style.transform = `translate3d(${pCol * (ITEM_SIZE + gap)}px, ${dataRow * (ITEM_SIZE + 35 + gap)}px, 0)`;
                
                if (itemObj.dataIdx !== dataIdx) {
                    itemObj.label.textContent = file.name;
                    const nextSrc = file.is_image ? `/view?filename=${encodeURIComponent(file.name)}&type=output&subfolder=&t=${file.mtime}` : "";
                    if (itemObj.thumb.dataset.src !== nextSrc) {
                        itemObj.thumb.src = nextSrc;
                        itemObj.thumb.dataset.src = nextSrc;
                    }
                    
                    itemObj.selectBtn.onclick = () => {
                        if (this.onSelect) this.onSelect(file.name, this.basePath + "/" + file.name);
                        this.hide();
                    };

                    itemObj.deleteBtn.onclick = async (e) => {
                        e.stopPropagation();
                        if (confirm(`PURGE FILE PERMANENTLY?\n\n${file.name}`)) {
                            await this.deleteFile(file.name);
                        }
                    };
                    itemObj.dataIdx = dataIdx;
                }
            } else {
                itemObj.el.style.display = "none";
                itemObj.dataIdx = -1;
            }
        });

        const totalRows = Math.ceil(this.fileData.length / cols);
        this.scrollContent.style.height = (totalRows * (ITEM_SIZE + 35 + gap) + 40) + "px";
    }

    /**
     * Shows the Global File Browser
     * @param {Object} options - { path: string, onSelect: function }
     */
    async show({ path = "output", onSelect = null }) {
        this._init();
        this.onSelect = onSelect;
        this.currentPath = path;
        
        try {
            const response = await fetch(`/comfyui-hud/list?path=${encodeURIComponent(path)}`);
            const data = await response.json();
            if (data.error) throw new Error(data.error);
            
            this.fileData = data.files || [];
            this.basePath = data.base_path;
            
            document.getElementById("cu-path-badge").textContent = `PATH: ${this.basePath}`;
            this.itemPool.forEach(item => item.dataIdx = -1);
            this.overlay.style.display = "flex";
            this.scrollViewport.scrollTop = 0;
            this.updateView();
        } catch (e) {
            alert("File Browser Error: " + e.message);
            console.error(e);
        }
    }

    hide() { 
        if (this.updateViewRaf) {
            cancelAnimationFrame(this.updateViewRaf);
            this.updateViewRaf = null;
        }
        if (this.overlay) this.overlay.style.display = "none"; 
    }

    destroy() {
        this.hide();
        if (this.scrollViewport) this.scrollViewport.onscroll = null;
        if (this.boundScheduleUpdateView) {
            window.removeEventListener("resize", this.boundScheduleUpdateView);
            this.boundScheduleUpdateView = null;
        }
        if (this.boundEscKeydown) {
            window.removeEventListener("keydown", this.boundEscKeydown);
            this.boundEscKeydown = null;
        }
        if (this.boundBeforeUnload) {
            window.removeEventListener("beforeunload", this.boundBeforeUnload);
            this.boundBeforeUnload = null;
        }
        if (this.boundPageHide) {
            window.removeEventListener("pagehide", this.boundPageHide);
            this.boundPageHide = null;
        }
    }

    async deleteFile(filename) {
        try {
            const response = await api.fetchApi("/comfyui-hud/delete", {
                method: "POST",
                body: JSON.stringify({ path: this.basePath + "/" + filename })
            });
            const result = await response.json();
            if (result.success) {
                this.fileData = this.fileData.filter(f => f.name !== filename);
                this.updateView();
            } else {
                alert("Delete failed: " + result.error);
            }
        } catch (e) { console.error(e); }
    }
}

// Register as Global API
window.ComfyUI_HUD_FileManager = new ComfyUI_HUD_FileManager();

app.registerExtension({
    name: "ComfyUI_HUD.FileBrowserOverlay",
    async setup() {
        // Global initialization or context menu additions can go here
    }
});
