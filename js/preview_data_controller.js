export function createPreviewDataController({
    galleryState,
    mapCheckpointPayloadToEntries,
    buildImageSignature,
    getCurrentCheckpointName,
    getCkptWidget,
    getBaseFromWidget,
    scheduleUpdatePreview,
    onPayload,
}) {
    const GALLERY_CACHE_TTL_MS = 30000;
    const GALLERY_CACHE_EMPTY_TTL_MS = 6000;
    const ASSET_HUB_WATCH_INTERVAL_MS = 1500;
    const galleryCache = new Map();

    let assetHubWatchTimer = null;
    let assetHubWatchBusy = false;
    let assetHubWatchCkpt = "";
    let assetHubWatchLastSignature = "";

    const clearCache = (base) => {
        if (!base) return;
        galleryCache.delete(base);
    };

    const clearCurrentCache = () => {
        const widget = getCkptWidget();
        const base = getBaseFromWidget(widget);
        if (base) clearCache(base);
    };

    const stopWatch = ({ refresh = false } = {}) => {
        if (assetHubWatchTimer) {
            clearInterval(assetHubWatchTimer);
            assetHubWatchTimer = null;
        }
        assetHubWatchBusy = false;
        assetHubWatchCkpt = "";
        assetHubWatchLastSignature = "";
        if (refresh) {
            clearCurrentCache();
            scheduleUpdatePreview();
        }
    };

    const fetchCheckpointImageSignature = async (ckptName) => {
        const res = await fetch(`/hud/checkpoint-preview/list?ckpt=${encodeURIComponent(ckptName)}`, {
            cache: "no-store",
        });
        if (!res.ok) return null;
        const payload = await res.json();
        const images = Array.isArray(payload?.images) ? payload.images : [];
        return buildImageSignature(images);
    };

    const startWatch = (fileBrowser, ckptName) => {
        if (!fileBrowser || !ckptName) return;
        stopWatch();
        assetHubWatchCkpt = ckptName;
        assetHubWatchLastSignature = buildImageSignature(galleryState.images);

        assetHubWatchTimer = setInterval(async () => {
            if (assetHubWatchBusy) return;
            if (!fileBrowser.isVisible) {
                stopWatch({ refresh: true });
                return;
            }
            if (getCurrentCheckpointName() !== assetHubWatchCkpt) return;

            assetHubWatchBusy = true;
            try {
                const signature = await fetchCheckpointImageSignature(assetHubWatchCkpt);
                if (signature == null) return;
                if (signature !== assetHubWatchLastSignature) {
                    assetHubWatchLastSignature = signature;
                    clearCurrentCache();
                    scheduleUpdatePreview();
                }
            } catch (_) {
                // Keep watcher resilient; next interval will retry.
            } finally {
                assetHubWatchBusy = false;
            }
        }, ASSET_HUB_WATCH_INTERVAL_MS);
    };

    const collectGalleryImages = async (base, isStale = null) => {
        const widget = getCkptWidget();
        const ckptName = String(widget?.value ?? "");
        const t = Math.floor(Date.now() / 10000);
        galleryState.lastFetchedEntries = [];

        if (!ckptName) return [];

        try {
            const listUrl = `/hud/checkpoint-preview/list?ckpt=${encodeURIComponent(ckptName)}&t=${t}`;
            const response = await fetch(listUrl, { cache: "no-store" });
            if (!response.ok) return [];

            const payload = await response.json();
            if (typeof onPayload === "function") onPayload(payload);
            const mapped = mapCheckpointPayloadToEntries(payload, t);
            const images = mapped.images;
            galleryState.lastFetchedEntries = mapped.entries;
            if (isStale && isStale()) return images;
            return images;
        } catch (_) {
            return [];
        }
    };

    const collectGalleryImagesCached = async (base, isStale = null) => {
        const cached = galleryCache.get(base);
        const now = Date.now();
        if (cached) {
            const ttl = cached.ttl ?? (cached.images?.length ? GALLERY_CACHE_TTL_MS : GALLERY_CACHE_EMPTY_TTL_MS);
            if ((now - cached.at) < ttl) {
                galleryState.lastFetchedEntries = Array.isArray(cached.entries) ? cached.entries : [];
                if (galleryCache.size > 1) {
                    galleryCache.delete(base);
                    galleryCache.set(base, cached);
                }
                return cached.images;
            }
        }

        const images = await collectGalleryImages(base, isStale);
        if (isStale && isStale()) return images;

        galleryCache.set(base, {
            at: now,
            images,
            entries: galleryState.lastFetchedEntries,
            ttl: images.length ? GALLERY_CACHE_TTL_MS : GALLERY_CACHE_EMPTY_TTL_MS,
        });
        if (galleryCache.size > 64) {
            const firstKey = galleryCache.keys().next().value;
            if (firstKey !== undefined) galleryCache.delete(firstKey);
        }
        return images;
    };

    return {
        clearCache,
        stopWatch,
        startWatch,
        collectGalleryImagesCached,
    };
}
