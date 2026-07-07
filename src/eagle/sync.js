"use strict";

import { getFolderId } from "../tampermonkey/setting.js";
import { dbg, err } from "../tampermonkey/logger.js";
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

    dbg(`立即同步完成：新增 ${added}，移除 ${removed}`);
    showToast(`同步完成：新增 ${added}，移除 ${removed}`, "success");
    return { ok: true, added, removed };
}
