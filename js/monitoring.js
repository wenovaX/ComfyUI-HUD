import { app } from "/scripts/app.js";
import { api } from "/scripts/api.js";
import { css, applyComfyUI_HUD_NodeStyle } from "./shared_styles.js";
import { constrainNodeSize } from "./node_size_utils.js";
import { safeRegisterExtension } from "./safe_register.js";

const GPU_MONITOR_SIZE = {
    defaultWidth: 560,
    defaultHeight: 325,
};
const LOG_MONITOR_SIZE = {
    defaultWidth: 350,
    defaultHeight: 350,
};

safeRegisterExtension({
    name: "ComfyUI_HUD.GPUMonitor",
    
    async nodeCreated(node) {
        if (node.comfyClass !== "ComfyUI_HUD_GPUMonitor") return;

        const refreshWidget = node.widgets.find(w => w.name === "refresh_rate");
        let latestRefreshRate = Number(refreshWidget?.value || 1.0);
        let pollTimer = null;

        const fetchGpuStats = () => {
            fetch("/hud/gpu_stats")
                .then((r) => r.ok ? r.json() : null)
                .then((d) => { if (d && !d.error) updateUI(d); })
                .catch(() => {});
        };

        const startPolling = () => {
            if (pollTimer) clearInterval(pollTimer);
            pollTimer = setInterval(fetchGpuStats, Math.max(200, latestRefreshRate * 1000));
        };

        if (refreshWidget) {
            refreshWidget.callback = (val) => {
                latestRefreshRate = Math.max(0.2, Math.min(10.0, Number(val) || 1.0));
                fetch("/hud/set_interval", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ interval: latestRefreshRate })
                }).catch(() => {});
                startPolling();
            };
        }

        const container = css(document.createElement("div"), {
            padding: "0", display: "flex", flexDirection: "column", gap: "0",
            borderRadius: "24px", background: "rgba(10, 15, 25, 0.98)",
            border: "2px solid rgba(0, 255, 204, 0.3)", boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
            marginTop: "10px", position: "relative", overflow: "hidden",
            width: "100%", height: "100%", boxSizing: "border-box",
            transition: "all 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275)",
            pointerEvents: "none"
        });

        const signature = css(document.createElement("div"), {
            width: "100%", height: "2px", flexShrink: "0",
            background: "linear-gradient(270deg, #ff5f7a, #ffb86b, #ffe56a, #5fffb2, #63d8ff, #7a8cff, #c46bff, #ff5f7a)",
            backgroundSize: "400% 100%", animation: "hudRainbowFlow 4s linear infinite",
            opacity: "0.8"
        });

        const inner = css(document.createElement("div"), {
            padding: "24px", display: "flex", flexDirection: "column", gap: "20px", flex: "1 1 auto"
        });

        if (!document.getElementById("hud-monitoring-anim")) {
            const style = document.createElement("style");
            style.id = "hud-monitoring-anim";
            style.innerHTML = `
                @keyframes hudFloatingIdle { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }
                @keyframes hudFloatingRunning { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-15px); } }
                @keyframes hudBorderGlowRunning {
                    0%, 100% { border-color: #ff4d6d; box-shadow: 0 0 20px rgba(255, 77, 109, 0.4), 0 20px 60px rgba(0,0,0,0.6); }
                    50% { border-color: #ff1a4a; box-shadow: 0 0 40px rgba(255, 26, 74, 0.8), 0 20px 60px rgba(0,0,0,0.6); }
                }
                @keyframes hudBorderGlowIdle {
                    0%, 100% { border-color: rgba(0, 255, 204, 0.3); box-shadow: 0 0 10px rgba(0, 255, 204, 0.1), 0 20px 60px rgba(0,0,0,0.6); }
                    50% { border-color: rgba(0, 255, 204, 0.6); box-shadow: 0 0 25px rgba(0, 255, 204, 0.3), 0 20px 60px rgba(0,0,0,0.6); }
                }
                @keyframes hudShimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
                
                /* Hacker Terminal Effects */
                @keyframes hudScanline { 0% { transform: translateY(-100%); } 100% { transform: translateY(100%); } }
                @keyframes hudTerminalFlicker {
                    0%, 100% { opacity: 0.98; }
                    50% { opacity: 1; }
                    80% { opacity: 0.96; }
                }
                @keyframes hudLogGlitch {
                    0% { transform: translate(0); filter: hue-rotate(0deg); }
                    20% { transform: translate(-2px, 1px); filter: hue-rotate(90deg); }
                    40% { transform: translate(2px, -1px); filter: hue-rotate(180deg); }
                    100% { transform: translate(0); filter: hue-rotate(0deg); }
                }
                @keyframes hudErrorShake {
                    0%, 100% { transform: translateX(0); }
                    25% { transform: translateX(-4px); }
                    75% { transform: translateX(4px); }
                }
                @keyframes hudBlinkCursor { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
                @keyframes hudArrowPulseLeft {
                    0%, 100% { opacity: 0.2; transform: translateX(3px); }
                    50% { opacity: 1; transform: translateX(-2px); text-shadow: 0 0 10px #00ffcc; }
                }
                @keyframes hudArrowPulseRight {
                    0%, 100% { opacity: 0.2; transform: translateX(-3px); }
                    50% { opacity: 1; transform: translateX(2px); text-shadow: 0 0 10px #00ffcc; }
                }
                @keyframes hudProgressHeadPulse {
                    0%, 100% { opacity: 1; background: #ffffff; box-shadow: 0 0 5px #ffffff, 0 0 15px #00ffcc, 0 0 30px #00ffcc; }
                    50% { opacity: 0.7; background: #00ffcc; box-shadow: 0 0 2px #00ffcc, 0 0 8px #00ffcc; }
                }
            `;
            document.head.appendChild(style);
        }

        const titleRow = css(document.createElement("div"), { display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", flexShrink: "0" });
        const title = css(document.createElement("div"), { fontSize: "17px", fontWeight: "900", color: "#00ffcc", letterSpacing: "3px" });
        title.textContent = "GPU DASHBOARD";
        
        const statusCard = css(document.createElement("div"), { 
            padding: "10px 20px", borderRadius: "14px", fontSize: "18px", fontWeight: "950", 
            display: "flex", alignItems: "center", gap: "10px", minWidth: "130px", justifyContent: "center",
            boxShadow: "0 4px 15px rgba(0,0,0,0.3)", border: "2px solid rgba(255,255,255,0.1)",
            transition: "all 0.4s ease"
        });
        statusCard.id = "hud-status-badge";
        
        titleRow.append(title, statusCard);
        const deviceList = css(document.createElement("div"), { display: "flex", flexDirection: "column", gap: "24px", flex: "1 1 auto", width: "100%", overflow: "hidden" });
        
        inner.append(titleRow, deviceList);
        container.append(signature, inner);
        
        const gpuMonitorWidget = node.addDOMWidget("comfyui_hud_gpu_monitor", "preview", container);
        node.resizable = true;
        const releaseSizeConstraint = constrainNodeSize(node, {
            ...GPU_MONITOR_SIZE,
            widget: gpuMonitorWidget,
            fitWidgetToNode: true,
            getWidgetOffset: () => ((node.widgets?.length || 0) * 30) + 20,
        });

        let isExecuting = false;
        let idleResetTimer = null;
        let lastData = null;

        const updateStatusUI = () => {
            const isAppRunning = app.running_node_id !== null && typeof app.running_node_id !== 'undefined';
            const finalRunning = (lastData && lastData.is_running) || isExecuting || isAppRunning;
            if (finalRunning) {
                container.style.animation = "hudBorderGlowRunning 1s infinite, hudFloatingRunning 2s ease-in-out infinite";
                statusCard.innerHTML = `<span>🚀</span><span>RUNNING</span>`;
                css(statusCard, { background: "rgba(255, 77, 109, 0.25)", color: "#ff4d6d", borderColor: "#ff4d6d", opacity: "1", transform: "scale(1.05)" });
            } else {
                container.style.animation = "hudBorderGlowIdle 4s infinite, hudFloatingIdle 4s ease-in-out infinite";
                statusCard.innerHTML = `<span>💤</span><span>IDLE</span>`;
                css(statusCard, { background: "rgba(0, 204, 255, 0.15)", color: "#00ccff", borderColor: "rgba(0, 204, 255, 0.5)", opacity: "0.7", transform: "scale(1)" });
            }
        };

        const setExecuting = (val) => {
            if (val) {
                if (idleResetTimer) { clearTimeout(idleResetTimer); idleResetTimer = null; }
                isExecuting = true;
                updateStatusUI();
            } else {
                if (!idleResetTimer) {
                    idleResetTimer = setTimeout(() => {
                        isExecuting = false;
                        idleResetTimer = null;
                        updateStatusUI();
                    }, 500);
                }
            }
        };

        const updateUI = (data) => {
            if (!data || !data.devices) return;
            lastData = data;
            data.devices.forEach((dev, idx) => {
                let devBox = deviceList.querySelector(`[data-gpu-idx="${idx}"]`);
                const totalVram = Math.max(Number(dev.total_vram) || 0, 1);
                const usedVram = Math.max(Number(dev.used_vram) || 0, 0);
                const reservedVram = Math.max(Number(dev.reserved_vram) || 0, 0);
                const usedPct = Math.min((usedVram / totalVram) * 100, 100);
                const reservedPct = Math.min((reservedVram / totalVram) * 100, 100);
                let accentColor = usedPct >= 85 ? "#ff4d6d" : (usedPct >= 50 ? "#ffb86b" : "#00ffcc");
                if (!devBox) {
                    devBox = document.createElement("div");
                    devBox.dataset.gpuIdx = idx;
                    css(devBox, { display: "flex", flexDirection: "column", gap: "10px", width: "100%" });
                    const infoRow = css(document.createElement("div"), { display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "12px", width: "100%" });
                    const info = css(document.createElement("div"), { fontSize: "16px", fontWeight: "900", color: "rgba(255,255,255,0.7)", minWidth: "0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" });
                    info.textContent = dev.name;
                    const vramSpan = css(document.createElement("span"), { fontSize: "15px", fontWeight: "950", color: "rgba(255,255,255,0.8)", whiteSpace: "nowrap" });
                    vramSpan.className = "hud-gpu-vram";
                    infoRow.append(info, vramSpan);
                    const gaugeWrap = css(document.createElement("div"), { height: "45px", width: "100%", borderRadius: "12px", background: "rgba(0,0,0,0.7)", position: "relative", overflow: "hidden", border: "2px solid rgba(255,255,255,0.15)" });
                    const ghostBar = css(document.createElement("div"), { position: "absolute", top: "0", left: "0", height: "100%", width: "0%", background: "rgba(255,255,255,0.25)", transition: "width 1.2s ease" });
                    const liveBar = css(document.createElement("div"), { position: "absolute", top: "0", left: "0", height: "100%", width: "0%", backgroundSize: "200% 100%", transition: "width 0.8s ease", animation: "hudShimmer 2s infinite linear", zIndex: "2" });
                    const memText = css(document.createElement("div"), { display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: "12px", width: "100%" });
                    const pctSpan = css(document.createElement("span"), { fontSize: "52px", fontWeight: "950", lineHeight: "1", letterSpacing: "-3px" });
                    pctSpan.className = "hud-gpu-pct";
                    const reservedSpan = css(document.createElement("span"), { fontSize: "14px", fontWeight: "950", color: "rgba(255,255,255,0.45)", lineHeight: "1.2", textAlign: "right", whiteSpace: "nowrap", paddingBottom: "5px" });
                    reservedSpan.className = "hud-gpu-reserved";
                    gaugeWrap.append(ghostBar, liveBar); memText.append(pctSpan, reservedSpan);
                    devBox.append(infoRow, gaugeWrap, memText); deviceList.appendChild(devBox);
                }
                const ghostBar = devBox.querySelector("div:nth-child(2) > div:nth-child(1)");
                const liveBar = devBox.querySelector("div:nth-child(2) > div:nth-child(2)");
                const vramSpan = devBox.querySelector(".hud-gpu-vram");
                const pctSpan = devBox.querySelector(".hud-gpu-pct");
                const reservedSpan = devBox.querySelector(".hud-gpu-reserved");
                if (ghostBar) ghostBar.style.width = `${reservedPct}%`;
                if (liveBar) { liveBar.style.width = `${usedPct}%`; liveBar.style.background = `linear-gradient(90deg, ${accentColor}, #ffffff, ${accentColor})`; }
                const usedVal = (usedVram / (1024**3)).toFixed(1);
                const reservedVal = (reservedVram / (1024**3)).toFixed(1);
                const totalVal = (totalVram / (1024**3)).toFixed(1);
                if (vramSpan) vramSpan.innerHTML = `<span style="color:${accentColor}">${usedVal}GB</span> / <span style="color:#00ccff">${totalVal}GB</span>`;
                if (pctSpan) { pctSpan.textContent = `${usedPct.toFixed(1)}%`; pctSpan.style.color = accentColor; }
                if (reservedSpan) reservedSpan.textContent = `${reservedVal}GB RESERVED`;
            });
            updateStatusUI();
        };

        const onGpuStats = (e) => updateUI(e.detail);
        const onExecuting = (e) => setExecuting(!!e.detail);
        const onStatus = (e) => { if (e.detail && e.detail.exec_info) setExecuting(e.detail.exec_info.queue_remaining > 0); };

        api.addEventListener("comfyui_hud_gpu_stats", onGpuStats);
        api.addEventListener("executing", onExecuting);
        api.addEventListener("status", onStatus);

        let rapidCheckCount = 0;
        const rapidTimer = setInterval(() => {
            updateStatusUI();
            if (++rapidCheckCount > 20) clearInterval(rapidTimer);
        }, 100);

        api.getQueue().then(q => { if (q && (q.Running?.length > 0 || q.Pending?.length > 0)) setExecuting(true); });
        fetchGpuStats();
        startPolling();

        node.onRemoved = () => {
            clearInterval(rapidTimer);
            if (pollTimer) clearInterval(pollTimer);
            api.removeEventListener("comfyui_hud_gpu_stats", onGpuStats);
            api.removeEventListener("executing", onExecuting);
            api.removeEventListener("status", onStatus);
            releaseSizeConstraint();
        };

        setTimeout(() => applyComfyUI_HUD_NodeStyle(node, { bodyWash: "rgba(10,14,20,0.3)" }), 100);
    }
});

// === Log Monitor Integration ===
const LOG_STORAGE_KEY = "hud.monitoring.logs";
let GLOBAL_LOGS = [];
try {
    const cached = localStorage.getItem(LOG_STORAGE_KEY);
    if (cached) GLOBAL_LOGS = JSON.parse(cached);
} catch (e) {}
if (!Array.isArray(GLOBAL_LOGS)) GLOBAL_LOGS = [];

const LOG_SUBSCRIBERS = new Set();
let CURRENT_PROGRESS = { value: 0, max: 0, nodeId: null };
const PROGRESS_SUBSCRIBERS = new Set();

function pushLog(entry) {
    GLOBAL_LOGS.push(entry);
    if (GLOBAL_LOGS.length > 500) GLOBAL_LOGS.shift();
    try {
        localStorage.setItem(LOG_STORAGE_KEY, JSON.stringify(GLOBAL_LOGS));
    } catch (e) {}
    LOG_SUBSCRIBERS.forEach(cb => cb(entry));
}

function makeTime() {
    return new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

// Our plugin logs (source: "hud")
api.addEventListener("comfyui_hud_log", (e) => {
    const { message, node, level } = e.detail;
    pushLog({ time: makeTime(), node: node || "System", message, level: level || "info", source: "hud" });
});

// Workflow execution events (source: "system")
api.addEventListener("execution_start", () => {
    CURRENT_PROGRESS = { value: 0, max: 0, nodeId: null };
    PROGRESS_SUBSCRIBERS.forEach(cb => cb(CURRENT_PROGRESS));
    pushLog({ time: makeTime(), node: "Workflow", message: "\u25b6 Execution started", level: "info", source: "system" });
});

api.addEventListener("executing", (e) => {
    const nodeId = e.detail;
    if (nodeId) {
        const graphNode = app.graph?.getNodeById?.(Number(nodeId));
        const title = graphNode?.title || graphNode?.type || `#${nodeId}`;
        pushLog({ time: makeTime(), node: "Workflow", message: `\u26a1 ${title}`, level: "info", source: "system" });
    } else {
        CURRENT_PROGRESS = { value: 0, max: 0, nodeId: null };
        PROGRESS_SUBSCRIBERS.forEach(cb => cb(CURRENT_PROGRESS));
        pushLog({ time: makeTime(), node: "Workflow", message: "\u2705 Execution complete", level: "info", source: "system" });
    }
});

api.addEventListener("progress", (e) => {
    const { value, max, node } = e.detail;
    CURRENT_PROGRESS = { value, max, nodeId: node };
    PROGRESS_SUBSCRIBERS.forEach(cb => cb(CURRENT_PROGRESS));
});

api.addEventListener("execution_error", (e) => {
    const detail = e.detail || {};
    const msg = detail.exception_message || detail.message || "Unknown error";
    pushLog({ time: makeTime(), node: "Workflow", message: `\u274c ${msg}`, level: "error", source: "system" });
});

safeRegisterExtension({
    name: "ComfyUI_HUD.LogMonitor",
    
    async nodeCreated(node) {
        if (node.comfyClass !== "ComfyUI_HUD_LogMonitor") return;

        const container = css(document.createElement("div"), {
            width: "100%", height: "100%", display: "flex", flexDirection: "column",
            background: "rgba(8, 10, 15, 0.95)", borderRadius: "16px",
            border: "1px solid rgba(255, 255, 255, 0.1)", boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
            padding: "0", boxSizing: "border-box", overflow: "hidden", position: "relative",
            minHeight: "0",
            animation: "hudFloatingIdle 5s ease-in-out infinite"
        });

        // Signature Rainbow Band
        const signature = css(document.createElement("div"), {
            width: "100%", height: "2px", flexShrink: "0",
            background: "linear-gradient(270deg, #ff5f7a, #ffb86b, #ffe56a, #5fffb2, #63d8ff, #7a8cff, #c46bff, #ff5f7a)",
            backgroundSize: "400% 100%", animation: "hudRainbowFlow 4s linear infinite",
            opacity: "0.8"
        });
        container.appendChild(signature);

        const header = css(document.createElement("div"), {
            padding: "10px 14px", background: "linear-gradient(90deg, rgba(255,255,255,0.05), transparent)",
            borderBottom: "1px solid rgba(255,255,255,0.08)", display: "flex", justifyContent: "space-between",
            alignItems: "center", flexShrink: "0"
        });

        const headerTitle = css(document.createElement("div"), {
            fontSize: "10px", fontWeight: "900", color: "#00ffcc", letterSpacing: "2px", textTransform: "uppercase",
            textShadow: "0 0 8px rgba(0, 255, 204, 0.5)"
        });
        headerTitle.textContent = "HACKER TERMINAL V1.0";

        const headerActions = css(document.createElement("div"), {
            display: "flex", alignItems: "center", gap: "10px"
        });

        const makeBtn = (text, onClick) => {
            const btn = css(document.createElement("button"), {
                background: "transparent", border: "1px solid rgba(0, 255, 204, 0.3)",
                borderRadius: "4px", color: "#00ffcc", fontSize: "10px", padding: "2px 6px",
                cursor: "pointer", transition: "all 0.2s", fontWeight: "bold",
                outline: "none"
            });
            btn.textContent = text;
            btn.onmouseenter = () => {
                btn.style.background = "rgba(0, 255, 204, 0.15)";
                btn.style.borderColor = "#00ffcc";
                btn.style.boxShadow = "0 0 12px rgba(0, 255, 204, 0.4)";
                btn.style.transform = "scale(1.05)";
            };
            btn.onmouseleave = () => {
                btn.style.background = "transparent";
                btn.style.borderColor = "rgba(0, 255, 204, 0.3)";
                btn.style.boxShadow = "none";
                btn.style.transform = "scale(1)";
            };
            btn.onclick = (e) => {
                e.stopPropagation();
                onClick(btn);
            };
            return btn;
        };

        const copyBtn = makeBtn("COPY ALL", (btn) => {
            const allLogs = Array.from(logArea.querySelectorAll("div"))
                .map(el => el.innerText).join("\n");
            navigator.clipboard.writeText(allLogs).then(() => {
                const oldText = btn.textContent;
                btn.textContent = "COPIED!";
                btn.style.background = "rgba(0, 255, 204, 0.3)";
                setTimeout(() => {
                    btn.textContent = oldText;
                    btn.style.background = "transparent";
                }, 1500);
            });
        });

        const statusDot = css(document.createElement("div"), {
            width: "8px", height: "8px", borderRadius: "50%", background: "#00ffcc", 
            boxShadow: "0 0 12px #00ffcc", animation: "hudGlowPulse 1.5s infinite"
        });

        headerActions.append(copyBtn, statusDot);
        header.append(headerTitle, headerActions);

        const instructionBar = css(document.createElement("div"), {
            width: "100%", padding: "0px 0", flexShrink: "0",
            background: "linear-gradient(90deg, transparent, rgba(0, 255, 204, 0.15), transparent)",
            borderBottom: "0px dashed rgba(0, 255, 204, 0.2)",
            textAlign: "center", fontSize: "11px", fontWeight: "800",
            color: "#00ffcc", letterSpacing: "4px",
            textShadow: "0 0 5px rgba(0, 255, 204, 0.4)",
            cursor: "default", display: "flex", justifyContent: "center", alignItems: "center", gap: "10px",
            maxHeight: "0px", opacity: "0", overflow: "hidden",
            transition: "all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)"
        });
        instructionBar.innerHTML = `
            <span style="display:inline-block; animation: hudArrowPulseLeft 1s ease-in-out infinite;">»»</span> 
            <span>DRAG TO PAN</span> 
            <span style="display:inline-block; animation: hudArrowPulseRight 1s ease-in-out infinite;">««</span>
        `;

        // Font size widget callback
        const fontSizeWidget = node.widgets.find(w => w.name === "font_size");
        if (fontSizeWidget) {
            fontSizeWidget.callback = (val) => {
                logArea.querySelectorAll("div").forEach(l => l.style.fontSize = val + "px");
                if (cursorLine) cursorLine.style.fontSize = val + "px";
            };
        }

        // === Progress Bar ===
        const progressWrap = css(document.createElement("div"), {
            width: "100%", padding: "0 14px", boxSizing: "border-box", flexShrink: "0",
            display: "none"
        });
        const progressLabel = css(document.createElement("div"), {
            fontSize: "9px", fontWeight: "800", color: "rgba(255,255,255,0.5)",
            letterSpacing: "1px", marginBottom: "4px", marginTop: "6px"
        });
        const progressTrack = css(document.createElement("div"), {
            width: "100%", height: "6px", borderRadius: "3px",
            background: "rgba(255,255,255,0.08)", marginBottom: "6px", position: "relative"
        });
        const progressFill = css(document.createElement("div"), {
            height: "100%", width: "0%", borderRadius: "3px",
            background: "linear-gradient(90deg, rgba(0,255,204,0.2), #00ffcc)",
            transition: "width 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)", boxShadow: "0 0 8px rgba(0,255,204,0.4)",
            position: "relative"
        });
        const progressHead = css(document.createElement("div"), {
            position: "absolute", top: "-1px", right: "-2px", width: "4px", height: "8px",
            background: "#ffffff", borderRadius: "1px",
            animation: "hudProgressHeadPulse 0.1s infinite alternate",
            zIndex: "2"
        });
        progressFill.appendChild(progressHead);
        progressTrack.appendChild(progressFill);
        progressWrap.append(progressLabel, progressTrack);

        const onProgress = (p) => {
            const wasVisible = progressWrap.style.display !== "none";
            if (p.max > 0) {
                progressWrap.style.display = "block";
                const pct = Math.round((p.value / p.max) * 100);
                progressFill.style.width = pct + "%";
                progressLabel.textContent = `STEP ${p.value} / ${p.max}  (${pct}%)`;
                
                if (!wasVisible) {
                    requestAnimationFrame(() => {
                        const prev = logArea.style.scrollBehavior;
                        logArea.style.scrollBehavior = "auto";
                        logArea.scrollTop = logArea.scrollHeight;
                        logArea.style.scrollBehavior = prev;
                    });
                }
            } else {
                progressWrap.style.display = "none";
                progressFill.style.width = "0%";
                if (wasVisible) {
                    requestAnimationFrame(() => {
                        const prev = logArea.style.scrollBehavior;
                        logArea.style.scrollBehavior = "auto";
                        logArea.scrollTop = logArea.scrollHeight;
                        logArea.style.scrollBehavior = prev;
                    });
                }
            }
        };
        PROGRESS_SUBSCRIBERS.add(onProgress);

        const logArea = css(document.createElement("div"), {
            flex: "1 1 0", minHeight: "0", overflowY: "auto", padding: "12px", 
            display: "flex", flexDirection: "column", gap: "7px",
            fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace",
            scrollBehavior: "smooth",
            position: "relative",
            background: "radial-gradient(circle at center, rgba(0, 255, 204, 0.03) 0%, transparent 70%)",
            userSelect: "none",
            webkitUserSelect: "none",
            cursor: "grab"
        });

        // Dedicated cursor line at the bottom
        const cursorLine = css(document.createElement("div"), {
            lineHeight: "1.4", paddingLeft: "8px", color: "#00ffcc", fontWeight: "900", marginTop: "4px"
        });
        cursorLine.innerHTML = `<span style="color:rgba(255,255,255,0.4); margin-right:8px;">></span><span style="animation: hudBlinkCursor 0.8s infinite;">&#9608;</span>`;
        logArea.appendChild(cursorLine);

        // Prevent ComfyUI canvas zoom when scrolling logs
        logArea.addEventListener("wheel", (e) => {
            e.stopPropagation();
            e.stopImmediatePropagation();
            // ComfyUI may aggressively capture wheel events, so we manually scroll and prevent default.
            logArea.scrollTop += e.deltaY;
            e.preventDefault();
        }, { capture: true, passive: false });

        const checkScrollable = () => {
            requestAnimationFrame(() => {
                if (!logArea) return;
                const isScrollable = logArea.scrollHeight > logArea.clientHeight;
                const wasExpanded = instructionBar.style.maxHeight !== "0px" && instructionBar.style.maxHeight !== "";
                
                if (isScrollable) {
                    css(instructionBar, { maxHeight: "30px", opacity: "1", padding: "6px 0", borderBottomWidth: "1px" });
                } else {
                    css(instructionBar, { maxHeight: "0px", opacity: "0", padding: "0px 0", borderBottomWidth: "0px" });
                }

                // If the bar state changed, the container size changed. Re-scroll to bottom.
                if (isScrollable !== wasExpanded) {
                    setTimeout(() => {
                        logArea.scrollTop = logArea.scrollHeight;
                    }, 400); // Wait for transition to finish
                }
            });
        };

        // Drag to Pan Scrolling
        let isDragging = false;
        let startY, scrollTop;

        logArea.addEventListener("mousedown", (e) => {
            e.stopPropagation();
            isDragging = true;
            logArea.style.cursor = "grabbing";
            logArea.style.scrollBehavior = "auto";
            startY = e.pageY - logArea.offsetTop;
            scrollTop = logArea.scrollTop;
        });

        const stopDragging = () => {
            if (!isDragging) return;
            isDragging = false;
            logArea.style.cursor = "grab";
            logArea.style.scrollBehavior = "smooth";
        };

        logArea.addEventListener("mouseleave", stopDragging);
        logArea.addEventListener("mouseup", stopDragging);

        logArea.addEventListener("mousemove", (e) => {
            if (!isDragging) return;
            e.preventDefault();
            e.stopPropagation();
            const y = e.pageY - logArea.offsetTop;
            const walk = (y - startY) * 1.5;
            logArea.scrollTop = scrollTop - walk;
        });

        // Scanline overlay
        const scanline = css(document.createElement("div"), {
            position: "absolute", top: "0", left: "0", width: "100%", height: "20px",
            background: "linear-gradient(180deg, transparent, rgba(0, 255, 204, 0.05), transparent)",
            pointerEvents: "none", zIndex: "10", animation: "hudScanline 6s linear infinite"
        });
        container.appendChild(scanline);

        // Terminal Flicker effect
        container.style.animation = "hudTerminalFlicker 0.15s infinite";

        // Remove custom thin scrollbar style to make it easier to grab
        logArea.style.scrollbarColor = "rgba(0, 255, 204, 0.4) rgba(0,0,0,0.2)";
        logArea.style.scrollbarWidth = "auto";

        container.append(header, instructionBar, progressWrap, logArea);
        const logViewer = node.addDOMWidget("log_viewer", "preview", container);
        logViewer.computeSize = () => [node.size[0], node.size[1] - ((node.widgets?.length || 0) * 30) - 20];

        const updateContainerSize = () => {
            const w = node.size[0];
            const h = node.size[1];
            // Subtracting space for the standard widgets (max_lines, font_size, clear_on_run)
            // Typically ~30px per widget line
            const widgetHeight = (node.widgets?.length || 0) * 30;
            container.style.width = (w - 30) + "px";
            container.style.height = (h - widgetHeight - 40) + "px";
            checkScrollable();
        };

        const onResize = node.onResize;
        node.onResize = function(size) {
            onResize?.apply(this, arguments);
            updateContainerSize();
        };
        const releaseLogSizeConstraint = constrainNodeSize(node, {
            ...LOG_MONITOR_SIZE,
            widget: logViewer,
            fitWidgetToNode: true,
            getWidgetOffset: () => ((node.widgets?.length || 0) * 30) + 20,
        });

        const addLogToUI = (entry) => {
            const maxLines = node.widgets.find(w => w.name === "max_lines")?.value || 50;
            const fontSize = node.widgets.find(w => w.name === "font_size")?.value || 11;
            const isHUDLog = entry.source === "hud";
            const isError = entry.level === "error";

            const line = css(document.createElement("div"), {
                fontSize: fontSize + "px", lineHeight: "1.5", borderLeft: "2px solid transparent",
                paddingLeft: "8px", transition: "all 0.2s", borderRadius: "2px",
                whiteSpace: "pre-wrap", wordBreak: "break-all",
                position: "relative",
                fontStyle: isHUDLog ? "italic" : "normal",
                fontWeight: isHUDLog ? "600" : "400"
            });

            const timeSpan = `<span style="color:rgba(255,255,255,0.25); margin-right:8px;">${entry.time}</span>`;
            let nodeColor, msgColor;
            if (isError) {
                nodeColor = "#ff4d6d";
                msgColor = "#ff8fa3";
            } else if (isHUDLog) {
                nodeColor = "#c46bff";
                msgColor = "rgba(220,200,255,0.95)";
            } else if (entry.node === "Workflow") {
                nodeColor = "#63d8ff";
                msgColor = "rgba(255,255,255,0.6)";
            } else {
                nodeColor = "#ffb86b";
                msgColor = "rgba(255,255,255,0.85)";
            }
            const nodeSpan = `<span style="color:${nodeColor}; font-weight:800; margin-right:8px;">[${entry.node}]</span>`;
            const msgSpan = `<span style="color:${msgColor};">${entry.message}</span>`;

            line.innerHTML = timeSpan + nodeSpan + msgSpan;
            
            if (isError) {
                line.style.background = "rgba(255, 77, 109, 0.15)";
                line.style.borderLeftColor = "#ff4d6d";
                line.style.animation = "hudErrorShake 0.3s ease-in-out 3, hudLogGlitch 0.2s ease-out";
                line.style.boxShadow = "inset 0 0 10px rgba(255, 77, 109, 0.1)";
            } else if (isHUDLog) {
                line.style.borderLeftColor = "#c46bff";
                line.style.background = "rgba(196, 107, 255, 0.06)";
                line.style.animation = "hudLogGlitch 0.2s ease-out";
            } else {
                line.style.animation = "hudLogGlitch 0.2s ease-out";
            }
            
            line.onmouseenter = () => { 
                line.style.background = isError ? "rgba(255, 77, 109, 0.25)" : "rgba(0, 255, 204, 0.05)"; 
                line.style.borderLeftColor = nodeColor; 
                line.style.filter = "brightness(1.2)";
            };
            line.onmouseleave = () => { 
                line.style.background = isError ? "rgba(255, 77, 109, 0.15)" : "transparent"; 
                line.style.borderLeftColor = isError ? "#ff4d6d" : "transparent"; 
                line.style.filter = "none";
            };

            logArea.insertBefore(line, cursorLine);

            while (logArea.childElementCount > maxLines + 1) { // +1 for cursorLine
                logArea.removeChild(logArea.firstChild);
            }

            // Sync cursor font size with log font size
            cursorLine.style.fontSize = fontSize + "px";

            // Auto-scroll (temporarily disable smooth scroll to guarantee reaching the absolute bottom)
            requestAnimationFrame(() => {
                const prevBehavior = logArea.style.scrollBehavior;
                logArea.style.scrollBehavior = "auto";
                logArea.scrollTop = logArea.scrollHeight;
                logArea.style.scrollBehavior = prevBehavior;
                checkScrollable();
            });
        };

        // Initialize with existing logs
        const initialMax = node.widgets.find(w => w.name === "max_lines")?.value || 50;
        GLOBAL_LOGS.slice(-initialMax).forEach(addLogToUI);

        // Subscribe to new logs
        const logCallback = (entry) => addLogToUI(entry);
        LOG_SUBSCRIBERS.add(logCallback);

        node.onRemoved = () => {
            LOG_SUBSCRIBERS.delete(logCallback);
            PROGRESS_SUBSCRIBERS.delete(onProgress);
            releaseLogSizeConstraint();
        };

        // Handle clear on run
        const origOnExecutionStart = node.onExecutionStart;
        node.onExecutionStart = function() {
            origOnExecutionStart?.apply(this, arguments);
            const clear = node.widgets.find(w => w.name === "clear_on_run")?.value;
            if (clear) {
                while (logArea.firstChild && logArea.firstChild !== cursorLine) {
                    logArea.removeChild(logArea.firstChild);
                }
                checkScrollable();
            }
        };

        setTimeout(() => {
            applyComfyUI_HUD_NodeStyle(node, { rootBorder: "1px solid rgba(255, 255, 255, 0.2)" });
            updateContainerSize();
            requestAnimationFrame(() => {
                const prevBehavior = logArea.style.scrollBehavior;
                logArea.style.scrollBehavior = "auto";
                logArea.scrollTop = logArea.scrollHeight;
                logArea.style.scrollBehavior = prevBehavior;
                logArea.style.pointerEvents = "auto"; // Ensure logs are interactable
                checkScrollable();
            });
        }, 150);
    }
});

// Silence the unhandled message warning for GPU stats by adding a global handler
api.addEventListener("comfyui_hud_gpu_stats", (e) => {
    // This message is consumed by the GPU Monitor node instance if it exists.
    // Here we just provide a top-level listener to prevent ComfyUI from logging an error.
});
