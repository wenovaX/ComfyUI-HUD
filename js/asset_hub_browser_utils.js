export function isNativeFileDrag(dataTransfer) {
    if (!dataTransfer) return false;
    if (dataTransfer.files && dataTransfer.files.length > 0) return true;
    const types = Array.from(dataTransfer.types || []);
    return types.includes("Files");
}

export function filterFilesByExtensions(fileList, extensionSet) {
    const files = Array.from(fileList || []).filter((file) => file && file.size >= 0);
    const originalCount = files.length;
    if (!(extensionSet instanceof Set) || extensionSet.size === 0) {
        return { files, originalCount };
    }

    const filteredFiles = files.filter((file) => {
        const name = String(file.name || "").toLowerCase();
        const ext = name.split(".").pop() || "";
        return extensionSet.has(ext);
    });
    return { files: filteredFiles, originalCount };
}

export function joinHudPath(base, folder) {
    if (!base || base === "." || base === "/") return folder;
    const cleanBase = base.endsWith("/") || base.endsWith("\\") ? base.slice(0, -1) : base;
    const separator = base.includes("\\") ? "\\" : "/";
    return `${cleanBase}${separator}${folder}`;
}

export function generateItemsDirtyHash(items) {
    return items.length ? `${items.length}-${items[0].mtime}-${items[items.length - 1].mtime}` : "empty";
}

export function buildHudSourcePathFromPayload(payload) {
    if (!payload || !payload.filename) return "";

    const filename = String(payload.filename || "").trim();
    let subfolder = String(payload.subfolder || "").trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
    const type = String(payload.type || "").trim().toLowerCase();

    if (type === "input") {
        if (subfolder === "input") subfolder = "";
        else if (subfolder.startsWith("input/")) subfolder = subfolder.slice(6);
        return subfolder ? `input/${subfolder}/${filename}` : `input/${filename}`;
    }

    if (type === "output") {
        if (subfolder === "output") subfolder = "";
        else if (subfolder.startsWith("output/")) subfolder = subfolder.slice(7);
        return subfolder ? `output/${subfolder}/${filename}` : `output/${filename}`;
    }

    if (type === "absolute") {
        return subfolder ? joinHudPath(subfolder, filename) : filename;
    }

    return subfolder ? joinHudPath(subfolder, filename) : filename;
}
