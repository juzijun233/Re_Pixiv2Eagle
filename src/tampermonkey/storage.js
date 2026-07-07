"use strict";

export const STORAGE_KEYS = Object.freeze({
    EAGLE_INDEX: "eagleIndex",
});

/**
 * @typedef {{
 *   version: 2,
 *   pixivFolderId: string,
 *   lastSyncAt: number | null,
 *   index: Record<string, { id: string, pids: string[] }>,
 *   entries: import("../shared/marking/saved-lookup.js").SavedEntry[],
 * }} EagleIndexCacheV2
 */

/** @returns {EagleIndexCacheV2 | object | null} Legacy v1 payload may lack `version`. */
export function loadEagleIndexCache() {
    return GM_getValue(STORAGE_KEYS.EAGLE_INDEX, null);
}

/** @param {EagleIndexCacheV2} payload */
export function saveEagleIndexCache(payload) {
    GM_setValue(STORAGE_KEYS.EAGLE_INDEX, payload);
}

export function clearEagleIndexCache() {
    GM_setValue(STORAGE_KEYS.EAGLE_INDEX, null);
}
