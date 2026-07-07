"use strict";

import { getFolderId } from "../../tampermonkey/setting.js";
import { warn } from "../../tampermonkey/logger.js";
import {
    loadEagleIndexCache,
    saveEagleIndexCache,
    clearEagleIndexCache,
} from "../../tampermonkey/storage.js";

/**
 * @typedef {'artwork' | 'novel' | 'manga-chapter'} SavedKind
 */

/**
 * @typedef {{
 *   kind: SavedKind,
 *   id: string,
 *   userId: string,
 *   folderId: string,
 *   savedAt: number,
 * }} SavedEntry
 */

/**
 * @typedef {{
 *   entryCount: number,
 *   artistCount: number,
 *   artworkCount: number,
 *   novelCount: number,
 *   mangaChapterCount: number,
 *   lastSyncAt: number | null,
 *   pixivFolderId: string,
 * }} CacheStats
 */

const state = {
    version: 2,
    pixivFolderId: "",
    /** @type {number | null} */
    lastSyncAt: null,
    /** @type {Map<string, { id: string, pids: Set<string> }>} */
    index: new Map(),
    /** @type {Map<string, SavedEntry>} */
    entries: new Map(),
    loaded: false,
};

function entryKey(kind, id) {
    return `${kind}:${id}`;
}

function syncWindowIndex() {
    window.__pixiv2eagle_globalEagleIndex = state.index;
}

function resetState() {
    state.version = 2;
    state.pixivFolderId = getFolderId() || "";
    state.lastSyncAt = null;
    state.index = new Map();
    state.entries = new Map();
    syncWindowIndex();
}

function hydrateFromV2(payload) {
    state.version = 2;
    state.pixivFolderId = payload.pixivFolderId || "";
    state.lastSyncAt = typeof payload.lastSyncAt === "number" ? payload.lastSyncAt : null;

    state.index = new Map();
    for (const [uid, value] of Object.entries(payload.index || {})) {
        state.index.set(uid, { id: value.id, pids: new Set(value.pids || []) });
    }

    state.entries = new Map();
    for (const entry of payload.entries || []) {
        if (!entry || !entry.kind || entry.id == null) continue;
        state.entries.set(entryKey(entry.kind, entry.id), {
            kind: entry.kind,
            id: String(entry.id),
            userId: entry.userId ? String(entry.userId) : "",
            folderId: entry.folderId || "",
            savedAt: typeof entry.savedAt === "number" ? entry.savedAt : Date.now(),
        });
    }
    syncWindowIndex();
}

function migrateV1ToV2(v1) {
    const index = v1.index || {};
    const entries = [];
    for (const [userId, value] of Object.entries(index)) {
        const folderId = value.id;
        for (const pid of value.pids || []) {
            entries.push({
                kind: "artwork",
                id: String(pid),
                userId: String(userId),
                folderId,
                savedAt: Date.now(),
            });
        }
    }
    return {
        version: 2,
        pixivFolderId: v1.pixivFolderId || "",
        lastSyncAt: null,
        index,
        entries,
    };
}

function serializeState() {
    const index = {};
    for (const [uid, value] of state.index.entries()) {
        index[uid] = { id: value.id, pids: Array.from(value.pids) };
    }
    return {
        version: 2,
        pixivFolderId: state.pixivFolderId,
        lastSyncAt: state.lastSyncAt,
        index,
        entries: Array.from(state.entries.values()),
    };
}

export function loadFromGMIfNeeded() {
    if (state.loaded) return;
    try {
        const raw = loadEagleIndexCache();
        if (!raw) {
            resetState();
        } else if (raw.version === 2) {
            hydrateFromV2(raw);
        } else {
            const v2 = migrateV1ToV2(raw);
            hydrateFromV2(v2);
            saveEagleIndexCache(v2);
        }
    } catch (e) {
        warn("saved-lookup: 加载 GM 缓存失败，重置为空 v2:", e);
        try {
            clearEagleIndexCache();
        } catch {
            // 忽略清除失败
        }
        resetState();
    }
    state.loaded = true;
}

export function persistToGM() {
    try {
        saveEagleIndexCache(serializeState());
    } catch (e) {
        warn("saved-lookup: 写回 GM 失败:", e);
    }
}

export function upsertEntry(entry) {
    if (!entry || !entry.kind || entry.id == null) return;
    loadFromGMIfNeeded();

    const key = entryKey(entry.kind, entry.id);
    const existing = state.entries.get(key);
    const normalized = {
        kind: entry.kind,
        id: String(entry.id),
        userId: entry.userId ? String(entry.userId) : existing ? existing.userId : "",
        folderId: entry.folderId || (existing ? existing.folderId : ""),
        savedAt: existing
            ? Math.max(existing.savedAt, entry.savedAt || Date.now())
            : entry.savedAt || Date.now(),
    };
    state.entries.set(key, normalized);

    if (normalized.kind === "artwork" && normalized.userId) {
        const artistData = state.index.get(normalized.userId);
        if (artistData) {
            artistData.pids.add(normalized.id);
        } else {
            state.index.set(normalized.userId, {
                id: normalized.folderId,
                pids: new Set([normalized.id]),
            });
        }
    }
}

export function removeEntry(kind, id) {
    loadFromGMIfNeeded();
    const key = entryKey(kind, String(id));
    const existed = state.entries.delete(key);
    if (existed && kind === "artwork") {
        for (const [uid, data] of state.index) {
            if (data.pids.delete(String(id)) && data.pids.size === 0) {
                state.index.delete(uid);
            }
        }
    }
    return existed;
}

export function isSaved(kind, id) {
    loadFromGMIfNeeded();
    return state.entries.has(entryKey(kind, String(id)));
}

export function getSavedEntry(kind, id) {
    loadFromGMIfNeeded();
    return state.entries.get(entryKey(kind, String(id))) || null;
}

export function listSavedByUser(userId, kind) {
    loadFromGMIfNeeded();
    const uid = String(userId);
    const out = [];
    for (const entry of state.entries.values()) {
        if (entry.userId !== uid) continue;
        if (kind && entry.kind !== kind) continue;
        out.push(entry);
    }
    return out;
}

export function listSavedByKind(kind) {
    loadFromGMIfNeeded();
    const out = [];
    for (const entry of state.entries.values()) {
        if (entry.kind === kind) out.push(entry);
    }
    return out;
}

export function isArtworkSavedByUser(userId, pid) {
    loadFromGMIfNeeded();
    const artistData = state.index.get(String(userId));
    return !!artistData && artistData.pids.has(String(pid));
}

export function getAllEntries() {
    loadFromGMIfNeeded();
    return Array.from(state.entries.values());
}

export function rebuildIndexFromEntries(entries = Array.from(state.entries.values())) {
    const index = new Map();
    for (const entry of entries) {
        if (entry.kind !== "artwork" || !entry.userId) continue;
        const existing = index.get(entry.userId);
        if (existing) {
            existing.pids.add(entry.id);
        } else {
            index.set(entry.userId, { id: entry.folderId, pids: new Set([entry.id]) });
        }
    }
    state.index = index;
    syncWindowIndex();

    const serialized = {};
    for (const [uid, value] of index.entries()) {
        serialized[uid] = { id: value.id, pids: Array.from(value.pids) };
    }
    return serialized;
}

export function markSynced(pixivFolderId) {
    state.lastSyncAt = Date.now();
    if (pixivFolderId) state.pixivFolderId = pixivFolderId;
}

export function getCacheStats() {
    loadFromGMIfNeeded();
    let artworkCount = 0;
    let novelCount = 0;
    let mangaChapterCount = 0;
    const artists = new Set();
    for (const entry of state.entries.values()) {
        if (entry.userId) artists.add(entry.userId);
        if (entry.kind === "artwork") artworkCount++;
        else if (entry.kind === "novel") novelCount++;
        else if (entry.kind === "manga-chapter") mangaChapterCount++;
    }
    return {
        entryCount: state.entries.size,
        artistCount: artists.size,
        artworkCount,
        novelCount,
        mangaChapterCount,
        lastSyncAt: state.lastSyncAt,
        pixivFolderId: state.pixivFolderId,
    };
}

export function clearCache() {
    try {
        clearEagleIndexCache();
    } catch (e) {
        warn("saved-lookup: 清除 GM 失败:", e);
    }
    resetState();
    state.loaded = true;
    window.__pixiv2eagle_eagleIndexLoadingPromise = null;
}

export function detectFolderMismatch() {
    loadFromGMIfNeeded();
    const current = getFolderId() || "";
    if (!current) return null;

    if (state.entries.size === 0) {
        if (state.pixivFolderId !== current) {
            state.pixivFolderId = current;
            persistToGM();
        }
        return null;
    }

    if (state.pixivFolderId && state.pixivFolderId !== current) {
        return {
            cachedFolderId: state.pixivFolderId,
            currentFolderId: current,
            entryCount: state.entries.size,
        };
    }
    return null;
}
