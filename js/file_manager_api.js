export class HUDFileManagerApi {
    async requestJson(url, options = {}) {
        const response = await fetch(url, options);
        let data = {};
        try {
            data = await response.json();
        } catch (_) {}
        return { ok: response.ok, status: response.status, data };
    }

    async list(path, signal) {
        const url = `/hud/file-manager/list?path=${encodeURIComponent(path)}`;
        return this.requestJson(url, signal ? { signal } : {});
    }

    async getBookmarks() {
        return this.requestJson("/hud/file-manager/bookmarks");
    }

    async addBookmark(path) {
        return this.requestJson("/hud/file-manager/bookmarks", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ path }),
        });
    }

    async removeBookmark(path) {
        return this.requestJson("/hud/file-manager/bookmarks", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ path }),
        });
    }

    async pickDirectory() {
        return this.requestJson("/hud/file-manager/picker", { method: "POST" });
    }

    async action(payload) {
        return this.requestJson("/hud/file-manager/action", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });
    }

    async upload(path, files) {
        const form = new FormData();
        form.append("path", path);
        for (let i = 0; i < files.length; i++) {
            form.append("files", files[i]);
        }
        return this.requestJson("/hud/file-manager/upload", {
            method: "POST",
            body: form,
        });
    }

    async uploadCheckpointPreview(ckptName, files) {
        const form = new FormData();
        form.append("ckpt", ckptName);
        for (let i = 0; i < files.length; i++) {
            form.append("files", files[i]);
        }
        return this.requestJson("/hud/checkpoint-preview/upload", {
            method: "POST",
            body: form,
        });
    }
}
