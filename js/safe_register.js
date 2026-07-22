import { app } from "/scripts/app.js";

function findExistingExtension(name) {
    if (!name || !Array.isArray(app.extensions)) return null;
    return app.extensions.find((extension) => extension?.name === name) ?? null;
}

export function safeRegisterExtension(extension) {
    const name = extension?.name;
    const existing = findExistingExtension(name);
    if (existing && typeof existing === "object") {
        for (const key of Object.keys(existing)) {
            if (!(key in extension)) {
                delete existing[key];
            }
        }

        Object.assign(existing, extension);
        console.warn(`[ComfyUI_HUD] Replaced extension before registration after reload: ${name}`);
        return true;
    }

    try {
        app.registerExtension(extension);
        return true;
    } catch (error) {
        if (name && String(error?.message || error).includes(`Extension named '${name}' already registered`)) {
            const registered = findExistingExtension(name);
            if (registered && typeof registered === "object") {
                Object.assign(registered, extension);
                console.warn(`[ComfyUI_HUD] Replaced extension after duplicate registration error: ${name}`);
                return true;
            }
        }

        throw error;
    }
}