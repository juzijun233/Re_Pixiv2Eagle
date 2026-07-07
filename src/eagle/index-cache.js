"use strict";

import { bindEagleIndexRefresh, getFolderId } from "../tampermonkey/setting.js";
import { dbg, warn, err } from "../tampermonkey/logger.js";
import { gmFetch } from "../tampermonkey/request.js";
import {
    loadFromGMIfNeeded,
    upsertEntry,
    persistToGM,
    clearCache,
} from "../shared/marking/saved-lookup.js";

export function serializeIndex(index) {
    const serialized = {};
    for (const [uid, data] of index.entries()) {
        serialized[uid] = {
            id: data.id,
            pids: Array.from(data.pids),
        };
    }
    return serialized;
}

export function deserializeIndex(data) {
    const index = new Map();
    for (const [uid, value] of Object.entries(data)) {
        index.set(uid, {
            id: value.id,
            pids: new Set(value.pids),
        });
    }
    return index;
}

export function patchEagleIndex({ userId, pid, folderId, kind = "artwork" }) {
    try {
        loadFromGMIfNeeded();
        upsertEntry({ kind, id: pid, userId, folderId, savedAt: Date.now() });
        persistToGM();
    } catch (e) {
        warn("保存索引 patch 失败:", e);
    }
}

export function invalidateEagleIndex() {
    window.__pixiv2eagle_eagleIndexLoadingPromise = null;
}

if (typeof window.__pixiv2eagle_globalEagleIndex === "undefined") {
    window.__pixiv2eagle_globalEagleIndex = null;
}
if (typeof window.__pixiv2eagle_eagleIndexLoadingPromise === "undefined") {
    window.__pixiv2eagle_eagleIndexLoadingPromise = null;
}

export async function buildArtistIndexFromApi(pixivFolderId) {
    const index = new Map();
    if (!pixivFolderId) return index;

    const folderList = await gmFetch("http://localhost:41595/api/folder/list");
    if (!folderList.status || !Array.isArray(folderList.data)) return index;

    const findFolder = (folders, id) => {
        for (const f of folders) {
            if (f.id === id) return f;
            if (f.children) {
                const res = findFolder(f.children, id);
                if (res) return res;
            }
        }
        return null;
    };
    const root = findFolder(folderList.data, pixivFolderId);
    if (!root || !root.children) return index;

    for (const artistFolder of root.children) {
        const desc = artistFolder.description || "";
        const match = desc.match(/pid\s*=\s*(\d+)/);
        if (!match) continue;
        const artistUid = match[1];
        const pids = new Set();

        const traverse = (nodes) => {
            for (const node of nodes) {
                const subDesc = (node.description || "").trim();
                if (subDesc && /^\d+$/.test(subDesc)) {
                    pids.add(subDesc);
                }
                if (node.children && node.children.length > 0) {
                    traverse(node.children);
                }
            }
        };
        if (artistFolder.children) traverse(artistFolder.children);
        index.set(artistUid, { id: artistFolder.id, pids });
    }
    dbg(`全局 Eagle 索引构建完成，包含 ${index.size} 位画师`);
    return index;
}

export async function ensureEagleIndex(forceRefresh = false) {
    if (forceRefresh) invalidateEagleIndex();

    loadFromGMIfNeeded();

    const memIndex = window.__pixiv2eagle_globalEagleIndex;
    if (!forceRefresh && memIndex instanceof Map && memIndex.size > 0) {
        return memIndex;
    }
    if (window.__pixiv2eagle_eagleIndexLoadingPromise) {
        return window.__pixiv2eagle_eagleIndexLoadingPromise;
    }

    const pixivFolderId = getFolderId();
    if (!pixivFolderId) return window.__pixiv2eagle_globalEagleIndex;

    dbg("正在构建全局 Eagle 索引...");
    window.__pixiv2eagle_eagleIndexLoadingPromise = (async () => {
        try {
            const apiMap = await buildArtistIndexFromApi(pixivFolderId);
            if (apiMap.size > 0) {
                for (const [uid, data] of apiMap) {
                    for (const pid of data.pids) {
                        upsertEntry({
                            kind: "artwork",
                            id: pid,
                            userId: uid,
                            folderId: data.id,
                            savedAt: Date.now(),
                        });
                    }
                }
                persistToGM();
            }
        } catch (e) {
            err("构建 Eagle 索引失败:", e);
        }
        return window.__pixiv2eagle_globalEagleIndex;
    })();

    try {
        await window.__pixiv2eagle_eagleIndexLoadingPromise;
    } catch (e) {
        err(e);
    } finally {
        window.__pixiv2eagle_eagleIndexLoadingPromise = null;
    }
    return window.__pixiv2eagle_globalEagleIndex;
}

bindEagleIndexRefresh({ invalidateEagleIndex, ensureEagleIndex });

export { clearCache } from "../shared/marking/saved-lookup.js";
