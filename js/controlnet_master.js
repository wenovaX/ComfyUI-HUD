import { app } from "/scripts/app.js";
import { css, applyComfyUI_HUD_NodeStyle, log } from "./shared_styles.js";

app.registerExtension({
    name: "ComfyUI_HUD.OpenPoseControlNet",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name !== "ComfyUI_HUD_OpenPoseControlNet") return;

        const MODEL_VALUE_ID = "hud-controlnet-model";
        const STRENGTH_VALUE_ID = "hud-controlnet-strength";
        const START_VALUE_ID = "hud-controlnet-start";
        const END_VALUE_ID = "hud-controlnet-end";
        const DOM_WIDGET_NAME = "hud_controlnet_hud";

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            onNodeCreated?.apply(this, arguments);
            const node = this;

            node.size = [360, 220];

            // --- Custom HUD Elements ---
            const container = css(document.createElement("div"), {
                padding: "12px", display: "flex", flexDirection: "column", gap: "8px",
                fontFamily: "Inter, system-ui, sans-serif", color: "white",
                background: "rgba(10, 15, 25, 0.95)", borderRadius: "12px",
                border: "1px solid rgba(255, 144, 0, 0.2)",
                boxShadow: "0 10px 30px rgba(0,0,0,0.5), inset 0 0 10px rgba(255, 144, 0, 0.05)",
                width: "100%", height: "100%", boxSizing: "border-box",
                position: "relative", overflow: "hidden"
            });

            // Status Badge
            const header = css(document.createElement("div"), {
                display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px"
            });
            const title = css(document.createElement("div"), { fontSize: "10px", fontWeight: "900", letterSpacing: "1px", color: "rgba(255, 144, 0, 0.8)", textTransform: "uppercase" });
            title.textContent = "ControlNet Master Hub";
            
            const badge = css(document.createElement("div"), {
                fontSize: "9px", padding: "2px 8px", background: "rgba(255, 144, 0, 0.15)", color: "#ff9000", 
                borderRadius: "99px", border: "1px solid rgba(255, 144, 0, 0.3)", fontWeight: "700"
            });
            badge.textContent = "IDLE";
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

            grid.appendChild(createInfoBox("MODEL", MODEL_VALUE_ID, "#ff9000"));
            grid.appendChild(createInfoBox("STRENGTH", STRENGTH_VALUE_ID, "#facc15"));
            grid.appendChild(createInfoBox("START %", START_VALUE_ID, "#fb923c"));
            grid.appendChild(createInfoBox("END %", END_VALUE_ID, "#f87171"));

            // Signature Rainbow Divider
            const divider = css(document.createElement("div"), {
                width: "100%", height: "2px", margin: "8px 0", borderRadius: "2px",
                background: "linear-gradient(90deg, #ff9000, #facc15, #fb923c, #f87171)",
                opacity: "0.5"
            });

            container.appendChild(header);
            container.appendChild(divider);
            container.appendChild(grid);

            const widget = node.addDOMWidget(DOM_WIDGET_NAME, "hud_ui", container);
            widget.computeSize = () => [node.size[0], 140];

            // --- Update Logic ---
            const updateHUD = () => {
                const modelFile = node.widgets?.find(w => w.name === "controlnet_model")?.value || "";
                const strength = node.widgets?.find(w => w.name === "strength")?.value || 0;
                const start = node.widgets?.find(w => w.name === "start_percent")?.value || 0;
                const end = node.widgets?.find(w => w.name === "end_percent")?.value || 0;

                const modelEl = container.querySelector(`#${MODEL_VALUE_ID}`);
                const strengthEl = container.querySelector(`#${STRENGTH_VALUE_ID}`);
                const startEl = container.querySelector(`#${START_VALUE_ID}`);
                const endEl = container.querySelector(`#${END_VALUE_ID}`);

                if (modelEl) modelEl.textContent = modelFile.split(/[/\\]/).pop().toUpperCase();
                if (strengthEl) strengthEl.textContent = strength.toFixed(2);
                if (startEl) startEl.textContent = (start * 100).toFixed(1) + "%";
                if (endEl) endEl.textContent = (end * 100).toFixed(1) + "%";

                badge.textContent = (modelFile && strength > 0) ? "ACTIVE" : "READY";
                badge.style.background = (modelFile && strength > 0) ? "rgba(16, 185, 129, 0.15)" : "rgba(255, 144, 0, 0.15)";
                badge.style.color = (modelFile && strength > 0) ? "#10b981" : "#ff9000";
                badge.style.border = (modelFile && strength > 0) ? "1px solid rgba(16, 185, 129, 0.3)" : "1px solid rgba(255, 144, 0, 0.3)";

                applyComfyUI_HUD_NodeStyle(node, {
                    rootGradient: "linear-gradient(135deg, #0a101f, #050a14)",
                    rootBorder: "1px solid rgba(255, 144, 0, 0.3)",
                    headerGradient: "linear-gradient(90deg, #2a1b0a, #0f172a)"
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

            log("Initialized", "ControlNet Master Hub");
        };
    }
});
