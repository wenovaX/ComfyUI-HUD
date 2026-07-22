import { app } from "/scripts/app.js";
import { api } from "/scripts/api.js";

/**
 * HUD Global HUD (Queue-Detective Version)
 * - Directly queries api.getQueue() on load
 * - Rapid polling for the first 2 seconds to recover state
 */

app.registerExtension({
    name: "ComfyUI_HUD.HUD",
    
    async setup() {
        const openAssetHub = async (path = "output") => {
            try {
                const mod = await import("./asset_hub_browser.js");
                const fb = mod?.fileBrowser;
                if (!fb) return;
                fb.show();
                if (path) fb.loadPath(path);
            } catch (err) {
                console.error("Asset Hub load failed:", err);
            }
        };

        const findTopbarGroup = () => {
            // 1) Try direct manager button lookup first (works across legacy/new menu variants)
            const managerBtn = document.querySelector(
                'button[title="ComfyUI Manager"], button[aria-label="ComfyUI Manager"]'
            );
            if (managerBtn) {
                const group = managerBtn.closest('.comfyui-button-group');
                if (group) return group;
            }

            // 2) Fallback: known topbar containers (legacy + newer UI layouts)
            const containers = [
                '[data-testid="legacy-topbar-container"]',
                '[data-testid="topbar-container"]',
                'header',
            ];
            for (const selector of containers) {
                const root = document.querySelector(selector);
                if (!root) continue;
                const group = root.querySelector('.comfyui-button-group');
                if (group) return group;
            }

            // 3) Last resort: any visible button group
            return document.querySelector('.comfyui-button-group');
        };

        const findAndInject = () => {
            const group = findTopbarGroup();
            if (!group) return false;
            this.initHud(group, openAssetHub);
            return true;
        };

        if (!findAndInject()) {
            const observer = new MutationObserver(() => {
                if (findAndInject()) observer.disconnect();
            });
            observer.observe(document.body, { childList: true, subtree: true });
        }
    },

    initHud(parent, openAssetHub) {
        if (document.getElementById("hud-global-hud")) return;

        const hud = document.createElement("div");
        hud.id = "hud-global-hud";
        
        Object.assign(hud.style, {
            display: "inline-flex",
            alignItems: "center",
            gap: "10px",
            padding: "0 14px",
            height: "34px",
            fontSize: "13.5px",
            fontWeight: "950",
            fontFamily: "'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
            color: "var(--fg-color, #00ffcc)",
            background: "rgba(0, 0, 0, 0.35)",
            borderRadius: "8px",
            border: "1px solid rgba(0, 255, 204, 0.3)",
            marginRight: "10px",
            pointerEvents: "auto",
            userSelect: "none",
            letterSpacing: "-0.5px"
        });

        hud.innerHTML = `
            <span id="hud-hud-status" style="font-size:17px; margin-right:2px;">💤</span>
            <span id="hud-hud-gpu-util">0%</span>
            <span style="opacity:0.3; font-weight:100; margin: 0 2px;">|</span>
            <span id="hud-hud-vram-text">0/0GB</span>
        `;

        // --- ENHANCED ASSET HUB BUTTON (Visual Polish for Dark Backgrounds) ---
        const hubBtn = document.createElement("button");
        hubBtn.id = "hud-asset-hub-btn";
        Object.assign(hubBtn.style, {
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: "60px",
            height: "34px",
            padding: "0",
            background: "rgba(255, 255, 255, 0.03)", // Very subtle background layer
            border: "none",
            borderRadius: "8px",
            cursor: "pointer",
            marginLeft: "0px",
            marginRight: "10px",
            pointerEvents: "auto",
            transition: "all 0.2s ease",
            boxSizing: "border-box"
        });
        hubBtn.title = "Asset Hub (Output)";

        const icon = document.createElement("img");
        icon.src = "/hud/img/hud-asset-hub.png?123";
        icon.style.marginTop = "0";
        icon.style.width = "22px";
        icon.style.height = "22px";
        icon.style.objectFit = "contain";
        icon.style.pointerEvents = "none";
        // Apply initial brightness and glow for visibility on dark backgrounds
        icon.style.filter = "brightness(1.2) drop-shadow(0 0 4px rgba(0, 255, 204, 0.25))";
        icon.style.transition = "transform 0.2s ease, filter 0.2s ease";
        hubBtn.appendChild(icon);

        hubBtn.onmouseenter = () => {
            hubBtn.style.background = "rgba(255, 255, 255, 0.08)";
            icon.style.transform = "scale(1.1) translateY(-1px)";
            // Amplify glow and brightness on hover
            icon.style.filter = "brightness(1.4) drop-shadow(0 0 10px rgba(0, 255, 204, 0.6))";
        };
        hubBtn.onmouseleave = () => {
            hubBtn.style.background = "rgba(255, 255, 255, 0.03)";
            icon.style.transform = "scale(1) translateY(0)";
            icon.style.filter = "brightness(1.2) drop-shadow(0 0 4px rgba(0, 255, 204, 0.25))";
        };

        hubBtn.onclick = () => openAssetHub("output");

        parent.prepend(hubBtn);
        parent.prepend(hud);

        let isExecuting = false;
        let idleTimer = null;
        let lastDataSnapshot = null;

        const updateDisplay = (data, isRunning) => {
            const h = document.getElementById("hud-global-hud");
            if (!h) return;
            if (data) lastDataSnapshot = data;

            const statusEl = document.getElementById("hud-hud-status");
            const isAppRunning = app.running_node_id !== null && typeof app.running_node_id !== 'undefined';
            const finalRunning = isRunning || (lastDataSnapshot && lastDataSnapshot.is_running === true) || isAppRunning;
            
            statusEl.textContent = finalRunning ? "🚀" : "💤";
            
            if (finalRunning) {
                statusEl.style.animation = "hudHudPulse 0.8s infinite";
                h.style.background = "rgba(255, 77, 109, 0.15)";
                h.style.borderColor = "rgba(255, 77, 109, 0.5)";
                h.style.color = "#ff4d6d";
            } else {
                statusEl.style.animation = "none";
                h.style.background = "rgba(0, 0, 0, 0.35)";
                h.style.borderColor = "rgba(0, 255, 204, 0.3)";
                h.style.color = "var(--fg-color, #00ffcc)";
            }

            if (lastDataSnapshot) {
                let activeGpu = lastDataSnapshot.devices.find(d => d.utilization > 5) || lastDataSnapshot.devices[0];
                if (activeGpu) {
                    const utilEl = document.getElementById("hud-hud-gpu-util");
                    const vramEl = document.getElementById("hud-hud-vram-text");
                    utilEl.textContent = `${activeGpu.utilization}%`;
                    const activeGB = (activeGpu.used_vram / (1024**3)).toFixed(1);
                    const totalGB = (activeGpu.total_vram / (1024**3)).toFixed(1);
                    vramEl.textContent = `${activeGB}/${totalGB}GB`;
                }
            }
        };

        const setExecuting = (val) => {
            if (val) {
                if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
                isExecuting = true;
                updateDisplay(null, true);
            } else {
                if (!idleTimer) {
                    idleTimer = setTimeout(() => {
                        isExecuting = false;
                        idleTimer = null;
                        updateDisplay(null, false);
                    }, 500);
                }
            }
        };

        api.addEventListener("executing", (e) => setExecuting(!!e.detail));
        api.addEventListener("status", (e) => { if (e.detail && e.detail.exec_info) setExecuting(e.detail.exec_info.queue_remaining > 0); });
        api.addEventListener("hud_gpu_stats", (e) => updateDisplay(e.detail, isExecuting));
        api.addEventListener("comfyui_hud_gpu_stats", (e) => updateDisplay(e.detail, isExecuting));

        let rapidCheckCount = 0;
        const rapidTimer = setInterval(() => {
            updateDisplay(null, isExecuting);
            if (++rapidCheckCount > 20) clearInterval(rapidTimer);
        }, 100);

        api.getQueue().then(q => {
            if (q && (q.Running?.length > 0 || q.Pending?.length > 0)) setExecuting(true);
        });

        fetch("/hud/gpu_stats").then(r => r.json()).then(d => updateDisplay(d, isExecuting)).catch(() => {});

        if (!document.getElementById("hud-hud-style")) {
            const style = document.createElement("style");
            style.id = "hud-hud-style";
            style.innerHTML = `@keyframes hudHudPulse { 0%, 100% { opacity: 1; transform: scale(1.1); } 50% { opacity: 0.3; transform: scale(0.9); } }`;
            document.head.appendChild(style);
        }
    }
});
