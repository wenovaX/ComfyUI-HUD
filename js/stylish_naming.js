import { app } from "/scripts/app.js";
import { api } from "/scripts/api.js";
import { css, applyComfyUI_HUD_NodeStyle, watchNodeColor } from "./shared_styles.js";
import { constrainNodeSize, setDomWidgetSize } from "./node_size_utils.js";
import { safeRegisterExtension } from "./safe_register.js";

const STYLISH_NAMING_ROUTE_BASE = "/hud/stylish-naming";
const STYLISH_NAMING_SIZE = {
    defaultWidth: 285,
    defaultHeight: 200,
};
const STYLISH_NAMING_WIDGET_SIZE = {
    minWidth: 285,
    height: 200,
};
const STYLISH_NAMING_RESULT_FONT_SIZE = 60;
const STYLISH_NAMING_RESULT_MIN_FONT_SIZE = 12;
const STYLISH_NAMING_RESULT_MAX_FONT_SIZE = 160;
const STYLISH_NAMING_PATH_SUFFIX_SCALE = 0.6;
const STYLISH_NAMING_PATH_GAP_EM = 0.17;
const STYLISH_NAMING_PROPERTY_KEY = "comfyui_hud_stylish_naming";

safeRegisterExtension({
    name: "ComfyUI_HUD.StylishNaming",

    async nodeCreated(node) {
        if (node.comfyClass !== "ComfyUI_HUD_StylishNaming") return;

        const openAssetHub = async (path = "output") => {
            try {
                const mod = await import("./asset_hub_browser.js");
                const fb = mod?.fileBrowser;
                if (!fb) return;
                fb.show();
                fb.loadPath(path || "output");
            } catch (err) {
                console.error("HUD Stylish Naming: Asset Hub load failed:", err);
            }
        };

        let namingState = {
            mode: "Text",
            category: "HUD",
            text: "MyProject",
            path: "",
            filename_prefix: "result",
            output_format: "Full",
        };
        let presets = [];
        let nextNumber = 1;
        const stateWidgetNames = ["mode", "category", "text", "path", "filename_prefix", "output_format"];
        const getStateWidget = (name) => node.widgets?.find((widget) => widget.name === name);

        const postJson = (url, data) => fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data),
        });

        const getOutputString = () => {
            if (namingState.mode === "Path") {
                const basePath = String(namingState.path || "").trim().replace(/\\/g, "/").replace(/[\\/]+$/g, "");
                const filePrefix = String(namingState.filename_prefix || "").trim().replace(/\\/g, "/").replace(/^[\\/]+/g, "");
                if (filePrefix) return basePath ? `${basePath}/${filePrefix}` : filePrefix;
                return basePath;
            }

            const category = String(namingState.category || "");
            const text = String(namingState.text || "");
            if (namingState.output_format === "Text Only") return text;
            if (namingState.output_format === "Category Only") return category;
            return category ? `[${category}] ${text}` : text;
        };

        const syncResultToServer = () => {
            postJson(`${STYLISH_NAMING_ROUTE_BASE}/result`, {
                node_id: String(node.id),
                result: getOutputString(),
            }).catch((err) => {
                console.error("HUD Stylish Naming: Failed to sync result", err);
            });
        };

        const hideStateWidgets = () => {
            for (const name of stateWidgetNames) {
                const widget = getStateWidget(name);
                if (!widget) continue;
                widget.type = "converted-widget";
                widget.computeSize = () => [0, -4];
                widget.hidden = true;
                widget.serialize = true;
                widget.serializeValue = () => namingState[name];
            }
        };

        const readStateFromWidgets = () => {
            const propertyState = node.properties?.[STYLISH_NAMING_PROPERTY_KEY];
            if (propertyState && typeof propertyState === "object") {
                namingState = { ...namingState, ...propertyState };
                return;
            }

            for (const name of stateWidgetNames) {
                const widget = getStateWidget(name);
                if (widget && widget.value != null) {
                    namingState[name] = widget.value;
                }
            }
        };

        const syncStateWidgets = () => {
            node.properties = node.properties || {};
            node.properties[STYLISH_NAMING_PROPERTY_KEY] = { ...namingState };

            for (const name of stateWidgetNames) {
                const widget = getStateWidget(name);
                if (!widget) continue;

                const nextValue = namingState[name];
                if (widget.value !== nextValue) {
                    widget.value = nextValue;
                    widget.callback?.(nextValue, app.canvas, node);
                }

                const widgetIndex = node.widgets?.indexOf(widget) ?? -1;
                if (widgetIndex >= 0) {
                    if (!Array.isArray(node.widgets_values)) node.widgets_values = [];
                    node.widgets_values[widgetIndex] = nextValue;
                }
            }
            node.setDirtyCanvas?.(true, true);
            app.graph?.setDirtyCanvas?.(true, true);
            app.graph?.change?.();
            syncResultToServer();
        };

        hideStateWidgets();
        readStateFromWidgets();

        const fetchNextNumber = async () => {
            if (namingState.mode !== "Path") return;
            try {
                const response = await postJson("/hud/next-number", { path: namingState.path, prefix: namingState.filename_prefix });
                const data = await response.json();
                if (data && typeof data.next_number === "number") {
                    nextNumber = data.next_number;
                    updateUI();
                }
            } catch (_) {}
        };

        const loadFromServer = async () => {
            try {
                const presetsResponse = await fetch(`${STYLISH_NAMING_ROUTE_BASE}/presets`);
                presets = await presetsResponse.json();
            } catch (err) {
                console.error("HUD Stylish Naming: Failed to load presets", err);
            }

            syncStateWidgets();
            updateUI();
            refreshPresetList();
            fetchNextNumber();
            setTimeout(() => {
                container.style.opacity = "1";
            }, 50);
        };

        const styleId = "hud-stylish-naming-styles";
        if (!document.getElementById(styleId)) {
            const style = document.createElement("style");
            style.id = styleId;
            style.textContent = `
                @keyframes hudCloudFloat { 0% { transform: translateY(0px); } 50% { transform: translateY(-10px); } 100% { transform: translateY(0px); } }
                @keyframes hudMorph { 0% { transform: scale(1); opacity: 0.3; } 50% { transform: scale(1.6); opacity: 0.7; } 100% { transform: scale(1); opacity: 0.3; } }
                .hud-btn:hover { background: rgba(255,255,255,0.2) !important; filter: brightness(1.2); }
                .hud-select { appearance: auto !important; background: #fff !important; color: #000 !important; border: 1px solid #ccc !important; cursor: pointer; font-weight: 800; }
                .hud-select option { background: #fff !important; color: #000 !important; padding: 8px !important; }
            `;
            document.head.appendChild(style);
        }

        const container = css(document.createElement("div"), {
            width: "100%",
            display: "flex",
            flexDirection: "column",
            background: "transparent",
            opacity: "0",
            transition: "opacity 0.3s ease-in-out",
        });
        container.classList.add("stylish_naming_ui");
        container.appendChild(css(document.createElement("div"), {
            width: "100%",
            height: "2px",
            background: "linear-gradient(90deg, #f00, #ff7f00, #ff0, #0f0, #00f, #4b0082, #8f00ff)",
            backgroundSize: "200% 100%",
            animation: "hudRainbowFlow 3s linear infinite",
        }));

        const tabs = css(document.createElement("div"), {
            width: "100%",
            display: "flex",
            height: "44px",
            background: "rgba(0,0,0,0.4)",
        });
        const createTab = (name) => {
            const tab = css(document.createElement("div"), {
                flex: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "12px",
                fontWeight: "900",
                cursor: "pointer",
                transition: "all 0.3s",
                letterSpacing: "2px",
                textTransform: "uppercase",
            });
            tab.textContent = name;
            tab.onclick = () => {
                namingState.mode = name;
                syncStateWidgets();
                updateUI();
                refreshPresetList();
                fetchNextNumber();
            };
            return tab;
        };
        const textTab = createTab("Text");
        const pathTab = createTab("Path");
        tabs.append(textTab, pathTab);
        container.appendChild(tabs);

        const previewArea = css(document.createElement("div"), {
            width: "100%",
            height: "180px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            position: "relative",
            overflow: "hidden",
            background: "rgba(0,0,0,0.15)",
            padding: "20px",
        });
        const morphDot = css(document.createElement("div"), {
            width: "20px",
            height: "20px",
            borderRadius: "50%",
            background: "#00ffcc",
            boxShadow: "0 0 30px #00ffcc",
            position: "absolute",
            animation: "hudMorph 2s ease-in-out infinite",
        });

        const previewStack = css(document.createElement("div"), {
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "2px",
            animation: "hudCloudFloat 5s ease-in-out infinite",
            transition: "0.5s",
            width: "100%",
            height: "100%",
            minHeight: "0",
        });
        const subDisplay = css(document.createElement("div"), {
            fontSize: "14px",
            fontWeight: "700",
            color: "rgba(255,255,255,0.7)",
            textTransform: "uppercase",
            width: "100%",
            textAlign: "center",
            letterSpacing: "1px",
            whiteSpace: "nowrap",
        });

        const mainDisplay = css(document.createElement("div"), {
            width: "90%",
            flex: "1 1 auto",
            minHeight: "0",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            overflow: "visible",
            margin: "0 auto",
        });
        const mainContent = css(document.createElement("div"), {
            width: "100%",
            maxWidth: "100%",
            height: "100%",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            minWidth: "0",
            fontWeight: "900",
            color: "#fff",
            textAlign: "center",
            textShadow: "0 0 30px rgba(255,255,255,0.5)",
            letterSpacing: "-2px",
            lineHeight: "1",
            whiteSpace: "nowrap",
        });
        const resultContent = css(document.createElement("div"), {
            display: "inline-block",
            maxWidth: "none",
            fontSize: `${STYLISH_NAMING_RESULT_FONT_SIZE}px`,
            fontWeight: "900",
            color: "#fff",
            lineHeight: "1",
            letterSpacing: "-2px",
            textShadow: "0 0 30px rgba(255,255,255,0.5)",
            textAlign: "center",
            whiteSpace: "nowrap",
            transition: "font-size 0.2s ease-out",
        });

        const measureCanvas = document.createElement("canvas");
        const measureContext = measureCanvas.getContext("2d");
        const measureTextWidth = (text, size, style = "normal") => {
            if (!measureContext) return String(text || "").length * size * 0.6;
            measureContext.font = `${style} 900 ${size}px Arial, sans-serif`;
            return measureContext.measureText(String(text || "")).width;
        };

        let lastResultFitOptions = null;

        const getBaseResultWidth = ({ isPathMode, textValue, suffixValue }) => {
            if (!isPathMode) {
                return measureTextWidth(textValue, STYLISH_NAMING_RESULT_FONT_SIZE);
            }

            return (
                measureTextWidth(textValue, STYLISH_NAMING_RESULT_FONT_SIZE) +
                (STYLISH_NAMING_RESULT_FONT_SIZE * STYLISH_NAMING_PATH_GAP_EM) +
                measureTextWidth(
                    suffixValue,
                    STYLISH_NAMING_RESULT_FONT_SIZE * STYLISH_NAMING_PATH_SUFFIX_SCALE,
                    "italic"
                )
            );
        };

        const fitResultContent = (options = lastResultFitOptions) => {
            if (!options) return;
            const maxWidth = (previewArea.clientWidth || previewArea.offsetWidth || mainDisplay.clientWidth) * 0.9;
            const availablePreviewHeight = (
                previewArea.clientHeight ||
                previewArea.offsetHeight ||
                mainDisplay.clientHeight ||
                0
            ) - (subDisplay.offsetHeight || 0) - 12;
            const maxHeight = Math.max(0, availablePreviewHeight);
            if (!maxWidth || !maxHeight) return;

            const baseWidth = getBaseResultWidth(options);
            const widthFitSize = baseWidth > 0
                ? STYLISH_NAMING_RESULT_FONT_SIZE * (maxWidth / baseWidth)
                : STYLISH_NAMING_RESULT_FONT_SIZE;
            const heightFitSize = maxHeight * 0.78;
            const nextFontSize = Math.max(
                STYLISH_NAMING_RESULT_MIN_FONT_SIZE,
                Math.min(
                    STYLISH_NAMING_RESULT_MAX_FONT_SIZE,
                    Math.floor(Math.min(widthFitSize, heightFitSize))
                )
            );

            resultContent.style.fontSize = `${nextFontSize}px`;
        };

        mainContent.appendChild(resultContent);
        mainDisplay.appendChild(mainContent);
        previewStack.append(subDisplay, mainDisplay);
        previewArea.append(morphDot, previewStack);
        container.appendChild(previewArea);

        const inputArea = css(document.createElement("div"), {
            padding: "16px",
            display: "flex",
            flexDirection: "column",
            gap: "10px",
        });
        const createField = (label, placeholder) => {
            const row = css(document.createElement("div"), {
                display: "flex",
                flexDirection: "column",
                gap: "5px",
            });
            const fieldLabel = css(document.createElement("div"), {
                fontSize: "11px",
                fontWeight: "900",
                color: "rgba(255,255,255,0.7)",
                textTransform: "uppercase",
                letterSpacing: "0.5px",
            });
            fieldLabel.textContent = label;
            const input = css(document.createElement("input"), {
                width: "100%",
                background: "rgba(0,0,0,0.4)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: "10px",
                padding: "10px 12px",
                color: "#fff",
                fontSize: "12px",
                outline: "none",
            });
            input.placeholder = placeholder;
            input.oninput = () => {
                const key = label.toLowerCase().includes("tag")
                    ? "category"
                    : label.toLowerCase().includes("description")
                        ? "text"
                        : label.toLowerCase().includes("path")
                            ? "path"
                            : "filename_prefix";
                namingState[key] = input.value;
                syncStateWidgets();
                updateUI();
                if (key === "path" || key === "filename_prefix") {
                    fetchNextNumber();
                }
            };
            row.append(fieldLabel, input);
            return { row, input };
        };

        const categoryField = createField("Tag / Category", "HUD");
        const textField = createField("Description", "MyProject");
        const pathField = createField("Base Path", "output/folder");
        const prefixField = createField("Filename Prefix", "result");
        inputArea.append(categoryField.row, textField.row, pathField.row, prefixField.row);
        container.appendChild(inputArea);

        const bottomArea = css(document.createElement("div"), {
            padding: "0 16px 16px 16px",
            display: "flex",
            flexDirection: "column",
            gap: "18px",
        });
        const presetRow = css(document.createElement("div"), {
            display: "flex",
            gap: "8px",
            width: "100%",
            alignItems: "center",
        });
        const presetSelect = css(document.createElement("select"), {
            flex: "1 1 240px",
            minWidth: "0",
            width: "100%",
            padding: "10px",
            borderRadius: "10px",
            outline: "none",
            fontSize: "12px",
        });
        presetSelect.className = "hud-select";
        presetSelect.onchange = () => {
            const selectedValue = presetSelect.value;
            const preset = presets.find((entry) => entry.name === selectedValue && (!entry.p_mode || entry.p_mode === namingState.mode));
            if (!preset) return;
            const { name, p_mode, default: ignoredDefault, ...presetData } = preset;
            namingState = { ...namingState, ...presetData };
            syncStateWidgets();
            updateUI();
            fetchNextNumber();
        };

        const deletePresetBtn = css(document.createElement("div"), {
            flex: "0 0 auto",
            minWidth: "104px",
            padding: "10px 12px",
            borderRadius: "10px",
            background: "rgba(255, 77, 109, 0.1)",
            border: "1px solid rgba(255, 77, 109, 0.3)",
            color: "#ff4d6d",
            fontSize: "10px",
            fontWeight: "900",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            whiteSpace: "nowrap",
        });
        deletePresetBtn.className = "hud-btn";
        deletePresetBtn.textContent = "DELETE";
        deletePresetBtn.onclick = async () => {
            const selectedValue = presetSelect.value;
            if (!selectedValue || selectedValue.includes("SELECT")) return;
            if (!confirm(`Delete preset '${selectedValue}'?`)) return;
            presets = presets.filter((preset) => !(preset.name === selectedValue && preset.p_mode === namingState.mode));
            await postJson(`${STYLISH_NAMING_ROUTE_BASE}/presets`, presets);
            refreshPresetList();
        };
        presetRow.append(presetSelect, deletePresetBtn);

        const actionRow = css(document.createElement("div"), {
            display: "flex",
            gap: "8px",
            width: "100%",
        });
        const savePresetBtn = css(document.createElement("div"), {
            flex: 1,
            padding: "12px",
            borderRadius: "10px",
            background: "rgba(0, 255, 200, 0.1)",
            border: "1px solid rgba(0, 255, 200, 0.3)",
            color: "#00ffcc",
            fontSize: "11px",
            fontWeight: "900",
            cursor: "pointer",
            textAlign: "center",
        });
        savePresetBtn.className = "hud-btn";
        savePresetBtn.textContent = "SAVE PRESET";
        savePresetBtn.onclick = async () => {
            const presetName = prompt("Preset Name?");
            if (!presetName) return;
            presets.push({ name: presetName, p_mode: namingState.mode, ...namingState });
            await postJson(`${STYLISH_NAMING_ROUTE_BASE}/presets`, presets);
            refreshPresetList();
        };

        const openBrowserBtn = css(document.createElement("div"), {
            flex: 1,
            padding: "12px",
            borderRadius: "10px",
            background: "rgba(0, 160, 255, 0.15)",
            border: "1px solid rgba(0, 160, 255, 0.4)",
            color: "#80d0ff",
            fontSize: "11px",
            fontWeight: "900",
            textAlign: "center",
            cursor: "pointer",
        });
        openBrowserBtn.className = "hud-btn";
        openBrowserBtn.textContent = "FILE BROWSER";
        openBrowserBtn.onclick = () => {
            openAssetHub(namingState.path || "output");
        };
        actionRow.append(savePresetBtn, openBrowserBtn);
        bottomArea.append(presetRow, actionRow);
        container.appendChild(bottomArea);

        const applyPresetRowResponsive = () => {
            const rowWidth = bottomArea.clientWidth || container.clientWidth || 0;
            const compact = rowWidth > 0 && rowWidth < 360;
            presetRow.style.flexDirection = compact ? "column" : "row";
            presetRow.style.alignItems = compact ? "stretch" : "center";
            presetSelect.style.flex = compact ? "1 1 auto" : "1 1 240px";
            presetSelect.style.width = "100%";
            deletePresetBtn.style.flex = compact ? "1 1 auto" : "0 0 auto";
            deletePresetBtn.style.width = compact ? "100%" : "auto";
            deletePresetBtn.style.minWidth = compact ? "0" : "104px";
        };

        const refreshPresetList = async () => {
            const currentValue = presetSelect.value;
            try {
                const response = await fetch(`${STYLISH_NAMING_ROUTE_BASE}/presets`);
                presets = await response.json();
            } catch (_) {}
            const filteredPresets = presets.filter((preset) => !preset.p_mode || preset.p_mode === namingState.mode);
            presetSelect.innerHTML = `<option disabled selected style="color:#000">SELECT ${namingState.mode.toUpperCase()} PRESET</option>`;
            filteredPresets.forEach((preset) => {
                const option = document.createElement("option");
                option.textContent = preset.default ? `[Default] ${preset.name}` : preset.name;
                option.value = preset.name;
                option.style.color = "#000";
                presetSelect.appendChild(option);
            });
            if (currentValue && filteredPresets.find((preset) => preset.name === currentValue)) {
                presetSelect.value = currentValue;
            }
        };

        const updateUI = () => {
            const isPathMode = namingState.mode === "Path";
            const accentColor = isPathMode ? "#88e4ff" : "#ff9000";

            textTab.style.background = !isPathMode ? "rgba(255, 144, 0, 0.3)" : "rgba(255, 144, 0, 0.05)";
            textTab.style.color = !isPathMode ? "#fff" : "rgba(255, 144, 0, 0.4)";
            textTab.style.boxShadow = !isPathMode ? "inset 0 -3px 0 #ff9000" : "none";
            pathTab.style.background = isPathMode ? "rgba(0, 160, 255, 0.3)" : "rgba(0, 160, 255, 0.05)";
            pathTab.style.color = isPathMode ? "#fff" : "rgba(0, 160, 255, 0.4)";
            pathTab.style.boxShadow = isPathMode ? "inset 0 -3px 0 #00aaff" : "none";

            const primaryValue = isPathMode ? namingState.path : namingState.category;
            const secondaryValue = isPathMode ? namingState.filename_prefix : namingState.text;
            const isEmpty = !primaryValue && !secondaryValue;
            morphDot.style.display = isEmpty ? "block" : "none";
            morphDot.style.background = accentColor;
            morphDot.style.boxShadow = `0 0 30px ${accentColor}`;
            previewStack.style.opacity = isEmpty ? "0" : "1";

            if (isPathMode) {
                subDisplay.textContent = primaryValue || "output root";
                const numberText = nextNumber.toString().padStart(5, "0");
                const suffixText = `_${numberText}.png`;
                resultContent.style.whiteSpace = "nowrap";
                resultContent.style.overflowWrap = "normal";
                resultContent.style.wordBreak = "normal";
                const prefixSpan = css(document.createElement("span"), {
                    display: "inline-block",
                    color: "#fff",
                });
                prefixSpan.textContent = secondaryValue || "";
                const suffixSpan = css(document.createElement("span"), {
                    display: "inline-block",
                    color: `${accentColor}cc`,
                    fontStyle: "italic",
                    fontSize: `${STYLISH_NAMING_PATH_SUFFIX_SCALE}em`,
                    marginLeft: `${STYLISH_NAMING_PATH_GAP_EM}em`,
                });
                suffixSpan.textContent = suffixText;
                resultContent.replaceChildren(prefixSpan, suffixSpan);
                lastResultFitOptions = {
                    isPathMode,
                    textValue: secondaryValue || "",
                    suffixValue: suffixText,
                };
                requestAnimationFrame(() => fitResultContent());
            } else {
                subDisplay.textContent = "";
                const textValue = (primaryValue ? `[${primaryValue}] ` : "") + (secondaryValue || "No Label");
                resultContent.style.whiteSpace = "nowrap";
                resultContent.style.overflowWrap = "normal";
                resultContent.style.wordBreak = "normal";
                resultContent.textContent = textValue;
                lastResultFitOptions = {
                    isPathMode,
                    textValue,
                    suffixValue: "",
                };
                requestAnimationFrame(() => fitResultContent());
            }

            categoryField.row.style.display = isPathMode ? "none" : "flex";
            textField.row.style.display = isPathMode ? "none" : "flex";
            pathField.row.style.display = isPathMode ? "flex" : "none";
            prefixField.row.style.display = isPathMode ? "flex" : "none";

            if (document.activeElement !== categoryField.input) categoryField.input.value = namingState.category || "";
            if (document.activeElement !== textField.input) textField.input.value = namingState.text || "";
            if (document.activeElement !== pathField.input) pathField.input.value = namingState.path || "";
            if (document.activeElement !== prefixField.input) prefixField.input.value = namingState.filename_prefix || "";

            const rootGradient = isPathMode
                ? "linear-gradient(135deg, rgba(10,35,80,0.98), rgba(5,10,20,0.99))"
                : "linear-gradient(135deg, rgba(70,40,10,0.98), rgba(20,10,5,0.99))";
            applyComfyUI_HUD_NodeStyle(node, {
                rootGradient,
                rootBorder: `1px solid ${accentColor}66`,
            });
            applyPresetRowResponsive();
        };

        const widget = node.addDOMWidget("stylish_naming_ui", "stylish_naming_ui", container);
        setDomWidgetSize(widget, STYLISH_NAMING_WIDGET_SIZE);
        const releaseSizeConstraint = constrainNodeSize(node, {
            ...STYLISH_NAMING_SIZE,
        });
        let resizeObserver = null;
        let resizeLayoutQueued = false;
        const queueResizeLayout = () => {
            if (resizeLayoutQueued) return;
            resizeLayoutQueued = true;
            requestAnimationFrame(() => {
                resizeLayoutQueued = false;
                applyPresetRowResponsive();
                fitResultContent();
            });
        };
        if (typeof ResizeObserver !== "undefined") {
            resizeObserver = new ResizeObserver(queueResizeLayout);
            resizeObserver.observe(container);
            resizeObserver.observe(mainDisplay);
        }
        await loadFromServer();

        api.addEventListener("execution_success", () => fetchNextNumber());
        watchNodeColor(node, () => updateUI());
        const originalOnRemoved = node.onRemoved;
        node.onRemoved = function() {
            resizeObserver?.disconnect();
            releaseSizeConstraint();
            originalOnRemoved?.apply(this, arguments);
        };
    },
});
