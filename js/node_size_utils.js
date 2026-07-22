export function setDomWidgetSize(widget, {
    width = null,
    minWidth = 0,
    height,
} = {}) {
    if (!widget || height == null) return widget;

    widget.computeSize = (availableWidth) => [
        Math.max(Number(width ?? availableWidth ?? 0), Number(minWidth || 0)),
        Number(height || 0),
    ];
    return widget;
}

export function constrainNodeSize(node, {
    defaultSize,
    defaultWidth,
    defaultHeight,
    minSize,
    minWidth,
    minHeight,
    widget = null,
    fitWidgetToNode = false,
    getWidgetOffset = () => 0,
    heightChromeOffset = 0,
    defaultRetryDelay = 100,
} = {}) {
    const resolvedDefaultSize = Array.isArray(defaultSize)
        ? defaultSize
        : [defaultWidth, defaultHeight];
    const resolvedMinSize = Array.isArray(minSize)
        ? minSize
        : [
            minWidth ?? resolvedDefaultSize[0],
            minHeight ?? resolvedDefaultSize[1],
        ];
    const chromeHeight = Math.max(0, Number(heightChromeOffset || 0));
    const toInternalSize = (size) => [
        Number(size?.[0] || 0),
        Math.max(0, Number(size?.[1] || 0) - chromeHeight),
    ];
    const safeDefaultSize = toInternalSize(resolvedDefaultSize);
    const safeMinSize = toInternalSize(resolvedMinSize.map((value, index) => Number(value || resolvedDefaultSize[index] || 0)));
    if (!node || !safeDefaultSize || !safeMinSize) return () => {};

    const getOffset = () => Math.max(0, Number(getWidgetOffset?.() || 0));
    const getClampedSize = (size = node.size) => [
        Math.max(Number(size?.[0] || 0), safeMinSize[0]),
        Math.max(Number(size?.[1] || 0), safeMinSize[1]),
    ];
    const isBelowDefaultSize = () => (
        Number(node.size?.[0] || 0) < safeDefaultSize[0] ||
        Number(node.size?.[1] || 0) < safeDefaultSize[1]
    );

    node.min_size = safeMinSize.slice();

    if (widget && fitWidgetToNode) {
        widget.computeSize = () => {
            const [width, height] = getClampedSize();
            const offset = getOffset();
            return [width, Math.max(height - offset, safeMinSize[1] - offset)];
        };
    }

    const applySize = (size) => {
        const nextSize = getClampedSize(size);
        if (nextSize[0] === node.size?.[0] && nextSize[1] === node.size?.[1]) return;
        node.setSize?.(nextSize);
        node.size = nextSize;
    };

    const applyDefaultSize = () => {
        if (isBelowDefaultSize()) applySize(safeDefaultSize);
    };
    const findNodeRoot = () => {
        const nodeId = String(node.id);
        const candidates = Array.from(document.querySelectorAll(`[data-node-id="${nodeId}"]`));
        return candidates.find((element) => element.style?.getPropertyValue("--node-width")) ||
            candidates.find((element) => element.style?.getPropertyValue("--min-node-width")) ||
            document.querySelector(`.comfy-node[data-node-id="${nodeId}"]`) ||
            document.querySelector(`.graph-node[data-node-id="${nodeId}"]`) ||
            candidates[0] ||
            null;
    };
    const parsePxVar = (element, name) => {
        const value = element?.style?.getPropertyValue(name) || "";
        const parsed = Number.parseFloat(value);
        return Number.isFinite(parsed) ? parsed : 0;
    };
    const isBelowMinSize = () => {
        const root = findNodeRoot();
        const rootWidth = parsePxVar(root, "--node-width");
        const rootHeight = parsePxVar(root, "--node-height");
        return (
            Number(node.size?.[0] || 0) < safeMinSize[0] ||
            Number(node.size?.[1] || 0) < safeMinSize[1] ||
            (rootWidth > 0 && rootWidth < safeMinSize[0]) ||
            (rootHeight > 0 && rootHeight < safeMinSize[1])
        );
    };

    let rootObserver = null;
    let rootSyncAttempts = 0;
    let rootSyncTimer = null;
    let syncingRootSize = false;
    let clampLoopRaf = null;
    let clampLoopFramesLeft = 0;

    const startClampLoop = (frames = 20) => {
        clampLoopFramesLeft = Math.max(clampLoopFramesLeft, frames);
        if (clampLoopRaf) return;

        const tick = () => {
            clampLoopRaf = null;
            if (clampLoopFramesLeft <= 0) return;
            clampLoopFramesLeft -= 1;
            applySize(node.size);
            syncNodeRootSize();
            clampLoopRaf = requestAnimationFrame(tick);
        };

        clampLoopRaf = requestAnimationFrame(tick);
    };

    const syncNodeRootSize = () => {
        const root = findNodeRoot();
        if (!root || syncingRootSize) return;

        syncingRootSize = true;
        root.style.setProperty("--min-node-width", `${safeMinSize[0]}px`);
        root.style.minWidth = `${safeMinSize[0]}px`;

        const currentWidth = parsePxVar(root, "--node-width");
        if (!currentWidth || currentWidth < safeMinSize[0]) {
            root.style.setProperty("--node-width", `${safeMinSize[0]}px`);
            applySize([safeMinSize[0], node.size?.[1]]);
        }

        const currentHeight = parsePxVar(root, "--node-height");
        if (!currentHeight || currentHeight < safeMinSize[1]) {
            root.style.setProperty("--node-height", `${safeMinSize[1]}px`);
            applySize([node.size?.[0], safeMinSize[1]]);
        }

        syncingRootSize = false;

        if (!rootObserver) {
            rootObserver = new MutationObserver(() => {
                if (syncingRootSize) return;
                startClampLoop(12);
            });
            rootObserver.observe(root, { attributes: true, attributeFilter: ["style"] });
        }
    };

    const scheduleRootSync = () => {
        if (rootSyncTimer) return;
        rootSyncTimer = setInterval(() => {
            syncNodeRootSize();
            if (rootObserver || ++rootSyncAttempts > 20) {
                clearInterval(rootSyncTimer);
                rootSyncTimer = null;
            }
        }, 100);
    };

    const originalOnResize = node.onResize;
    let clamping = false;
    node.onResize = function(size) {
        originalOnResize?.apply(this, arguments);
        if (clamping) return;

        const nextSize = getClampedSize(size);
        if (nextSize[0] === node.size?.[0] && nextSize[1] === node.size?.[1]) return;

        clamping = true;
        requestAnimationFrame(() => {
            applySize(nextSize);
            syncNodeRootSize();
            startClampLoop(20);
            clamping = false;
        });
    };

    const onResizePointerActivity = () => {
        if (isBelowMinSize()) startClampLoop(30);
    };

    applyDefaultSize();
    requestAnimationFrame(applyDefaultSize);
    requestAnimationFrame(syncNodeRootSize);
    scheduleRootSync();
    document.addEventListener("pointermove", onResizePointerActivity, true);
    document.addEventListener("pointerup", onResizePointerActivity, true);
    document.addEventListener("mousemove", onResizePointerActivity, true);
    document.addEventListener("mouseup", onResizePointerActivity, true);
    setTimeout(() => {
        applyDefaultSize();
        syncNodeRootSize();
        startClampLoop(20);
    }, defaultRetryDelay);

    return () => {
        if (clampLoopRaf) cancelAnimationFrame(clampLoopRaf);
        clampLoopRaf = null;
        if (rootSyncTimer) clearInterval(rootSyncTimer);
        rootSyncTimer = null;
        rootObserver?.disconnect();
        rootObserver = null;
        document.removeEventListener("pointermove", onResizePointerActivity, true);
        document.removeEventListener("pointerup", onResizePointerActivity, true);
        document.removeEventListener("mousemove", onResizePointerActivity, true);
        document.removeEventListener("mouseup", onResizePointerActivity, true);
        if (node.onResize !== originalOnResize) node.onResize = originalOnResize;
    };
}
