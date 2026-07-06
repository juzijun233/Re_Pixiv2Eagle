"use strict";

import { getFolderId } from "../tampermonkey/setting.js";
import { findArtistFolder } from "../eagle/artist.js";
import { getAllEagleItemsInFolder } from "../eagle/items.js";

/**
 * @typedef {{
 *   artistFolder: object,
 *   urlSet: Set<string>,
 *   folderDescSet: Set<string>,
 *   folderDescMap: Record<string, string>,
 * }} ArtistListSavedContext
 */

/**
 * 一次性构建画师列表页「已保存」判定上下文：
 * 拉取画师文件夹（含 illustrations/manga/novels 类型子文件夹）items，
 * 收集 item.url 集合与所有子文件夹 description（作品 pid）集合。
 * @param {string} artistId
 * @param {string} [pixivFolderId]
 * @returns {Promise<ArtistListSavedContext|null>} 未找到画师文件夹时返回 null
 */
export async function buildArtistListSavedContext(artistId, pixivFolderId = getFolderId()) {
    const artistFolder = await findArtistFolder(pixivFolderId, artistId);
    if (!artistFolder) return null;

    const items = await getAllEagleItemsInFolder(artistFolder.id);
    if (artistFolder.children) {
        const typeFolders = artistFolder.children.filter((c) =>
            ["illustrations", "manga", "novels"].includes(c.description)
        );
        for (const tf of typeFolders) {
            const typeItems = await getAllEagleItemsInFolder(tf.id);
            if (typeItems && typeItems.length) items.push(...typeItems);
        }
    }

    const urlSet = new Set((items || []).map((it) => it.url));
    const folderDescSet = new Set();
    /** @type {Record<string, string>} */
    const folderDescMap = {};
    (function collect(folder) {
        if (!folder || !folder.children) return;
        for (const child of folder.children) {
            const desc = (child.description || "").trim();
            if (desc) {
                folderDescSet.add(desc);
                folderDescMap[desc] = child.id;
            }
            if (child.children && child.children.length) collect(child);
        }
    })(artistFolder);

    return { artistFolder, urlSet, folderDescSet, folderDescMap };
}

/**
 * 判定某作品 pid 是否已保存（item.url 命中或存在 description === pid 的子文件夹）。
 * @param {string} pid
 * @param {ArtistListSavedContext|null} context
 * @returns {boolean}
 */
export function isArtworkSavedInContext(pid, context) {
    if (!context) return false;
    const url = `https://www.pixiv.net/artworks/${pid}`;
    return context.urlSet.has(url) || context.folderDescSet.has(String(pid));
}
