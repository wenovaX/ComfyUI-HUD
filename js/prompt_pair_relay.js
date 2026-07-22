import { app } from "/scripts/app.js";
import { css, applyComfyUI_HUD_NodeStyle, watchNodeColor, log } from "./shared_styles.js";

app.registerExtension({
    name: "ComfyUI_HUD.PromptPairRelay",

    async nodeCreated(node) {
        if (node.comfyClass !== "ComfyUI_HUD_PromptPairRelay") return;

        const styleOptions = {
            rootGradient: "linear-gradient(135deg, rgba(255,128,110,0.10), rgba(255,202,110,0.08), rgba(120,180,255,0.06), rgba(220,120,255,0.07))",
            rootBorder: "1px solid rgba(255,225,185,0.14)",
            rootBoxShadow: "0 0 0 1px rgba(255,255,255,0.03), 0 12px 30px rgba(0,0,0,0.18)",
            headerGradient: "linear-gradient(90deg, rgba(255,140,110,0.14), rgba(255,205,120,0.12), rgba(150,170,255,0.10), rgba(220,120,255,0.10))"
        };

        const cleanupColorWatch = watchNodeColor(node, () => {
            applyComfyUI_HUD_NodeStyle(node, styleOptions);
        });

        // Add HUD's Signature Rainbow Line as DOM widget
        const signatureContainer = css(document.createElement("div"), {
            width: "100%", padding: "4px 10px", boxSizing: "border-box", marginTop: "4px"
        });
        const signature = css(document.createElement("div"), {
            width: "100%", height: "2px", borderRadius: "999px",
            background: "linear-gradient(270deg, #ff5f7a, #ffb86b, #ffe56a, #5fffb2, #63d8ff, #7a8cff, #c46bff, #ff5f7a)",
            backgroundSize: "400% 100%", animation: "hudRainbowFlow 4s linear infinite",
            opacity: "0.8", boxShadow: "0 0 8px rgba(255,255,255,0.1)"
        });
        signatureContainer.appendChild(signature);
        const signatureWidget = node.addDOMWidget("hud_signature", "signature", signatureContainer);
        signatureWidget.serializeValue = () => undefined;
        signatureWidget.computeSize = () => [node.size[0], 10];

        log("Initialized", "Prompt Pair Relay");

        const origRemoved = node.onRemoved;
        node.onRemoved = function () {
            cleanupColorWatch();
            if (origRemoved) origRemoved.call(this);
        };
    }
});
