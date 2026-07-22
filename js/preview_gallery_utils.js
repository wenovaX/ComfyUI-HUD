export function createGalleryState() {
    return {
        images: [],
        entries: [],
        lastFetchedEntries: [],
        pendingRefreshOnViewerClose: false,
        pendingPrimaryRelOnViewerClose: "",
    };
}

export function extractPreviewFilename(url, fallback = "preview") {
    const raw = String(url || "");
    try {
        const parsed = new URL(raw, window.location.origin);
        const rel = parsed.searchParams.get("rel");
        if (rel) {
            const decodedRel = decodeURIComponent(rel);
            const byRel = decodedRel.split("/").pop();
            if (byRel) return byRel;
        }
        const byFilename = parsed.searchParams.get("filename");
        if (byFilename) return decodeURIComponent(byFilename);
        const pathName = (parsed.pathname || "").split("/").pop();
        if (pathName && pathName.toLowerCase() !== "file") return pathName;
    } catch (_) {}
    const pathPart = raw.split("?")[0] || "";
    const byPath = pathPart.split("/").pop();
    if (byPath && byPath.toLowerCase() !== "file") return byPath;
    return fallback;
}

export function setGalleryFromImages(state, images, entries = null) {
    state.images = Array.isArray(images) ? images : [];
    if (Array.isArray(entries) && entries.length === state.images.length) {
        state.entries = entries.map((entry, index) => ({
            url: state.images[index],
            rel: String(entry?.rel || ""),
            name: String(entry?.name || ""),
            is_default: !!entry?.is_default,
            kind: String(entry?.kind || "image"),
        }));
        return;
    }

    state.entries = state.images.map((url, index) => {
        const cleanUrl = String(url || "");
        const filename = extractPreviewFilename(cleanUrl, `preview_${index + 1}`);
        return {
            url: cleanUrl,
            rel: "",
            name: filename,
            is_default: index === 0,
            kind: "image",
        };
    });
}

export function mapCheckpointPayloadToEntries(payload, t = Math.floor(Date.now() / 1000)) {
    if (!payload || typeof payload !== "object") {
        return { entries: [], images: [] };
    }
    const imageItems = Array.isArray(payload.image_items) ? payload.image_items : [];
    if (imageItems.length) {
        const entries = imageItems.map((entry, index) => {
            const rawUrl = String(entry?.url || "");
            const urlWithTs = `${rawUrl}${rawUrl.includes("?") ? "&" : "?"}t=${t}`;
            return {
                url: urlWithTs,
                rel: String(entry?.rel || ""),
                name: String(entry?.name || `preview_${index + 1}`),
                is_default: !!entry?.is_default,
                kind: String(entry?.kind || "image"),
            };
        });
        return { entries, images: entries.map((entry) => entry.url) };
    }

    const images = Array.isArray(payload.images) ? payload.images : [];
    const entries = images.map((url, index) => {
        const clean = String(url || "");
        return {
            url: `${clean}${clean.includes("?") ? "&" : "?"}t=${t}`,
            rel: "",
            name: extractPreviewFilename(clean, `preview_${index + 1}`),
            is_default: index === 0,
            kind: "image",
        };
    });
    return { entries, images: entries.map((entry) => entry.url) };
}

export function buildMediaViewerItemsFromEntries(entries) {
    const safeEntries = Array.isArray(entries) ? entries : [];
    return safeEntries.map((entry, index) => {
        const cleanUrl = String(entry?.url || "");
        const filename = String(entry?.name || extractPreviewFilename(cleanUrl, `preview_${index + 1}`));
        return {
            name: filename,
            display_name: filename,
            is_image: true,
            direct_url: cleanUrl,
            hud_preview_rel: String(entry?.rel || ""),
            hud_preview_default: !!entry?.is_default,
        };
    });
}

export function buildImageSignature(images) {
    if (!Array.isArray(images) || !images.length) return "";
    return images
        .map((url) => String(url || "").split("?")[0])
        .join("\n");
}
