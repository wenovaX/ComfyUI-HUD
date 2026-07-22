import { app } from "/scripts/app.js";
import { css, applyComfyUI_HUD_NodeStyle, watchNodeColor, log } from "./shared_styles.js";

app.registerExtension({
    name: "ComfyUI_HUD.IPAdapterFaceIDLoader",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name !== "ComfyUI_HUD_IPAdapterFaceIDLoader") return;

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            onNodeCreated?.apply(this, arguments);
            const node = this;

            node.size = [360, 300]; // Optimized for full spec display

            // --- Custom HUD Elements ---
            const container = css(document.createElement("div"), {
                padding: "12px", display: "flex", flexDirection: "column", gap: "8px",
                fontFamily: "Inter, system-ui, sans-serif", color: "white",
                background: "rgba(10, 15, 25, 0.95)", borderRadius: "12px",
                border: "1px solid rgba(0, 255, 255, 0.2)",
                boxShadow: "0 10px 30px rgba(0,0,0,0.5), inset 0 0 10px rgba(0,255,255,0.05)",
                width: "100%", height: "100%", boxSizing: "border-box",
                position: "relative", overflow: "hidden"
            });

            // Status Badge
            const header = css(document.createElement("div"), {
                display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px"
            });
            const title = css(document.createElement("div"), { fontSize: "10px", fontWeight: "900", letterSpacing: "1px", color: "rgba(0, 255, 255, 0.8)", textTransform: "uppercase" });
            title.textContent = "FaceID Master Pipeline";
            
            const badge = css(document.createElement("div"), {
                fontSize: "9px", padding: "2px 8px", background: "rgba(0, 255, 255, 0.15)", color: "#00ffff", 
                borderRadius: "99px", border: "1px solid rgba(0, 255, 255, 0.3)", fontWeight: "700"
            });
            badge.textContent = "READY";
            header.appendChild(title);
            header.appendChild(badge);

            // Data Grid
            const grid = css(document.createElement("div"), {
                display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginTop: "4px"
            });

            const createInfoBox = (label, valueId, color) => {
                const box = css(document.createElement("div"), {
                    background: "rgba(255,255,255,0.03)", padding: "8px", borderRadius: "8px",
                    borderLeft: `3px solid ${color}`, display: "flex", flexDirection: "column", gap: "2px"
                });
                const l = css(document.createElement("div"), { fontSize: "9px", color: "rgba(255,255,255,0.4)", fontWeight: "600" });
                l.textContent = label;
                const v = css(document.createElement("div"), { fontSize: "11px", color: "#fff", fontWeight: "800", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" });
                v.id = valueId;
                v.textContent = "---";
                box.appendChild(l);
                box.appendChild(v);
                return box;
            };

            grid.appendChild(createInfoBox("ARCH", "custom-utility-ipa-arch", "#3b82f6"));
            grid.appendChild(createInfoBox("TYPE", "custom-utility-ipa-type", "#8b5cf6"));
            grid.appendChild(createInfoBox("LORA", "custom-utility-ipa-lora", "#ec4899"));
            grid.appendChild(createInfoBox("CLIP", "custom-utility-ipa-clip", "#f59e0b"));
            grid.appendChild(createInfoBox("INSIGHT (OUT)", "custom-utility-ipa-insight", "#10b981"));
            grid.appendChild(createInfoBox("ACCEL (IS)", "custom-utility-ipa-accel", "#ef4444"));

            // Signature Rainbow Divider
            const divider = css(document.createElement("div"), {
                width: "100%", height: "2px", margin: "8px 0", borderRadius: "2px",
                background: "linear-gradient(90deg, #3b82f6, #8b5cf6, #ec4899, #10b981)",
                opacity: "0.5"
            });

            container.appendChild(header);
            container.appendChild(divider);
            container.appendChild(grid);

            const widget = node.addDOMWidget("custom_utility_ipa_hud", "hud_ui", container);
            widget.computeSize = () => [node.size[0], 200];

            // --- Update Logic ---
            const updateHUD = () => {
                const presetFile = node.widgets?.find(w => w.name === "preset")?.value || "";
                const clipFile = node.widgets?.find(w => w.name === "clip_vision_file")?.value || "";
                const isModel = node.widgets?.find(w => w.name === "insightface_model")?.value || "";
                const isProvider = node.widgets?.find(w => w.name === "insightface_provider")?.value || "";
                const strength = node.widgets?.find(w => w.name === "lora_strength")?.value || 0;

                const fileLower = presetFile.toLowerCase();
                const archEl = container.querySelector("#custom-utility-ipa-arch");
                const typeEl = container.querySelector("#custom-utility-ipa-type");
                const loraEl = container.querySelector("#custom-utility-ipa-lora");
                const clipEl = container.querySelector("#custom-utility-ipa-clip");
                const insightEl = container.querySelector("#custom-utility-ipa-insight");
                const accelEl = container.querySelector("#custom-utility-ipa-accel");

                if (archEl) archEl.textContent = fileLower.includes("sdxl") ? "SDXL" : "SD1.5";
                
                if (typeEl) {
                    if (fileLower.includes("plusv2")) typeEl.textContent = "FACEID PLUS V2";
                    else if (fileLower.includes("plus")) typeEl.textContent = "FACEID PLUS";
                    else if (fileLower.includes("portrait")) typeEl.textContent = "PORTRAIT";
                    else if (fileLower.includes("faceid")) typeEl.textContent = "FACEID";
                    else typeEl.textContent = "GENERAL";
                }

                if (loraEl) {
                    const hasLora = fileLower.includes("faceid");
                    loraEl.textContent = hasLora ? `ON (${strength})` : "OFF";
                    loraEl.style.color = hasLora ? "#ec4899" : "rgba(255,255,255,0.4)";
                }

                if (clipEl) {
                    clipEl.textContent = clipFile === "Auto" ? "AUTO-DETECT" : clipFile.split(/[/\\]/).pop();
                    clipEl.style.color = clipFile === "Auto" ? "#f59e0b" : "#fff";
                }

                if (insightEl) insightEl.textContent = isModel.toUpperCase();
                if (accelEl) accelEl.textContent = isProvider;

                badge.textContent = (presetFile && clipFile) ? "ACTIVE" : "READY";
                badge.style.background = (presetFile && clipFile) ? "rgba(16, 185, 129, 0.15)" : "rgba(0, 255, 255, 0.15)";
                badge.style.color = (presetFile && clipFile) ? "#10b981" : "#00ffff";

                applyComfyUI_HUD_NodeStyle(node, {
                    rootGradient: "linear-gradient(135deg, #0a0f19, #050a14)",
                    rootBorder: "1px solid rgba(0, 255, 255, 0.3)",
                    headerGradient: "linear-gradient(90deg, #1e293b, #0f172a)"
                });
            };

            node.onWidgetChanged = function() { updateHUD(); };

            setTimeout(() => {
                node.widgets?.forEach(w => {
                    const oldCb = w.callback;
                    w.callback = function() {
                        const r = oldCb?.apply(this, arguments);
                        updateHUD();
                        return r;
                    };
                });
                updateHUD();
            }, 100);

            log("Initialized", "FaceID Master Loader");
        };
    }
});
