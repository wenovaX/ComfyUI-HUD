export function createCheckpointFilterController({
    app,
    node,
    favoriteBtn,
    filters,
    filterWidgetValues,
    favoritesStorageKey,
    isSameArray,
    refreshCanvas,
    getCkptWidget,
    getFilterWidget,
    getBookmarkWidget,
    onFilterStateChange,
    onPreviewRequested,
}) {
    let currentFilter = "all";
    let bookmarkOnly = false;
    let lastFavoriteButtonVisible = null;
    let lastFavoriteButtonActive = null;
    let lastVisibleCheckpointValues = null;
    let ckptValueSource = null;
    let favoriteMap = loadFavoriteMap(favoritesStorageKey);

    function emitFilterState() {
        onFilterStateChange?.({ filter: currentFilter, bookmarkOnly });
    }

    function normalizeFilterValue(value) {
        const key = String(value ?? "all").trim().toLowerCase();
        return filters.includes(key) ? key : "all";
    }

    function loadFavoriteMap(storageKey) {
        try {
            const raw = localStorage.getItem(storageKey);
            const parsed = raw ? JSON.parse(raw) : {};
            return parsed && typeof parsed === "object" ? parsed : {};
        } catch (_) {
            return {};
        }
    }

    function saveFavoriteMap() {
        try {
            localStorage.setItem(favoritesStorageKey, JSON.stringify(favoriteMap));
        } catch (_) {}
    }

    function getCurrentCheckpointName(widget = getCkptWidget()) {
        return String(widget?.value ?? "").trim();
    }

    function isFavoriteCheckpoint(ckptName) {
        return !!favoriteMap[String(ckptName ?? "")];
    }

    function updateFavoriteButton() {
        const ckptName = getCurrentCheckpointName();
        const shouldShow = !!ckptName;
        if (shouldShow !== lastFavoriteButtonVisible) {
            favoriteBtn.style.display = shouldShow ? "flex" : "none";
            lastFavoriteButtonVisible = shouldShow;
        }
        if (!shouldShow) return;

        const active = isFavoriteCheckpoint(ckptName);
        if (active === lastFavoriteButtonActive) return;
        lastFavoriteButtonActive = active;
        favoriteBtn.textContent = active ? "\u2605" : "\u2606";
        favoriteBtn.style.color = active ? "#fff4cf" : "rgba(255,248,236,0.86)";
        favoriteBtn.style.background = active
            ? "linear-gradient(135deg, rgba(84,58,20,0.90), rgba(255,198,110,0.34))"
            : "linear-gradient(135deg, rgba(12,14,20,0.82), rgba(34,38,48,0.56))";
        favoriteBtn.style.borderColor = active
            ? "rgba(255,228,168,0.50)"
            : "rgba(255,255,255,0.22)";
        favoriteBtn.style.boxShadow = active
            ? "0 14px 28px rgba(5,6,10,0.42), 0 0 22px rgba(255,215,120,0.28), 0 0 0 1px rgba(120,84,18,0.24), inset 0 1px 0 rgba(255,255,255,0.20)"
            : "0 12px 28px rgba(5,6,10,0.42), 0 0 0 1px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.14)";
        favoriteBtn.style.textShadow = active
            ? "0 1px 12px rgba(32,20,0,0.55), 0 0 14px rgba(255,226,150,0.34)"
            : "0 1px 10px rgba(0,0,0,0.55), 0 0 10px rgba(255,245,220,0.12)";
    }

    function getCheckpointFilterKey(value) {
        const name = String(value ?? "").split(/[\\/]/).pop()?.toLowerCase() || "";
        if (name.startsWith("sd15_")) return "sd15";
        if (name.startsWith("sdxl_")) return "sdxl";
        return "other";
    }

    function getCheckpointValues(widget) {
        if (!widget?.options) return [];

        const source = ckptValueSource ?? widget.options.values;
        if (!ckptValueSource && source != null) {
            ckptValueSource = source;
        }

        const values = typeof source === "function" ? source.call(widget, widget, node) : source;
        return Array.isArray(values) ? [...values] : [];
    }

    function filterCheckpointValues(values) {
        let nextValues = values;

        if (currentFilter !== "all") {
            nextValues = nextValues.filter((value) => getCheckpointFilterKey(value) === currentFilter);
        }

        if (bookmarkOnly) {
            nextValues = nextValues.filter((value) => isFavoriteCheckpoint(value));
        }

        return nextValues;
    }

    function ensureFilteredCheckpointSelection(widget, values) {
        if (!widget) return false;

        const currentValue = String(widget.value ?? "");
        if (!values.length) {
            if (!currentValue) return false;
            widget.value = "";
            return true;
        }

        if (currentValue && values.includes(currentValue)) {
            return false;
        }

        widget.value = values[0];
        return true;
    }

    function notifyCheckpointWidgetChanged(widget = getCkptWidget()) {
        if (!widget?.callback) {
            refreshCanvas();
            return;
        }

        try {
            widget.callback.call(widget, widget.value, app.canvas, node);
        } catch (_) {
            try {
                widget.callback.call(widget);
            } catch (_) {}
        }

        refreshCanvas();
    }

    function applyCheckpointFilter(widget = getCkptWidget(), { ensureSelection = false } = {}) {
        if (!widget?.options) return { selectionChanged: false, isEmpty: false };

        const allValues = getCheckpointValues(widget);
        const visibleValues = filterCheckpointValues(allValues);
        const valuesChanged = !isSameArray(lastVisibleCheckpointValues, visibleValues);

        if (valuesChanged) {
            lastVisibleCheckpointValues = [...visibleValues];
            widget.options.values = visibleValues;

            if (typeof ckptValueSource === "function") {
                widget.options.values = () => {
                    const raw = ckptValueSource.call(widget, widget, node);
                    return filterCheckpointValues(Array.isArray(raw) ? raw : []);
                };
            }
        }

        const selectionChanged = ensureSelection
            ? ensureFilteredCheckpointSelection(widget, visibleValues)
            : false;

        if (valuesChanged || selectionChanged) {
            if (widget.inputEl) widget.inputEl.value = widget.value;
            refreshCanvas();
        }

        return { selectionChanged, isEmpty: visibleValues.length === 0 };
    }

    function syncFilterStateFromWidget(widget = getFilterWidget()) {
        currentFilter = normalizeFilterValue(widget?.value);
        emitFilterState();
    }

    function syncBookmarkOnlyFromWidget(widget = getBookmarkWidget()) {
        bookmarkOnly = !!widget?.value;
        emitFilterState();
    }

    function setCheckpointFilter(filterKey, { ensureSelection = false, triggerPreview = false } = {}) {
        const nextFilter = normalizeFilterValue(filterKey);
        const ckptWidget = getCkptWidget();
        const filterWidget = getFilterWidget();

        currentFilter = nextFilter;

        if (filterWidget) {
            const widgetValue = filterWidgetValues[nextFilter] || filterWidgetValues.all;
            if (filterWidget.value !== widgetValue) {
                filterWidget.value = widgetValue;
                if (filterWidget.callback) {
                    filterWidget.callback.call(filterWidget, filterWidget.value);
                }
            }
        }

        emitFilterState();

        const result = applyCheckpointFilter(ckptWidget, { ensureSelection });
        if (result.selectionChanged) {
            notifyCheckpointWidgetChanged(ckptWidget);
        }
        updateFavoriteButton();
        if (triggerPreview && (result.selectionChanged || result.isEmpty)) {
            onPreviewRequested?.();
        }

        refreshCanvas();
        return result;
    }

    function toggleCurrentCheckpointFavorite() {
        const ckptName = getCurrentCheckpointName();
        if (!ckptName) return;

        if (isFavoriteCheckpoint(ckptName)) {
            delete favoriteMap[ckptName];
        } else {
            favoriteMap[ckptName] = true;
        }

        saveFavoriteMap();
        updateFavoriteButton();

        if (bookmarkOnly) {
            const result = applyCheckpointFilter(undefined, { ensureSelection: true });
            if (result.selectionChanged || result.isEmpty) {
                onPreviewRequested?.();
            }
        }
    }

    function hasCheckpointValueSource() {
        return ckptValueSource != null;
    }

    function captureCheckpointValueSource(widget = getCkptWidget()) {
        if (!widget?.options || ckptValueSource != null) return false;
        ckptValueSource = widget.options.values;
        return ckptValueSource != null;
    }

    return {
        getCurrentFilter: () => currentFilter,
        isBookmarkOnlyEnabled: () => bookmarkOnly,
        getCurrentCheckpointName,
        hasCheckpointValueSource,
        captureCheckpointValueSource,
        syncFilterStateFromWidget,
        syncBookmarkOnlyFromWidget,
        updateFavoriteButton,
        toggleCurrentCheckpointFavorite,
        setCheckpointFilter,
        getCheckpointValues,
        filterCheckpointValues,
        notifyCheckpointWidgetChanged,
        applyCheckpointFilter,
    };
}
