import { app } from "/scripts/app.js";
import { css, applyComfyUI_HUD_NodeStyle, watchNodeColor } from "./shared_styles.js";

app.registerExtension({
    name: "ComfyUI_HUD.VAEResolver",

    async nodeCreated(node) {
        const TARGET_CLASSES = ["ComfyUI_HUD_VAEResolver"];
        if (!TARGET_CLASSES.includes(node.comfyClass)) return;

        // Signature styling options
        const styleOptions = {
            rootGradient: "linear-gradient(270deg, rgba(255,95,122,0.08), rgba(255,184,107,0.08), rgba(255,229,106,0.08), rgba(95,255,178,0.08), rgba(99,216,255,0.08), rgba(122,140,255,0.08), rgba(196,107,255,0.08), rgba(255,95,122,0.08))",
            rootBorder: "1px solid rgba(255,255,255,0.15)",
            rootBoxShadow: "0 0 20px rgba(0,0,0,0.3), inset 0 0 15px rgba(255,255,255,0.02)",
            headerGradient: "linear-gradient(90deg, rgba(255,95,122,0.12), rgba(196,107,255,0.12))",
            // custom flag to trigger animation if shared_styles supports it, 
            // but we'll apply the animation class directly to the root later if needed.
        };

        const container = css(document.createElement("div"), {
            width: "100%", display: "flex", flexDirection: "column", alignItems: "center",
            marginTop: "6px", marginBottom: "2px", position: "relative", boxSizing: "border-box",
            padding: "0 4px"
        });

        const signature = css(document.createElement("div"), {
            width: "100%", height: "2px", borderRadius: "999px",
            background: "linear-gradient(270deg, #ff5f7a, #ffb86b, #ffe56a, #5fffb2, #63d8ff, #7a8cff, #c46bff, #ff5f7a)",
            backgroundSize: "400% 100%", animation: "hudRainbowFlow 4s linear infinite",
            marginBottom: "10px", boxShadow: "0 0 12px rgba(255, 255, 255, 0.2)"
        });

        const badgeWrap = css(document.createElement("div"), {
            width: "100%", display: "flex", justifyContent: "center", alignItems: "center",
            gap: "8px", flexWrap: "wrap", padding: "4px 0"
        });

        const selectionBadge = css(document.createElement("div"), {
            padding: "6px 12px", borderRadius: "999px", fontSize: "11px", fontWeight: "900",
            letterSpacing: "0.5px", color: "#ffffff", background: "rgba(255,255,255,0.1)",
            border: "1px solid rgba(255,255,255,0.2)", backdropFilter: "blur(10px)",
            webkitBackdropFilter: "blur(10px)", boxShadow: "0 4px 15px rgba(0,0,0,0.3)",
            textTransform: "uppercase", textShadow: "0 2px 4px rgba(0,0,0,0.3)"
        });
        selectionBadge.textContent = "VAE: CHECKPOINT";

        const statusBadge = css(document.createElement("div"), {
            padding: "6px 12px", borderRadius: "999px", fontSize: "11px", fontWeight: "800",
            color: "rgba(255,255,255,0.95)", background: "rgba(0,0,0,0.3)",
            border: "1px solid rgba(255,255,255,0.15)", transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)"
        });
        statusBadge.textContent = "Using internal VAE";

        const helperText = css(document.createElement("div"), {
            marginTop: "12px", fontSize: "11px", color: "rgba(255,255,255,0.55)",
            textAlign: "center", lineHeight: "1.5", fontWeight: "600", maxWidth: "85%",
            letterSpacing: "0.2px"
        });
        helperText.textContent = "Resolving VAE from checkpoint or external file.";

        badgeWrap.appendChild(selectionBadge);
        badgeWrap.appendChild(statusBadge);
        container.appendChild(signature);
        container.appendChild(badgeWrap);
        container.appendChild(helperText);

        node.addDOMWidget("hud_vae_status", "preview", container);

        const applyRootStyle = () => {
            applyComfyUI_HUD_NodeStyle(node, styleOptions);
            
            // Force rainbow animation on the root background if it was found
            const nodeId = String(node.id);
            const root = document.querySelector(`[data-node-id="${nodeId}"] [data-testid="node-inner-wrapper"]`) ||
                         document.querySelector(`[data-node-id="${nodeId}"]`);
            if (root) {
                root.style.backgroundSize = "400% 100%";
                root.style.animation = "hudRainbowFlow 12s linear infinite";
            }
        };
        
        const cleanupColorWatch = watchNodeColor(node, applyRootStyle);
        const findWidget = (name) => node.widgets?.find((w) => w.name === name);

        let lastUsesExternal = null;

        function updateBadges() {
            const vaeWidget = findWidget("vae_name");
            const value = String(vaeWidget?.value || "Use checkpoint VAE");
            const usesExternal = value !== "Use checkpoint VAE";

            if (usesExternal === lastUsesExternal) return;
            lastUsesExternal = usesExternal;

            selectionBadge.textContent = usesExternal ? "VAE: EXTERNAL" : "VAE: CHECKPOINT";

            if (usesExternal) {
                statusBadge.textContent = value;
                statusBadge.style.background = "linear-gradient(135deg, rgba(255, 60, 120, 0.25), rgba(255, 140, 40, 0.2))";
                statusBadge.style.border = "1px solid rgba(255, 180, 100, 0.5)";
                statusBadge.style.color = "#fff";

                selectionBadge.style.background = "linear-gradient(135deg, rgba(255, 0, 120, 0.4), rgba(255, 120, 0, 0.3))";
                selectionBadge.style.border = "1px solid rgba(255, 255, 255, 0.5)";
                selectionBadge.style.animation = "hudPulseGlow 2s ease-in-out infinite";

                helperText.textContent = "Loading external VAE file from models/vae.";
            } else {
                statusBadge.textContent = "Using internal VAE";
                statusBadge.style.background = "rgba(0,0,0,0.3)";
                statusBadge.style.border = "1px solid rgba(255,255,255,0.15)";
                statusBadge.style.color = "rgba(255,255,255,0.95)";

                selectionBadge.style.background = "rgba(255,255,255,0.1)";
                selectionBadge.style.border = "1px solid rgba(255,255,255,0.2)";
                selectionBadge.style.animation = "none";

                helperText.textContent = "Using the VAE embedded within the checkpoint.";
            }
            
            applyRootStyle();
        }

        function patchWidgetCallback(widget, handler) {
            if (!widget || widget._oePatched) return;
            const orig = widget.callback;
            widget.callback = function (...args) {
                if (orig) orig.apply(this, args);
                handler();
            };
            widget._oePatched = true;
        }

        setTimeout(() => {
            updateBadges();
            patchWidgetCallback(findWidget("vae_name"), updateBadges);
            patchWidgetCallback(findWidget("debug_log"), updateBadges);
            applyRootStyle();
        }, 300);

        const interval = setInterval(() => {
            if (node.widgets) {
                patchWidgetCallback(findWidget("vae_name"), updateBadges);
                patchWidgetCallback(findWidget("debug_log"), updateBadges);
            }
        }, 1500);

        const origRemoved = node.onRemoved;
        node.onRemoved = function () {
            clearInterval(interval);
            cleanupColorWatch();
            if (origRemoved) origRemoved.call(this);
        };
    }
});


