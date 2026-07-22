export function createPreviewUI({
    css,
    PREVIEW_SLOT_HEIGHT,
    COLOR_WHITE_SOFT_10,
    SHADOW_BLACK_45,
    FILTER_SEGMENT_ACTIVE_STYLES,
    CHECKPOINT_FILTERS,
    LOADING_PREVIEW_HTML,
    onFilterSegmentClick,
    onFavoriteToggle,
}) {
    const container = document.createElement("div");
    container.classList.add("hud-checkpoint-preview");
    container.style.marginTop = "6px";
    container.style.display = "flex";
    container.style.flexDirection = "column";
    container.style.alignItems = "center";
    container.style.width = "100%";
    container.style.position = "relative";

    const signature = document.createElement("div");
    signature.style.position = "absolute";
    signature.style.top = "0px";
    signature.style.left = "0px";
    signature.style.width = "100%";
    signature.style.height = "2px";
    signature.style.borderTopLeftRadius = "6px";
    signature.style.borderTopRightRadius = "6px";
    signature.style.display = "none";
    signature.style.background = "linear-gradient(270deg, red, orange, yellow, lime, cyan, blue, violet, red)";
    signature.style.backgroundSize = "400% 100%";
    signature.style.animation = "hudRainbowFlow 4s linear infinite";

    const imageWrap = document.createElement("div");
    imageWrap.style.position = "relative";
    imageWrap.style.display = "flex";
    imageWrap.style.flexDirection = "column";
    imageWrap.style.alignItems = "center";
    imageWrap.style.justifyContent = "flex-start";
    imageWrap.style.marginTop = "10px";

    const masterStatusCard = css(document.createElement("div"), {
        width: "100%",
        display: "flex",
        flexDirection: "column",
        padding: "8px 12px",
        marginBottom: "8px",
        boxSizing: "border-box",
        borderRadius: "10px",
        border: "1px solid rgba(255,144,0,0.25)",
        background: "linear-gradient(135deg, rgba(20,25,35,0.95), rgba(10,15,20,0.98))",
        boxShadow: "0 8px 24px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.04)",
        overflow: "hidden",
    });

    const statusGrid = css(document.createElement("div"), {
        display: "grid",
        gridTemplateColumns: "1fr",
        gap: "4px",
        width: "100%",
    });

    const createStatusRow = (label, valueId, color) => {
        const row = css(document.createElement("div"), {
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "10px",
            width: "100%",
        });
        const l = css(document.createElement("div"), {
            fontSize: "9px",
            color: "rgba(255,255,255,0.35)",
            fontWeight: "800",
            textTransform: "uppercase",
            flexShrink: "0",
        });
        l.textContent = label;

        const v = css(document.createElement("div"), {
            fontSize: "11px",
            fontWeight: "700",
            color,
            flex: "1",
            textAlign: "right",
            minWidth: "0",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            cursor: "help",
            transition: "color 0.18s ease, filter 0.18s ease",
            maskImage: "linear-gradient(to left, black 92%, transparent 100%)",
            webkitMaskImage: "linear-gradient(to left, black 92%, transparent 100%)",
        });
        v.id = valueId;
        v.textContent = "---";

        v.onmouseenter = () => {
            v.style.color = "#fff";
            v.style.filter = `drop-shadow(0 0 5px ${color}88)`;
        };
        v.onmouseleave = () => {
            v.style.color = color;
            v.style.filter = "none";
        };

        row.appendChild(l);
        row.appendChild(v);
        return row;
    };

    statusGrid.appendChild(createStatusRow("MODEL", "hud-master-ckpt-name", "#ff9000"));
    statusGrid.appendChild(createStatusRow("VAE", "hud-master-vae-name", "#fb923c"));
    masterStatusCard.appendChild(statusGrid);

    const filterStatusCard = css(document.createElement("div"), {
        width: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "0",
        marginBottom: "6px",
        boxSizing: "border-box",
        borderRadius: "10px",
        border: "1px solid rgba(255,255,255,0.12)",
        background: "linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0.04))",
        boxShadow: "0 6px 18px rgba(0,0,0,0.10), inset 0 1px 0 rgba(255,255,255,0.06)",
    });

    const filterSegmentWrap = css(document.createElement("div"), {
        display: "grid",
        gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
        width: "100%",
        gap: "0",
        overflow: "hidden",
        borderRadius: "10px",
    });

    const filterSegments = {};
    const createFilterSegment = (key, text, isLast = false) => {
        const segment = css(document.createElement("div"), {
            minWidth: "0",
            padding: "10px 8px",
            fontSize: "11px",
            fontWeight: "800",
            letterSpacing: "0.4px",
            textAlign: "center",
            transition: "background 0.18s ease, box-shadow 0.18s ease, color 0.18s ease, transform 0.18s ease",
            borderRight: isLast ? "none" : "1px solid rgba(255,255,255,0.10)",
            background: "transparent",
            color: "rgba(255,255,255,0.48)",
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
            userSelect: "none",
            position: "relative",
            overflow: "hidden",
            cursor: "pointer",
        });
        segment.textContent = text;
        segment.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            onFilterSegmentClick?.(key);
        };
        filterSegments[key] = segment;
        return segment;
    };

    filterSegmentWrap.appendChild(createFilterSegment("all", "ALL"));
    filterSegmentWrap.appendChild(createFilterSegment("sd15", "SD15"));
    filterSegmentWrap.appendChild(createFilterSegment("sdxl", "SDXL", true));
    filterStatusCard.appendChild(filterSegmentWrap);

    const frame = document.createElement("div");
    frame.style.position = "absolute";
    frame.style.inset = "10px 12px";
    frame.style.padding = "0";
    frame.style.borderRadius = "8px";
    frame.style.background = "transparent";
    frame.style.border = "1px solid rgba(255,255,255,0.16)";
    frame.style.boxSizing = "border-box";
    frame.style.display = "flex";
    frame.style.justifyContent = "center";
    frame.style.alignItems = "center";
    frame.style.paddingTop = "0px";
    frame.style.overflow = "hidden";
    frame.style.zIndex = "1";
    frame.style.boxShadow = "0 3px 10px rgba(0,0,0,0.10)";
    frame.style.transition = "transform 0.18s ease, box-shadow 0.18s ease";
    frame.style.transform = "scale(1)";
    frame.style.transformOrigin = "center center";
    frame.classList.add("preview-frame");

    const contentWrap = document.createElement("div");
    contentWrap.style.position = "relative";
    contentWrap.style.width = "100%";
    contentWrap.style.height = "100%";
    contentWrap.classList.add("preview-content");
    contentWrap.style.opacity = "1";

    const img = document.createElement("img");
    img.style.border = "none";
    img.style.width = "100%";
    img.style.height = "135px";
    img.style.background = "rgba(16,16,20,0.98)";
    img.style.objectFit = "cover";
    img.style.objectPosition = "center";
    img.style.borderRadius = "6px";
    img.style.border = "1px solid rgba(255,255,255,0.12)";
    img.style.display = "none";
    img.style.cursor = "pointer";
    img.style.boxShadow = "0 10px 26px rgba(0,0,0,0.20)";
    img.style.transition = "transform 0.16s ease, opacity 0.22s ease, filter 0.22s ease";
    img.style.transform = "none";
    img.style.transformOrigin = "center center";

    const favoriteBtn = css(document.createElement("button"), {
        position: "absolute",
        top: "20px",
        left: "20px",
        width: "38px",
        height: "38px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: "12px 8px 12px 8px",
        border: "1px solid rgba(255,255,255,0.22)",
        background: "linear-gradient(135deg, rgba(12,14,20,0.82), rgba(34,38,48,0.56))",
        boxShadow: "0 12px 28px rgba(5,6,10,0.42), 0 0 0 1px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.14)",
        color: "rgba(255,248,236,0.86)",
        fontSize: "18px",
        fontWeight: "800",
        lineHeight: "1",
        cursor: "pointer",
        zIndex: "3",
        backdropFilter: "blur(10px)",
        webkitBackdropFilter: "blur(10px)",
        textShadow: "0 1px 10px rgba(0,0,0,0.55), 0 0 10px rgba(255,245,220,0.12)",
        transition: "transform 0.18s ease, box-shadow 0.18s ease, background 0.18s ease, color 0.18s ease, border-color 0.18s ease, text-shadow 0.18s ease",
    });
    favoriteBtn.type = "button";
    favoriteBtn.textContent = "\u2606";
    favoriteBtn.title = "Bookmark this checkpoint";
    favoriteBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        onFavoriteToggle?.();
    };

    const loadingOverlay = css(document.createElement("div"), {
        position: "absolute",
        inset: "0",
        display: "none",
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        gap: "10px",
        borderRadius: "8px",
        background: "rgba(8, 8, 12, 0.58)",
        backdropFilter: "blur(10px)",
        webkitBackdropFilter: "blur(10px)",
        zIndex: "2",
        opacity: "0",
        transition: "opacity 0.22s ease",
        pointerEvents: "none",
        textAlign: "center",
        padding: "20px",
        boxSizing: "border-box",
    });

    const spinner = css(document.createElement("div"), {
        width: "28px",
        height: "28px",
        borderRadius: "999px",
        border: "3px solid rgba(255,255,255,0.18)",
        borderTopColor: "rgba(255,255,255,0.92)",
        animation: "hudPreviewSpin 0.8s linear infinite",
    });

    const loadingText = css(document.createElement("div"), {
        fontSize: "13px",
        fontWeight: "700",
        letterSpacing: "0.25px",
        color: "#f7f7f7",
        textAlign: "center",
        textShadow: `0 2px 10px ${SHADOW_BLACK_45}`,
    });
    loadingText.textContent = "Loading checkpoint preview...";

    const loadingSubText = css(document.createElement("div"), {
        fontSize: "11px",
        fontWeight: "500",
        color: "rgba(255,255,255,0.74)",
        textAlign: "center",
        maxWidth: "260px",
        lineHeight: "1.45",
        textShadow: "0 1px 6px rgba(0,0,0,0.28)",
    });
    loadingSubText.textContent = "Checking preview image near the checkpoint file.";

    loadingOverlay.appendChild(spinner);
    loadingOverlay.appendChild(loadingText);
    loadingOverlay.appendChild(loadingSubText);

    const expandedHint = css(document.createElement("div"), {
        position: "absolute",
        top: "0",
        left: "0",
        right: "0",
        height: "34px",
        display: "none",
        alignItems: "center",
        justifyContent: "center",
        padding: "0 12px",
        boxSizing: "border-box",
        background: "linear-gradient(180deg, rgba(8,8,12,0.72), rgba(8,8,12,0.42))",
        color: "rgba(255,255,255,0.96)",
        fontSize: "14px",
        fontWeight: "700",
        letterSpacing: "0.2px",
        borderTopLeftRadius: "6px",
        borderTopRightRadius: "6px",
        borderBottom: `1px solid ${COLOR_WHITE_SOFT_10}`,
        pointerEvents: "none",
        zIndex: "5",
        whiteSpace: "nowrap",
        textAlign: "center",
        backdropFilter: "blur(6px)",
        webkitBackdropFilter: "blur(6px)",
        opacity: "0.98",
    });
    expandedHint.textContent = "Click image to close";
    expandedHint.classList.add("preview-hint");
    expandedHint.id = "hud-expand-hint";

    const toggleBtn = css(document.createElement("div"), {
        position: "absolute",
        bottom: "10px",
        left: "50%",
        transform: "translateX(-50%)",
        minWidth: "168px",
        padding: "6px 12px",
        height: "auto",
        display: "none",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(10,10,14,0.58)",
        color: "rgba(255,255,255,0.92)",
        fontSize: "11px",
        fontWeight: "600",
        letterSpacing: "0.2px",
        borderRadius: "999px",
        cursor: "default",
        boxShadow: "0 8px 20px rgba(0,0,0,0.18)",
        border: "1px solid rgba(255,255,255,0.14)",
        backdropFilter: "blur(6px)",
        webkitBackdropFilter: "blur(6px)",
        pointerEvents: "none",
        zIndex: "3",
        transition: "all 0.18s ease",
    });
    toggleBtn.textContent = "Click image to expand";
    toggleBtn.classList.add("preview-hint");
    toggleBtn.id = "hud-toggle-hint";

    const zoomBtn = css(document.createElement("div"), {
        position: "absolute",
        top: "20px",
        right: "20px",
        minWidth: "170px",
        padding: "10px 16px",
        height: "auto",
        display: "none",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg, rgba(255,255,255,0.14), rgba(255,255,255,0.07))",
        backgroundSize: "220% 100%",
        color: "rgba(255,248,236,0.96)",
        fontSize: "12px",
        fontWeight: "700",
        letterSpacing: "0.2px",
        borderRadius: "14px 7px 14px 7px",
        cursor: "pointer",
        border: "1px solid rgba(255,255,255,0.18)",
        boxShadow: "0 12px 26px rgba(18,16,20,0.20), inset 0 1px 0 rgba(255,255,255,0.18)",
        textShadow: "0 1px 8px rgba(0,0,0,0.20)",
        backdropFilter: "blur(10px)",
        webkitBackdropFilter: "blur(10px)",
        transition: "transform 0.18s ease, filter 0.18s ease, box-shadow 0.18s ease, background 0.18s ease",
        zIndex: "3",
        overflow: "hidden",
    });
    zoomBtn.textContent = "View preview";
    zoomBtn.title = "View previews";

    const editBtn = css(document.createElement("div"), {
        position: "absolute",
        top: "66px",
        right: "20px",
        minWidth: "170px",
        padding: "10px 16px",
        height: "auto",
        display: "none",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg, rgba(80, 170, 255, 0.18), rgba(80, 120, 255, 0.10))",
        color: "rgba(225,245,255,0.96)",
        fontSize: "12px",
        fontWeight: "700",
        letterSpacing: "0.2px",
        borderRadius: "14px 7px 14px 7px",
        cursor: "pointer",
        border: "1px solid rgba(165,210,255,0.28)",
        boxShadow: "0 10px 22px rgba(18,16,20,0.22), inset 0 1px 0 rgba(255,255,255,0.14)",
        backdropFilter: "blur(10px)",
        webkitBackdropFilter: "blur(10px)",
        transition: "transform 0.18s ease, filter 0.18s ease, box-shadow 0.18s ease, background 0.18s ease",
        zIndex: "3",
    });
    editBtn.textContent = "Edit previews";
    editBtn.title = "Edit previews in Asset Hub";

    const label = css(document.createElement("div"), {
        width: "100%",
        boxSizing: "border-box",
        fontSize: "11px",
        color: "#d8d8d8",
        position: "relative",
        marginTop: "6px",
        padding: "0",
        minHeight: PREVIEW_SLOT_HEIGHT + "px",
        height: PREVIEW_SLOT_HEIGHT + "px",
        textAlign: "center",
        lineHeight: "1.45",
        borderRadius: "10px",
        background: "linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0.04))",
        border: `1px solid ${COLOR_WHITE_SOFT_10}`,
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        overflow: "hidden",
    });

    const labelContent = css(document.createElement("div"), {
        position: "absolute",
        inset: "0",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        padding: "10px 12px",
        boxSizing: "border-box",
    });
    labelContent.innerHTML = LOADING_PREVIEW_HTML;

    contentWrap.appendChild(img);
    frame.appendChild(contentWrap);
    frame.appendChild(loadingOverlay);
    label.appendChild(labelContent);
    label.appendChild(expandedHint);
    label.appendChild(frame);
    label.appendChild(toggleBtn);
    label.appendChild(zoomBtn);
    label.appendChild(editBtn);
    label.appendChild(favoriteBtn);
    imageWrap.appendChild(masterStatusCard);
    imageWrap.appendChild(filterStatusCard);
    imageWrap.appendChild(label);
    container.appendChild(signature);
    container.appendChild(imageWrap);

    const updateFilterStatusCard = ({ currentFilter }) => {
        for (const key of CHECKPOINT_FILTERS) {
            const segment = filterSegments[key];
            if (!segment) continue;

            const active = key === currentFilter;
            if (!active) {
                segment.style.color = "rgba(255,255,255,0.48)";
                segment.style.background = "transparent";
                segment.style.boxShadow = "inset 0 1px 0 rgba(255,255,255,0.04)";
                segment.style.transform = "scale(1)";
                continue;
            }

            const style = FILTER_SEGMENT_ACTIVE_STYLES[key];
            segment.style.color = style.color;
            segment.style.background = style.background;
            segment.style.boxShadow = style.boxShadow;
            segment.style.transform = "scale(1)";
        }
    };

    const bindButtonHoverEffects = () => {
        favoriteBtn.onmouseenter = () => {
            favoriteBtn.style.transform = "translateY(-2px) scale(1.04)";
        };
        favoriteBtn.onmouseleave = () => {
            favoriteBtn.style.transform = "translateY(0) scale(1)";
        };

        zoomBtn.onmouseenter = () => {
            zoomBtn.style.transform = "translateY(-3px) scale(1.05)";
            zoomBtn.style.filter = "brightness(1.08)";
            zoomBtn.style.backgroundPosition = "100% 50%";
            zoomBtn.style.background = "linear-gradient(120deg, rgba(255,250,235,0.18), rgba(255,224,165,0.18), rgba(255,196,110,0.16), rgba(255,232,190,0.16), rgba(255,255,255,0.10))";
            zoomBtn.style.animation = "hudGoldFlow 1.4s linear infinite, hudGlowPulse 1.8s ease-in-out infinite";
            zoomBtn.style.boxShadow = "0 18px 42px rgba(18,16,20,0.28), 0 0 24px rgba(255,220,140,0.20), inset 0 1px 0 rgba(255,255,255,0.28)";
            zoomBtn.style.borderColor = "rgba(255,232,180,0.26)";
        };
        zoomBtn.onmouseleave = () => {
            zoomBtn.style.transform = "translateY(0px) scale(1)";
            zoomBtn.style.filter = "none";
            zoomBtn.style.backgroundPosition = "0% 50%";
            zoomBtn.style.background = "linear-gradient(135deg, rgba(255,255,255,0.14), rgba(255,255,255,0.07))";
            zoomBtn.style.animation = "none";
            zoomBtn.style.boxShadow = "0 12px 26px rgba(18,16,20,0.20), inset 0 1px 0 rgba(255,255,255,0.18)";
            zoomBtn.style.borderColor = "rgba(255,255,255,0.18)";
        };
        zoomBtn.onmousedown = () => {
            zoomBtn.style.transform = "translateY(1px) scale(0.97)";
        };
        zoomBtn.onmouseup = () => {
            zoomBtn.style.transform = "translateY(-2px) scale(1.08)";
        };

        editBtn.onmouseenter = () => {
            editBtn.style.transform = "translateY(-2px) scale(1.04)";
            editBtn.style.filter = "brightness(1.08)";
        };
        editBtn.onmouseleave = () => {
            editBtn.style.transform = "translateY(0) scale(1)";
            editBtn.style.filter = "none";
        };
    };

    return {
        container,
        signature,
        imageWrap,
        masterStatusCard,
        filterStatusCard,
        frame,
        contentWrap,
        img,
        favoriteBtn,
        loadingOverlay,
        loadingText,
        loadingSubText,
        expandedHint,
        toggleBtn,
        zoomBtn,
        editBtn,
        label,
        labelContent,
        updateFilterStatusCard,
        bindButtonHoverEffects,
    };
}
