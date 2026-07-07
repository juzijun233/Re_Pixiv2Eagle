"use strict";

import { getFolderId } from "../tampermonkey/setting.js";
import { dbg, err } from "../tampermonkey/logger.js";
import { gmFetch } from "../tampermonkey/request.js";
import { checkEagle } from "./client.js";
import { buildArtistIndexFromApi } from "./index-cache.js";
import {
    loadFromGMIfNeeded,
    getAllEntries,
    getSavedEntry,
    upsertEntry,
    removeEntry,
    rebuildIndexFromEntries,
    markSynced,
    persistToGM,
} from "../shared/marking/saved-lookup.js";
import { showToast } from "../ui/toast.js";

const SYNC_LOG_PREFIX = "[saved-cache][sync]";

/**
 * @param {Array<{ kind: string, userId?: string }>} entries
 * @returns {{ entryCount: number, artwork: number, novel: number, manga: number, artistCount: number }}
 */
function summarizeCacheEntries(entries) {
    let artwork = 0;
    let novel = 0;
    let manga = 0;
    const artistSet = new Set();
    for (const entry of entries) {
        if (entry.kind === "artwork") artwork++;
        else if (entry.kind === "novel") novel++;
        else if (entry.kind === "manga" || entry.kind === "manga-chapter") manga++;
        if (entry.userId) artistSet.add(entry.userId);
    }
    return {
        entryCount: entries.length,
        artwork,
        novel,
        manga,
        artistCount: artistSet.size,
    };
}

/**
 * @param {Array<{ userId: string }>} artworkEntries
 * @param {Array<{ kind: "novel" | "manga-chapter", userId: string }>} nonArtworkEntries
 * @returns {Map<string, { artworkDerived: number, novelDerived: number, mangaDerived: number }>}
 */
function summarizeDerivedByArtist(artworkEntries, nonArtworkEntries) {
    /** @type {Map<string, { artworkDerived: number, novelDerived: number, mangaDerived: number }>} */
    const byArtist = new Map();
    const ensureArtist = (userId) => {
        if (!byArtist.has(userId)) byArtist.set(userId, { artworkDerived: 0, novelDerived: 0, mangaDerived: 0 });
        return byArtist.get(userId);
    };

    for (const entry of artworkEntries) {
        const summary = ensureArtist(entry.userId);
        summary.artworkDerived++;
    }
    for (const entry of nonArtworkEntries) {
        const summary = ensureArtist(entry.userId);
        if (entry.kind === "novel") summary.novelDerived++;
        else if (entry.kind === "manga-chapter") summary.mangaDerived++;
    }
    return byArtist;
}

/**
 * 从 API 画师索引 Map 派生 artwork 条目（spec §8.4 步骤 2；仅 artwork，见设计决策 3）。
 * @param {Map<string, { id: string, pids: Set<string> }>} apiMap
 * @returns {Array<{ userId: string, pid: string, folderId: string }>}
 */
export function deriveArtworkEntriesFromIndex(apiMap) {
    const out = [];
    for (const [userId, data] of apiMap) {
        for (const pid of data.pids) {
            out.push({ userId, pid, folderId: data.id });
        }
    }
    return out;
}

/**
 * 从 Eagle 文件夹树派生 novel / manga-chapter 条目（用于立即同步补全非 artwork）。
 * @param {string} pixivFolderId
 * @returns {Promise<Array<{ kind: "novel" | "manga-chapter", id: string, userId: string, folderId: string }>>}
 */
async function deriveNonArtworkEntriesFromFolders(pixivFolderId) {
    const out = [];
    if (!pixivFolderId) return out;

    const folderList = await gmFetch("http://localhost:41595/api/folder/list");
    if (!folderList.status || !Array.isArray(folderList.data)) return out;

    const findFolder = (folders, id) => {
        for (const f of folders) {
            if (f.id === id) return f;
            if (f.children && f.children.length > 0) {
                const found = findFolder(f.children, id);
                if (found) return found;
            }
        }
        return null;
    };

    const isMangaSeriesUrl = (text) => /^https?:\/\/www\.pixiv\.net\/user\/\d+\/series\/\d+\/?$/.test(text);
    const isNovelSeriesUrl = (text) => /^https?:\/\/www\.pixiv\.net\/novel\/series\/\d+\/?$/.test(text);
    const root = findFolder(folderList.data, pixivFolderId);
    if (!root || !root.children) return out;

    const getFolderItems = async (folderId) => {
        const params = new URLSearchParams({ folders: folderId, limit: "20", offset: "0" });
        const data = await gmFetch(`http://localhost:41595/api/item/list?${params.toString()}`);
        if (!data || !data.status) return [];
        if (Array.isArray(data.data)) return data.data;
        if (Array.isArray(data.data?.items)) return data.data.items;
        return [];
    };

    const inferRootNumericFolderKind = async (folderId) => {
        const items = await getFolderItems(folderId);
        for (const item of items) {
            const pageUrl = String(item?.url || item?.website || "").trim();
            if (/^https?:\/\/www\.pixiv\.net\/novel\/show\.php\?id=\d+/.test(pageUrl)) return "novel";
            if (/^https?:\/\/www\.pixiv\.net\/artworks\/\d+/.test(pageUrl)) return "artwork";
        }
        return "unknown";
    };

    for (const artistFolder of root.children) {
        const desc = (artistFolder.description || "").trim();
        const match = desc.match(/pid\s*=\s*(\d+)/);
        if (!match) continue;
        const userId = match[1];

        const walk = async (nodes, branchKind = "artwork", depth = 0) => {
            for (const node of nodes || []) {
                const nodeDesc = (node.description || "").trim();
                let nextBranchKind = branchKind;
                if (nodeDesc === "novels" || isNovelSeriesUrl(nodeDesc)) nextBranchKind = "novel";
                else if (nodeDesc === "manga" || isMangaSeriesUrl(nodeDesc)) nextBranchKind = "manga-chapter";
                else if (nodeDesc === "illustrations") nextBranchKind = "artwork";

                if (nodeDesc && /^\d+$/.test(nodeDesc) && nextBranchKind !== "artwork") {
                    out.push({
                        kind: nextBranchKind,
                        id: nodeDesc,
                        userId,
                        folderId: node.id,
                    });
                } else if (nodeDesc && /^\d+$/.test(nodeDesc) && nextBranchKind === "artwork" && depth === 0) {
                    // saveByType 关闭时，独立小说章节可能直接在画师根下（无 novels 类型目录）。
                    const inferredKind = await inferRootNumericFolderKind(node.id);
                    if (inferredKind === "novel") {
                        out.push({
                            kind: "novel",
                            id: nodeDesc,
                            userId,
                            folderId: node.id,
                        });
                    }
                }
                if (node.children && node.children.length > 0) {
                    await walk(node.children, nextBranchKind, depth + 1);
                }
            }
        };

        await walk(artistFolder.children, "artwork");
    }

    return out;
}

/**
 * 立即同步（补全 + 清理，单一动作）。前置：Eagle 在线 + 已设根文件夹。
 * @returns {Promise<{ ok: boolean, added?: number, removed?: number, error?: string }>}
 */
export async function syncNow() {
    const status = await checkEagle();
    if (!status.running) {
        showToast("Eagle 未连接，无法立即同步", "warning");
        return { ok: false, error: "offline" };
    }

    const pixivFolderId = getFolderId();
    if (!pixivFolderId) {
        showToast("未设置 Pixiv 文件夹 ID", "warning");
        return { ok: false, error: "no-folder" };
    }

    loadFromGMIfNeeded();
    const preSyncSnapshot = summarizeCacheEntries(getAllEntries());
    dbg(
        `${SYNC_LOG_PREFIX} pre-sync snapshot entryCount=${preSyncSnapshot.entryCount} artwork=${preSyncSnapshot.artwork} novel=${preSyncSnapshot.novel} manga=${preSyncSnapshot.manga} artistCount=${preSyncSnapshot.artistCount}`
    );

    let apiMap;
    try {
        apiMap = await buildArtistIndexFromApi(pixivFolderId);
    } catch (e) {
        err("立即同步：构建 API 索引失败:", e);
        const msg = e && e.message ? e.message : String(e);
        showToast(`立即同步失败: ${msg}`, "error");
        return { ok: false, error: msg };
    }

    const apiEntries = deriveArtworkEntriesFromIndex(apiMap);
    const apiKeys = new Set(apiEntries.map((e) => `${e.userId}:${e.pid}`));
    let nonArtworkEntries = [];
    try {
        nonArtworkEntries = await deriveNonArtworkEntriesFromFolders(pixivFolderId);
    } catch (e) {
        err("立即同步：派生 novel/manga 条目失败:", e);
    }
    const derivedByArtist = summarizeDerivedByArtist(apiEntries, nonArtworkEntries);
    dbg(
        `${SYNC_LOG_PREFIX} derived totals artworkDerived=${apiEntries.length} novelDerived=${nonArtworkEntries.filter((entry) => entry.kind === "novel").length} mangaDerived=${nonArtworkEntries.filter((entry) => entry.kind === "manga-chapter").length}`
    );
    for (const [userId, summary] of derivedByArtist) {
        dbg(
            `${SYNC_LOG_PREFIX} artist userId=${userId} artworkDerived=${summary.artworkDerived} novelDerived=${summary.novelDerived} mangaDerived=${summary.mangaDerived}`
        );
    }

    // 补全：API 中不存在于本地的 artwork 条目
    let added = 0;
    for (const e of apiEntries) {
        if (!getSavedEntry("artwork", e.pid)) added++;
        upsertEntry({
            kind: "artwork",
            id: e.pid,
            userId: e.userId,
            folderId: e.folderId,
            savedAt: Date.now(),
        });
    }
    for (const e of nonArtworkEntries) {
        if (!getSavedEntry(e.kind, e.id)) added++;
        upsertEntry({
            kind: e.kind,
            id: e.id,
            userId: e.userId,
            folderId: e.folderId,
            savedAt: Date.now(),
        });
    }

    // 清理：本地 artwork 条目在 API 中不存在（可由 index 验证）→ 移除；novel/manga 不动
    let removed = 0;
    for (const entry of getAllEntries()) {
        if (entry.kind !== "artwork" || !entry.userId) continue;
        if (!apiKeys.has(`${entry.userId}:${entry.id}`)) {
            if (removeEntry("artwork", entry.id)) removed++;
        }
    }

    rebuildIndexFromEntries();
    markSynced(pixivFolderId);
    persistToGM();
    const postSyncSnapshot = summarizeCacheEntries(getAllEntries());

    dbg(
        `${SYNC_LOG_PREFIX} post-sync snapshot entryCount=${postSyncSnapshot.entryCount} artwork=${postSyncSnapshot.artwork} novel=${postSyncSnapshot.novel} manga=${postSyncSnapshot.manga} artistCount=${postSyncSnapshot.artistCount} added=${added} removed=${removed}`
    );
    dbg(`立即同步完成：新增 ${added}，移除 ${removed}`);
    showToast(`同步完成：新增 ${added}，移除 ${removed}`, "success");
    return { ok: true, added, removed };
}
