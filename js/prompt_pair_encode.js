import { app } from "/scripts/app.js";
import { css, applyComfyUI_HUD_NodeStyle, watchNodeColor, log } from "./shared_styles.js";
import { safeRegisterExtension } from "./safe_register.js";

safeRegisterExtension({
    name: "ComfyUI_HUD.PromptPairEncode",

    async nodeCreated(node) {
        const CLASS_MAPPINGS = ["ComfyUI_HUD_PromptPairEncode"];
        if (!CLASS_MAPPINGS.includes(node.comfyClass)) return;

        const POSITIVE_KEY = "comfyui_hud_prompt_pair_positive";
        const NEGATIVE_KEY = "comfyui_hud_prompt_pair_negative";
        const POSITIVE_HEIGHT_KEY = "comfyui_hud_prompt_pair_positive_height";
        const NEGATIVE_HEIGHT_KEY = "comfyui_hud_prompt_pair_negative_height";

        const refreshCanvas = () => {
            node.setDirtyCanvas?.(true, true);
            app.graph?.setDirtyCanvas?.(true, true);
        };

        const styleOptions = {
            rootGradient: "linear-gradient(135deg, rgba(255,128,110,0.10), rgba(255,202,110,0.08), rgba(120,180,255,0.06), rgba(220,120,255,0.07))",
            rootBorder: "1px solid rgba(255,225,185,0.14)",
            rootBoxShadow: "0 0 0 1px rgba(255,255,255,0.03), 0 12px 30px rgba(0,0,0,0.18)",
            headerGradient: "linear-gradient(90deg, rgba(255,140,110,0.14), rgba(255,205,120,0.12), rgba(150,170,255,0.10), rgba(220,120,255,0.10))"
        };

        const applyRootStyle = () => applyComfyUI_HUD_NodeStyle(container, styleOptions);
        const cleanupColorWatch = watchNodeColor(node, applyRootStyle);

        const origDrawFg = node.onDrawForeground;
        node.onDrawForeground = function (ctx) {
            if (origDrawFg) origDrawFg.call(this, ctx);
            const w = this.size?.[0] || 260;
            const h = this.size?.[1] || 180;
            ctx.save();
            ctx.globalCompositeOperation = "screen";
            const gradient = ctx.createLinearGradient(0, 0, w, 0);
            gradient.addColorStop(0.00, "rgba(255,110,100,0.13)");
            gradient.addColorStop(0.26, "rgba(255,200,100,0.10)");
            gradient.addColorStop(0.54, "rgba(110,190,255,0.08)");
            gradient.addColorStop(0.80, "rgba(190,120,255,0.10)");
            gradient.addColorStop(1.00, "rgba(255,120,180,0.08)");
            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, w, h);
            const topWash = ctx.createLinearGradient(0, 0, 0, h * 0.34);
            topWash.addColorStop(0.00, "rgba(255,255,255,0.09)");
            topWash.addColorStop(0.55, "rgba(255,255,255,0.03)");
            topWash.addColorStop(1.00, "rgba(255,255,255,0.00)");
            ctx.fillStyle = topWash;
            ctx.fillRect(0, 0, w, h * 0.34);
            ctx.restore();
        };

        if (!document.getElementById("comfyui-hud-prompt-pair-style")) {
            const style = document.createElement("style");
            style.id = "comfyui-hud-prompt-pair-style";
            style.textContent = `
            .comfyui-hud-prompt-pair-node textarea {
                outline: none;
                color: rgba(255,248,242,0.95);
                box-shadow: inset 0 1px 0 rgba(255,255,255,0.05);
            }
            .comfyui-hud-prompt-pair-node textarea:focus {
                border-color: rgba(255,230,190,0.34) !important;
                box-shadow: 0 0 0 1px rgba(255,230,190,0.14);
            }
            @keyframes comfyui_hud_RainbowFlow {
                0% { background-position: 0% 50%; }
                50% { background-position: 100% 50%; }
                100% { background-position: 0% 50%; }
            }`;
            document.head.appendChild(style);
        }

        let positiveText = String(node.properties?.[POSITIVE_KEY] ?? "");
        let negativeText = String(node.properties?.[NEGATIVE_KEY] ?? "");
        let positiveHeight = String(node.properties?.[POSITIVE_HEIGHT_KEY] ?? "120px");
        let negativeHeight = String(node.properties?.[NEGATIVE_HEIGHT_KEY] ?? "120px");
        let copyResetTimer = null;
        let positiveSection = null;
        let negativeSection = null;
        const getWidget = (name) => node.widgets?.find((widget) => widget.name === name);
        const postJson = (url, data) => fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data),
        });

        const syncWidget = (name, value) => {
            const widget = getWidget(name);
            if (!widget) return;

            if (widget.value !== value) {
                widget.value = value;
                widget.callback?.(value, app.canvas, node);
            }

            const widgetIndex = node.widgets?.indexOf(widget) ?? -1;
            if (widgetIndex >= 0) {
                if (!Array.isArray(node.widgets_values)) node.widgets_values = [];
                node.widgets_values[widgetIndex] = value;
            }
        };

        const hideStateWidgets = () => {
            for (const name of ["positive_text", "negative_text", "update_trigger"]) {
                const widget = getWidget(name);
                if (!widget) continue;
                widget.type = "converted-widget";
                widget.computeSize = () => [0, -4];
                widget.hidden = true;
                widget.serialize = true;
            }

            const positiveWidget = getWidget("positive_text");
            if (positiveWidget) positiveWidget.serializeValue = () => positiveText;

            const negativeWidget = getWidget("negative_text");
            if (negativeWidget) negativeWidget.serializeValue = () => negativeText;

            const triggerWidget = getWidget("update_trigger");
            if (triggerWidget) triggerWidget.serializeValue = () => triggerWidget.value || "";
        };

        const readWidgetState = () => {
            const positiveWidget = getWidget("positive_text");
            const negativeWidget = getWidget("negative_text");
            if (!positiveText && positiveWidget?.value) positiveText = String(positiveWidget.value || "");
            if (!negativeText && negativeWidget?.value) negativeText = String(negativeWidget.value || "");
        };

        const readTextAreas = () => {
            if (positiveSection?.textArea) positiveText = positiveSection.textArea.value;
            if (negativeSection?.textArea) negativeText = negativeSection.textArea.value;
        };

        const syncStateToServer = () => {
            postJson("/hud/prompt-pair-encode/state", {
                node_id: String(node.id),
                positive_text: positiveText,
                negative_text: negativeText,
            }).catch((err) => {
                console.error("HUD Prompt Pair Encode: Failed to sync state", err);
            });
        };

        const persist = () => {
            readTextAreas();
            node.properties = node.properties || {};
            node.properties[POSITIVE_KEY] = positiveText;
            node.properties[NEGATIVE_KEY] = negativeText;
            node.properties[POSITIVE_HEIGHT_KEY] = positiveHeight;
            node.properties[NEGATIVE_HEIGHT_KEY] = negativeHeight;
            syncWidget("positive_text", positiveText);
            syncWidget("negative_text", negativeText);
            syncWidget("update_trigger", crypto.randomUUID());
            refreshCanvas();
            app.graph?.change?.();
            syncStateToServer();
        };

        const container = css(document.createElement("div"), {
            width: "100%", display: "flex", flexDirection: "column", gap: "10px", marginTop: "6px", boxSizing: "border-box",
        });
        container.classList.add("comfyui-hud-prompt-pair-node");

        const header = css(document.createElement("div"), {
            display: "flex", flexDirection: "column", gap: "6px", padding: "10px 12px 12px 12px", borderRadius: "14px",
            border: "1px solid rgba(255,225,185,0.14)", background: "linear-gradient(135deg, rgba(255,185,110,0.10), rgba(255,120,160,0.08), rgba(140,180,255,0.06), rgba(255,255,255,0.04))",
            boxShadow: "0 10px 26px rgba(0,0,0,0.14), inset 0 1px 0 rgba(255,255,255,0.05)",
            backdropFilter: "blur(8px)", webkitBackdropFilter: "blur(8px)",
        });

        const signature = css(document.createElement("div"), {
            width: "100%", height: "2px", borderRadius: "999px",
            background: "linear-gradient(270deg, #ff5f7a, #ffb86b, #ffe56a, #5fffb2, #63d8ff, #7a8cff, #c46bff, #ff5f7a)",
            backgroundSize: "400% 100%", animation: "comfyui_hud_RainbowFlow 4s linear infinite",
            marginBottom: "4px", boxShadow: "0 0 12px rgba(255,190,120,0.18)",
        });

        const hint = css(document.createElement("div"), { fontSize: "11px", fontWeight: "700", lineHeight: "1.4", color: "rgba(255,250,245,0.88)" });
        hint.textContent = "Encode positive and negative prompts together from one paired card.";

        header.appendChild(signature);
        header.appendChild(hint);

        function createCopyButton(getText) {
            const btn = css(document.createElement("button"), {
                height: "24px", padding: "0 10px", borderRadius: "999px", border: "1px solid rgba(255,255,255,0.12)",
                background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.74)", fontSize: "10px", fontWeight: "800", cursor: "pointer",
            });
            btn.type = "button";
            btn.textContent = "Copy";
            btn.onclick = async () => {
                const text = String(getText() || "").trim();
                if (text) {
                    try {
                        await navigator.clipboard.writeText(text);
                        btn.textContent = "Copied";
                        btn.style.color = "#fff3d7";
                        btn.style.background = "linear-gradient(135deg, rgba(255,180,120,0.28), rgba(220,110,255,0.18))";
                    } catch (_) { btn.textContent = "Failed"; }
                }
                if (copyResetTimer) clearTimeout(copyResetTimer);
                copyResetTimer = setTimeout(() => {
                    copyResetTimer = null;
                    btn.textContent = "Copy";
                    btn.style.color = "rgba(255,255,255,0.74)";
                    btn.style.background = "rgba(255,255,255,0.06)";
                }, 1200);
            };
            return btn;
        }

        function createSection(label, accent, bg, value, onChange, onResize) {
            const wrap = css(document.createElement("div"), {
                display: "flex", flexDirection: "column", gap: "8px", padding: "12px", borderRadius: "14px",
                border: `1px solid ${accent.border}`, background: bg, boxShadow: accent.wrapShadow,
            });
            const row = css(document.createElement("div"), { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" });
            const badge = css(document.createElement("div"), {
                minWidth: "78px", height: "24px", padding: "0 10px", borderRadius: "999px", display: "flex",
                alignItems: "center", justifyContent: "center", fontSize: "10px", fontWeight: "800",
                color: accent.text, background: accent.bg, border: `1px solid ${accent.border}`, boxSizing: "border-box",
            });
            badge.textContent = label;
            row.appendChild(badge);

            const textArea = css(document.createElement("textarea"), {
                width: "100%", height: value.height, minHeight: "44px", resize: "vertical", padding: "12px 13px",
                borderRadius: "13px", border: `1px solid ${accent.border}`, background: accent.inputBg,
                boxShadow: accent.inputShadow, fontSize: "12px", lineHeight: "1.55", boxSizing: "border-box",
            });
            textArea.value = value.text;
            textArea.oninput = () => onChange(textArea.value);
            const copyBtn = createCopyButton(() => textArea.value);
            row.appendChild(copyBtn);

            const persistHeight = () => {
                const nextHeight = textArea.style.height || `${textArea.offsetHeight}px`;
                if (nextHeight) onResize(nextHeight);
            };
            textArea.onmouseup = persistHeight;
            if (typeof ResizeObserver !== "undefined") {
                new ResizeObserver(() => persistHeight()).observe(textArea);
            }
            wrap.appendChild(row);
            wrap.appendChild(textArea);
            return { wrap, textArea };
        }

        positiveSection = createSection("Positive", 
            { text: "#fff4dd", bg: "linear-gradient(135deg, rgba(255,196,110,0.24), rgba(255,140,90,0.14))", border: "rgba(255,214,155,0.22)", inputBg: "linear-gradient(180deg, rgba(42,28,20,0.94), rgba(64,42,28,0.86))", inputShadow: "inset 0 1px 0 rgba(255,235,210,0.05)", wrapShadow: "0 12px 28px rgba(68,34,12,0.18)", descText: "rgba(255,234,214,0.72)" },
            "linear-gradient(180deg, rgba(255,214,160,0.11), rgba(255,162,108,0.05))", { text: positiveText, height: positiveHeight }, (t) => { positiveText = t; persist(); }, (h) => { positiveHeight = h; persist(); }
        );

        negativeSection = createSection("Negative", 
            { text: "#ffe7ef", bg: "linear-gradient(135deg, rgba(120,138,170,0.24), rgba(78,94,126,0.18))", border: "rgba(186,205,238,0.18)", inputBg: "linear-gradient(180deg, rgba(18,24,36,0.96), rgba(24,32,48,0.88))", inputShadow: "inset 0 1px 0 rgba(220,235,255,0.04)", wrapShadow: "0 12px 30px rgba(6,12,24,0.22)", descText: "rgba(220,232,248,0.70)" },
            "linear-gradient(180deg, rgba(150,176,214,0.10), rgba(78,96,132,0.05))", { text: negativeText, height: negativeHeight }, (t) => { negativeText = t; persist(); }, (h) => { negativeHeight = h; persist(); }
        );

        container.appendChild(header);
        container.appendChild(positiveSection.wrap);
        container.appendChild(negativeSection.wrap);
        node.addDOMWidget("comfyui_hud_prompt_pair_encode", "preview", container);

        const origConfigure = node.onConfigure;
        node.onConfigure = function () {
            if (origConfigure) origConfigure.apply(this, arguments);
            hideStateWidgets();
            positiveText = String(node.properties?.[POSITIVE_KEY] ?? "");
            negativeText = String(node.properties?.[NEGATIVE_KEY] ?? "");
            readWidgetState();
            positiveHeight = String(node.properties?.[POSITIVE_HEIGHT_KEY] ?? "120px");
            negativeHeight = String(node.properties?.[NEGATIVE_HEIGHT_KEY] ?? "120px");
            positiveSection.textArea.value = positiveText;
            positiveSection.textArea.style.height = positiveHeight;
            negativeSection.textArea.value = negativeText;
            negativeSection.textArea.style.height = negativeHeight;
            applyRootStyle();
        };

        const origSerialize = node.onSerialize;
        node.onSerialize = function (o) {
            persist();
            if (origSerialize) origSerialize.call(this, o);
        };

        hideStateWidgets();
        readWidgetState();
        persist();

        const origRemoved = node.onRemoved;
        node.onRemoved = function () {
            cleanupColorWatch();
            if (copyResetTimer) { clearTimeout(copyResetTimer); copyResetTimer = null; }
            if (origRemoved) origRemoved.apply(this, arguments);
        };
        log("Initialized", "Prompt Pair Encode");
    },
});
