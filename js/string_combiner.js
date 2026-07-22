import { app } from "/scripts/app.js";
import { css, applyComfyUI_HUD_NodeStyle, watchNodeColor } from "./shared_styles.js";
const _STRING_COMBINER_TARGETS = [
    "ComfyUI_HUD_StringCombiner",
];

app.registerExtension({
    name: "ComfyUI_HUD.StringCombiner",

    async nodeCreated(node) {
        if (!_STRING_COMBINER_TARGETS.includes(node.comfyClass)) return;

        const STORAGE_KEY = "comfyui_hud_sections";
        const SEPARATOR_KEY = "comfyui_hud_separator";
        const SEPARATOR_PIN_KEY = "comfyui_hud_separator_pinned";
        const SHOW_RESULT_KEY = "comfyui_hud_show_result";
        const INCLUDE_TITLES_KEY = "comfyui_hud_include_titles";

        const DEFAULT_SEPARATOR = ",\\n";
        const DEFAULT_SECTION = () => ({
            title: "New Block", value: "", pinned: false, height: "88px",
        });

        const refreshCanvas = () => {
            node.setDirtyCanvas?.(true, true);
            app.graph?.setDirtyCanvas?.(true, true);
        };

        const styleOptions = {
            rootGradient: "linear-gradient(135deg, rgba(80,160,255,0.10), rgba(120,120,255,0.08), rgba(180,120,255,0.08), rgba(90,255,220,0.06))",
            rootBorder: "1px solid rgba(190,220,255,0.14)",
            rootBoxShadow: "0 0 0 1px rgba(255,255,255,0.03), 0 10px 28px rgba(0,0,0,0.18)",
            headerGradient: "linear-gradient(90deg, rgba(110,180,255,0.12), rgba(130,120,255,0.10), rgba(205,120,255,0.10), rgba(90,255,220,0.08))"
        };



        const origDrawFg = node.onDrawForeground;
        node.onDrawForeground = function (ctx) {
            if (origDrawFg) origDrawFg.call(this, ctx);
            const w = this.size?.[0] || 260;
            const h = this.size?.[1] || 180;
            ctx.save();
            ctx.globalCompositeOperation = "screen";
            const gradient = ctx.createLinearGradient(0, 0, w, 0);
            gradient.addColorStop(0.00, "rgba(90, 170, 255, 0.12)");
            gradient.addColorStop(0.22, "rgba(100, 220, 255, 0.10)");
            gradient.addColorStop(0.48, "rgba(120, 150, 255, 0.10)");
            gradient.addColorStop(0.74, "rgba(180, 120, 255, 0.11)");
            gradient.addColorStop(1.00, "rgba(110, 255, 220, 0.08)");
            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, w, h);
            const topWash = ctx.createLinearGradient(0, 0, 0, h * 0.34);
            topWash.addColorStop(0.00, "rgba(255,255,255,0.08)");
            topWash.addColorStop(0.55, "rgba(255,255,255,0.02)");
            topWash.addColorStop(1.00, "rgba(255,255,255,0.00)");
            ctx.fillStyle = topWash;
            ctx.fillRect(0, 0, w, h * 0.34);
            ctx.restore();
        };

        function decodeSeparator(value) {
            return String(value || DEFAULT_SEPARATOR).replace(/\\n/g, "\n").replace(/\\r/g, "\r").replace(/\\t/g, "\t");
        }

        function resolveLinkedText(nodeId, visited = new Set(), forceIncludeTitles = false) {
            const key = String(nodeId ?? "");
            if (!key || visited.has(key)) return "";
            visited.add(key);
            const upstreamNode = app.graph?.getNodeById?.(Number(nodeId));
            if (!upstreamNode) return "";

            const incoming = resolveLinkedInputText(upstreamNode, visited, forceIncludeTitles);

            if (upstreamNode.comfyClass === "ComfyUI_HUD_StringEncodeCombiner") {
                const props = upstreamNode.properties || {};
                const rawSections = Array.isArray(props?.comfyui_hud_encode_sections) ? props.comfyui_hud_encode_sections : [];
                const sep = decodeSeparator(props?.comfyui_hud_encode_separator);
                const includeT = forceIncludeTitles || !!props?.comfyui_hud_encode_include_titles;
                const text = rawSections.map(s => {
                    const v = String(s?.value ?? "");
                    if (!v.trim()) return "";
                    const title = String(s?.title ?? "").trim();
                    return includeT && title ? `[${title}]\n${v}` : v;
                }).filter(Boolean).join(sep);
                return [incoming, text].filter(Boolean).join(incoming && text ? sep : "");
            } else if (upstreamNode.comfyClass === "ComfyUI_HUD_StringCombiner") {
                const props = upstreamNode.properties || {};
                const rawSections = Array.isArray(props?.comfyui_hud_sections) ? props.comfyui_hud_sections : [];
                const sep = decodeSeparator(props?.comfyui_hud_separator);
                const includeT = forceIncludeTitles || !!props?.comfyui_hud_include_titles;
                const text = rawSections.map(s => {
                    const v = String(s?.value ?? "");
                    if (!v.trim()) return "";
                    const title = String(s?.title ?? "").trim();
                    return includeT && title ? `[${title}]\n${v}` : v;
                }).filter(Boolean).join(sep);
                return [incoming, text].filter(Boolean).join(incoming && text ? sep : "");
            }

            return upstreamNode.widgets?.find(w => w.name === "text")?.value ?? "";
        }

        function resolveLinkedInputText(targetNode = node, visited = new Set(), forceIncludeTitles = false) {
            const input = targetNode.inputs?.find((item) => item?.name === "text_in" && item.link != null);
            if (!input?.link) return "";
            const link = app.graph?.links?.[input.link];
            if (!link) return "";
            return resolveLinkedText(link.origin_id, visited, forceIncludeTitles);
        }

        function composeDisplayText() {
            const values = [];
            const incoming = resolveLinkedInputText(node, new Set(), includeTitles);
            if (incoming) values.push(incoming);
            sections.forEach((s) => { 
                if (s.value) {
                    if (includeTitles && s.title) values.push(`[${s.title}]\n${s.value}`);
                    else values.push(s.value);
                }
            });
            return values.join(decodeSeparator(separatorValue));
        }

        function loadSections() {
            try {
                const parsed = node.properties?.[STORAGE_KEY];
                if (!Array.isArray(parsed) || !parsed.length) return [DEFAULT_SECTION()];
                return parsed.map((s) => ({
                    title: String(s?.title ?? ""), value: String(s?.value ?? ""),
                    pinned: !!(s?.pinned || s?.pinnedTitle || s?.pinnedValue),
                    height: String(s?.height ?? "88px"),
                }));
            } catch (_) { return [DEFAULT_SECTION()]; }
        }

        let sections = loadSections();
        let separatorValue = String(node.properties?.[SEPARATOR_KEY] ?? DEFAULT_SEPARATOR);
        let separatorPinned = !!node.properties?.[SEPARATOR_PIN_KEY];
        let showResult = !!node.properties?.[SHOW_RESULT_KEY];
        let includeTitles = !!node.properties?.[INCLUDE_TITLES_KEY];

        function saveSections() {
            node.properties = node.properties || {};
            node.properties[STORAGE_KEY] = sections.map((s) => ({
                title: String(s?.title ?? ""), value: String(s?.value ?? ""),
                pinned: !!s?.pinned, height: String(s?.height ?? "88px"),
            }));
            node.properties[SEPARATOR_KEY] = String(separatorValue ?? DEFAULT_SEPARATOR);
            node.properties[SEPARATOR_PIN_KEY] = !!separatorPinned;
            node.properties[SHOW_RESULT_KEY] = !!showResult;
            node.properties[INCLUDE_TITLES_KEY] = !!includeTitles;
            
            // Trigger hidden update to force downstream eval if needed
            const trigger = node.widgets?.find(w => w.name === "update_trigger");
            if (trigger) trigger.value = crypto.randomUUID();
            refreshCanvas();
        }

        if (!document.getElementById("comfyui-hud-string-separated-style")) {
            const style = document.createElement("style");
            style.id = "comfyui-hud-string-separated-style";
            style.textContent = `
            .comfyui-hud-string-separated-node .comfyui-hud-string-card input,
            .comfyui-hud-string-separated-node .comfyui-hud-string-card textarea {
                outline: none; border: 1px solid rgba(255,255,255,0.14);
                background: linear-gradient(180deg, rgba(18,20,26,0.92), rgba(26,30,38,0.78));
                color: rgba(255,255,255,0.94); box-shadow: inset 0 1px 0 rgba(255,255,255,0.06);
            }
            .comfyui-hud-string-separated-node .comfyui-hud-string-card input:focus,
            .comfyui-hud-string-separated-node .comfyui-hud-string-card textarea:focus {
                border-color: rgba(255,255,255,0.42); box-shadow: 0 0 0 1px rgba(255,255,255,0.18);
            }`;
            document.head.appendChild(style);
        }

        const container = css(document.createElement("div"), {
            width: "100%", display: "flex", flexDirection: "column", gap: "10px", marginTop: "6px", boxSizing: "border-box",
        });
        container.classList.add("comfyui-hud-string-separated-node");

        const header = css(document.createElement("div"), {
            display: "flex", flexDirection: "column", gap: "4px", padding: "10px 12px 12px 12px", borderRadius: "14px",
            border: "1px solid rgba(180,220,255,0.14)", background: "linear-gradient(135deg, rgba(120,180,255,0.10), rgba(170,120,255,0.07), rgba(255,255,255,0.04))",
            boxShadow: "0 10px 26px rgba(0,0,0,0.14), inset 0 1px 0 rgba(255,255,255,0.05)",
            backdropFilter: "blur(8px)", webkitBackdropFilter: "blur(8px)",
        });

        const signature = css(document.createElement("div"), {
            width: "100%", height: "2px", borderRadius: "999px",
            background: "linear-gradient(270deg, #ff5f7a, #ffb86b, #ffe56a, #5fffb2, #63d8ff, #7a8cff, #c46bff, #ff5f7a)",
            backgroundSize: "400% 100%", animation: "hudRainbowFlow 4s linear infinite",
            marginBottom: "4px", boxShadow: "0 0 12px rgba(120, 200, 255, 0.16)",
        });

        const headerHint = css(document.createElement("div"), { fontSize: "11px", fontWeight: "700", lineHeight: "1.4", color: "rgba(255,255,255,0.86)" });
        headerHint.textContent = "Combine text blocks and merge them with the separator in one card.";

        // --- Restored UI Functions ---
        function createToggleBtn(label, active, onClick) {
            const btn = css(document.createElement("button"), {
                padding: "6px 10px", borderRadius: "8px", border: active ? "1px solid rgba(190,220,255,0.5)" : "1px solid rgba(255,255,255,0.15)",
                background: active ? "rgba(190,220,255,0.15)" : "rgba(255,255,255,0.05)",
                color: active ? "#baddff" : "rgba(255,255,255,0.6)", fontSize: "11px", fontWeight: "700", cursor: "pointer",
            });
            btn.textContent = label;
            btn.onclick = onClick;
            return btn;
        }

        function createActionBtn(label, type, active, onClick) {
            let baseBg, border, textCol, hoverBg;
            if (type === "pin") {
                baseBg = active ? "rgba(255,100,100,0.8)" : "rgba(0,0,0,0.5)";
                border = active ? "1px solid #ffaaaa" : "1px solid rgba(255,255,255,0.4)";
                textCol = active ? "#fff" : "#fff";
                hoverBg = active ? "rgba(255,120,120,0.9)" : "rgba(255,255,255,0.2)";
            } else if (type === "copy") {
                baseBg = "rgba(0,0,0,0.5)"; border = "1px solid rgba(150,200,255,0.5)"; textCol = "#aaddff";
                hoverBg = "rgba(150,200,255,0.3)";
            } else if (type === "delete") {
                baseBg = "rgba(0,0,0,0.5)"; border = "1px solid rgba(255,100,100,0.5)"; textCol = "#ffaaaa";
                hoverBg = "rgba(255,100,100,0.3)";
            }

            const btn = css(document.createElement("button"), {
                padding: "5px 10px", cursor: "pointer", 
                background: baseBg, border: border, borderRadius: "6px", 
                color: textCol, fontSize: "11px", fontWeight: "800",
                fontFamily: "monospace", transition: "all 0.15s ease",
                textShadow: "0px 1px 2px rgba(0,0,0,0.8)"
            });
            btn.textContent = label;
            btn.onmouseover = () => btn.style.background = hoverBg;
            btn.onmouseout = () => btn.style.background = baseBg;
            btn.onclick = onClick;
            return btn;
        }

        const toggleRow = css(document.createElement("div"), { display: "flex", gap: "8px", marginTop: "4px", flexWrap: "wrap" });
        const showResultBtn = createToggleBtn("👁️ Show Result", showResult, () => {
            showResult = !showResult;
            saveSections();
            renderSections();
        });
        const includeTitlesBtn = createToggleBtn("🏷️ Include Titles", includeTitles, () => {
            includeTitles = !includeTitles;
            saveSections();
            renderSections();
        });

        const separatorRow = css(document.createElement("div"), { display: "flex", alignItems: "center", gap: "8px", marginTop: "4px", flexWrap: "wrap" });
        const sepLabel = css(document.createElement("div"), { fontSize: "11px", fontWeight: "700", color: "rgba(255,255,255,0.8)" });
        sepLabel.textContent = "Separator:";
        const separatorInput = css(document.createElement("input"), {
            flex: 1, padding: "6px 8px", borderRadius: "8px", minWidth: "60px",
            border: "1px solid rgba(255,255,255,0.14)", background: "rgba(0,0,0,0.3)",
            color: "#fff", fontSize: "11px", fontFamily: "monospace"
        });
        separatorInput.value = separatorValue;
        separatorInput.oninput = () => { 
            separatorValue = separatorInput.value; 
            saveSections(); 
            if (showResult) resultText.textContent = composeDisplayText() || "No text content.";
        };
        const sepPinBtn = createActionBtn("#", "pin", separatorPinned, () => {
            separatorPinned = !separatorPinned;
            saveSections();
            renderSections();
        });

        const resultWrap = css(document.createElement("div"), {
            width: "100%", display: showResult ? "flex" : "none", flexDirection: "column", gap: "6px",
            marginTop: "2px", padding: "10px 11px", borderRadius: "13px", border: "1px solid rgba(190,220,255,0.14)",
            background: "linear-gradient(180deg, rgba(18,24,38,0.82), rgba(26,30,44,0.72))",
        });
        const resultText = css(document.createElement("div"), {
            width: "100%", minHeight: "52px", padding: "11px 12px", borderRadius: "11px", border: "1px solid rgba(190,220,255,0.12)",
            color: "rgba(240,248,255,0.95)", fontSize: "11px", lineHeight: "1.6", fontFamily: "monospace", whiteSpace: "pre-wrap",
        });
        const resultActionRow = css(document.createElement("div"), {
            width: "100%", display: "flex", justifyContent: "flex-end", alignItems: "center",
        });
        const resultCopyBtn = createActionBtn("Copy Result", "copy", false, () => {
            const text = composeDisplayText();
            if (!text) return;

            navigator.clipboard.writeText(text).then(() => {
                resultCopyBtn.textContent = "Copied!";
                setTimeout(() => resultCopyBtn.textContent = "Copy Result", 900);
            });
        });
        resultActionRow.appendChild(resultCopyBtn);
        resultWrap.appendChild(resultActionRow);
        resultWrap.appendChild(resultText);

        const cardList = css(document.createElement("div"), { width: "100%", display: "flex", flexDirection: "column", gap: "10px" });
        const addBtn = css(document.createElement("button"), {
            width: "100%", padding: "10px 12px", borderRadius: "12px", border: "1px dashed rgba(255,255,255,0.18)",
            background: "rgba(255,255,255,0.06)", color: "#fff", fontSize: "12px", fontWeight: "800", cursor: "pointer",
        });
        addBtn.textContent = "+ Add prompt block";

        function renderSections() {
            // Update Toggles & Separator State
            showResultBtn.style.background = showResult ? "rgba(190,220,255,0.15)" : "rgba(255,255,255,0.05)";
            showResultBtn.style.border = showResult ? "1px solid rgba(190,220,255,0.5)" : "1px solid rgba(255,255,255,0.15)";
            showResultBtn.style.color = showResult ? "#baddff" : "rgba(255,255,255,0.6)";

            includeTitlesBtn.style.background = includeTitles ? "rgba(190,220,255,0.15)" : "rgba(255,255,255,0.05)";
            includeTitlesBtn.style.border = includeTitles ? "1px solid rgba(190,220,255,0.5)" : "1px solid rgba(255,255,255,0.15)";
            includeTitlesBtn.style.color = includeTitles ? "#baddff" : "rgba(255,255,255,0.6)";

            sepPinBtn.style.background = separatorPinned ? "rgba(255,100,100,0.8)" : "rgba(0,0,0,0.5)";
            sepPinBtn.style.border = separatorPinned ? "1px solid #ffaaaa" : "1px solid rgba(255,255,255,0.4)";
            sepPinBtn.style.color = separatorPinned ? "#fff" : "#fff";
            
            separatorInput.value = separatorValue;
            
            if (separatorPinned) {
                separatorInput.readOnly = true;
                separatorInput.style.background = "transparent";
                separatorInput.style.border = "1px solid transparent";
                separatorInput.style.color = "rgba(255,255,255,0.95)";
                separatorInput.style.outline = "none";
            } else {
                separatorInput.readOnly = false;
                separatorInput.style.background = "rgba(0,0,0,0.3)";
                separatorInput.style.border = "1px solid rgba(255,255,255,0.14)";
                separatorInput.style.color = "#fff";
            }

            cardList.replaceChildren();
            sections.forEach((s, idx) => {
                const card = css(document.createElement("div"), {
                    display: "flex", flexDirection: "column", gap: "8px", padding: "12px", borderRadius: "14px",
                    border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.05)",
                });
                card.classList.add("comfyui-hud-string-card");
                const controlsRow = css(document.createElement("div"), { display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: "6px" });
                const titleInput = css(document.createElement("input"), { flex: 1, minWidth: "100px", padding: "9px 10px", borderRadius: "10px", fontSize: "12px", fontWeight: "700" });
                titleInput.value = s.title;
                titleInput.oninput = () => { 
                    s.title = titleInput.value; 
                    saveSections(); 
                    if (showResult) resultText.textContent = composeDisplayText() || "No text content.";
                };

                const btnGroup = css(document.createElement("div"), { display: "flex", gap: "4px" });
                const pinBtn = createActionBtn("#", "pin", s.pinned, () => { s.pinned = !s.pinned; saveSections(); renderSections(); });
                
                const copyBtn = createActionBtn("Copy", "copy", false, () => { 
                    const textToCopy = includeTitles && s.title ? `[${s.title}]\n${s.value}` : s.value;
                    navigator.clipboard.writeText(textToCopy).then(() => {
                        const origBg = copyBtn.style.background;
                        copyBtn.style.background = "rgba(100,255,100,0.4)";
                        copyBtn.style.color = "#fff";
                        copyBtn.textContent = "Copied!";
                        setTimeout(() => {
                            copyBtn.style.background = origBg;
                            copyBtn.style.color = "#aaddff";
                            copyBtn.textContent = "Copy";
                        }, 800);
                    });
                });
                
                const delBtn = createActionBtn("Delete", "delete", false, () => { sections.splice(idx, 1); saveSections(); renderSections(); });
                
                btnGroup.appendChild(pinBtn);
                btnGroup.appendChild(copyBtn);
                btnGroup.appendChild(delBtn);
                controlsRow.appendChild(titleInput);
                controlsRow.appendChild(btnGroup);

                const valueInput = css(document.createElement("textarea"), { width: "100%", height: s.height, minHeight: "36px", padding: "10px 12px", borderRadius: "12px", fontSize: "12px", boxSizing: "border-box" });
                valueInput.value = s.value;
                valueInput.oninput = () => { 
                    s.value = valueInput.value; 
                    saveSections(); 
                    if (showResult) resultText.textContent = composeDisplayText() || "No text content.";
                };

                if (s.pinned) {
                    titleInput.readOnly = true;
                    titleInput.style.background = "transparent";
                    titleInput.style.border = "1px solid transparent";
                    titleInput.style.color = "rgba(255,255,255,0.95)";
                    
                    valueInput.readOnly = true;
                    valueInput.style.background = "transparent";
                    valueInput.style.border = "1px solid transparent";
                    valueInput.style.color = "rgba(255,255,255,0.95)";
                }

                card.appendChild(controlsRow);
                card.appendChild(valueInput);
                cardList.appendChild(card);
            });

            resultWrap.style.display = showResult ? "flex" : "none";
            if (showResult) resultText.textContent = composeDisplayText() || "No text content.";

            applyRootStyle();
        }

        addBtn.onclick = () => { sections.push(DEFAULT_SECTION()); saveSections(); renderSections(); };
        
        toggleRow.appendChild(showResultBtn);
        toggleRow.appendChild(includeTitlesBtn);
        separatorRow.appendChild(sepLabel);
        separatorRow.appendChild(separatorInput);
        separatorRow.appendChild(sepPinBtn);
        
        header.appendChild(signature);
        header.appendChild(headerHint);
        header.appendChild(toggleRow);
        header.appendChild(separatorRow);
        header.appendChild(resultWrap);
        container.appendChild(header);
        container.appendChild(cardList);
        container.appendChild(addBtn);
        node.addDOMWidget("comfyui_hud_string_separated", "preview", container);
        
        const applyRootStyle = () => applyComfyUI_HUD_NodeStyle(container, styleOptions);
        const cleanupColorWatch = watchNodeColor(node, applyRootStyle);

        // Hide update_trigger widget
        function hideUpdateTrigger() {
            const trigger = node.widgets?.find(w => w.name === "update_trigger");
            if (trigger) {
                trigger.type = "converted-widget";
                trigger.computeSize = () => [0, -4];
                trigger.hidden = true;
            }
        }
        setTimeout(hideUpdateTrigger, 10);

        const origOnConnectionsChange = node.onConnectionsChange;
        node.onConnectionsChange = function() {
            if (origOnConnectionsChange) origOnConnectionsChange.apply(this, arguments);
            renderSections();
        };

        const origConfigure = node.onConfigure;
        node.onConfigure = function () {
            if (origConfigure) origConfigure.apply(this, arguments);
            hideUpdateTrigger();
            sections = loadSections();
            separatorValue = String(node.properties?.[SEPARATOR_KEY] ?? DEFAULT_SEPARATOR);
            separatorPinned = !!node.properties?.[SEPARATOR_PIN_KEY];
            showResult = !!node.properties?.[SHOW_RESULT_KEY];
            includeTitles = !!node.properties?.[INCLUDE_TITLES_KEY];
            renderSections();
        };
        const origSerialize = node.onSerialize;
        node.onSerialize = function (o) {
            saveSections();
            if (origSerialize) origSerialize.call(this, o);
        };
        renderSections();
        saveSections();     saveSections();
    },
});
