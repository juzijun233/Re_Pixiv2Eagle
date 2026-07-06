"use strict";

import { getFolderId } from "../tampermonkey/setting.js";
import { dbg, err } from "../tampermonkey/logger.js";
import { showMessage } from "../ui/toast.js";
import { checkEagle } from "../eagle/client.js";
import { saveArtworkById } from "../artwork/save.js";
import { getArtworkDetails } from "../artwork/details.js";
import { createBatchSaveProgressTask } from "../ui/save-progress/index.js";
import {
    waitForListContainer,
    resolveThumbnailAnchor,
} from "../shared/marking/resolve-thumbnail-anchor.js";
import { buildArtistListSavedContext, isArtworkSavedInContext } from "./saved-context.js";
import {
    BATCH_ENTRY_BUTTON_ID,
    injectArtistIllustPageBatchButton,
    setBatchEntryButtonLabel,
    createArtistIllustPageBatchToolbar,
    removeArtistIllustPageBatchToolbar,
} from "./ui-batch-toolbar.js";

const OBSERVER_LIFETIME_MS = 5 * 60 * 1000;

/** 每次 enter/exit 递增，用于丢弃 stale 的异步 enter */
let enterGeneration = 0;

const state = {
    active: false,
    entering: false,
    saving: false,
    /** @type {import('./saved-context.js').ArtistListSavedContext|null} */
    savedContext: null,
    /** @type {Array<{ pid: string, li: HTMLElement, anchor: HTMLElement, domIndex: number }>} */
    scannedItems: [],
    /** @type {Map<string, HTMLInputElement>} */
    checkboxes: new Map(),
    /** @type {HTMLElement|null} */
    listContainer: null,
    /** @type {MutationObserver|null} */
    observer: null,
    /** @type {ReturnType<typeof setTimeout>|null} */
    observerTimeout: null,
};

function getArtistIdFromPath() {
    const m = location.pathname.match(/^\/users?\/(\d+)/);
    return m ? m[1] : null;
}

function isIllustListPage(path = location.pathname) {
    return /^\/users?\/\d+\/illustrations/.test(path) && !path.includes("/manga");
}

// ---- 列表扫描与已保存过滤 ----

async function scanArtistIllustListItems() {
    const listContainer = await waitForListContainer({ isSeriesPage: false, timeout: 5000 });
    state.listContainer = listContainer;
    if (!listContainer) return [];

    const lis = listContainer.querySelectorAll("li");
    const items = [];
    let domIndex = 0;
    for (const li of lis) {
        const link = li.querySelector('a[href*="/artworks/"]');
        if (!link) continue;
        const m = link.getAttribute("href").match(/\/artworks\/(\d+)/);
        if (!m) continue;
        const anchor = resolveThumbnailAnchor(li, { context: "list" });
        if (!anchor) continue;
        items.push({ pid: m[1], li, anchor, domIndex: domIndex++ });
    }
    dbg("batch-save-page: 扫描到列表项", items.length, "个");
    return items;
}

/** @param {{ pid: string, anchor: HTMLElement }} item */
function isIllustSavedOnArtistList(item) {
    const { pid, anchor } = item;
    if (anchor.dataset.eagleSaved === "1" || anchor.querySelector(".eagle-saved-badge")) return true;
    return isArtworkSavedInContext(pid, state.savedContext);
}

// ---- 复选框 ----

/** @param {{ pid: string, li: HTMLElement }} item */
function injectBatchCheckbox(item) {
    const { li, pid } = item;
    if (state.checkboxes.has(pid)) return;
    if (li.querySelector(":scope > .p2e-batch-checkbox")) return;

    const cs = window.getComputedStyle(li);
    if (cs.position === "static") li.style.position = "relative";

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.className = "p2e-batch-checkbox";
    cb.checked = true;
    cb.dataset.pid = pid;
    cb.style.cssText =
        "position:absolute;top:8px;left:8px;width:20px;height:20px;z-index:2147483646;cursor:pointer;margin:0;";
    // 复选框挂在 li（<a> 的兄弟节点）上，点击不落在链接内，天然不触发跳转
    li.appendChild(cb);
    state.checkboxes.set(pid, cb);
}

function removeCheckboxForPid(pid) {
    const cb = state.checkboxes.get(pid);
    if (cb) cb.remove();
    state.checkboxes.delete(pid);
}

function collectSelectedPids() {
    const pids = [];
    for (const [pid, cb] of state.checkboxes) {
        if (cb.checked) pids.push(pid);
    }
    return pids;
}

function setAllCheckboxes(checked) {
    for (const cb of state.checkboxes.values()) cb.checked = checked;
}

function invertCheckboxes() {
    for (const cb of state.checkboxes.values()) cb.checked = !cb.checked;
}

// ---- 懒加载 observer ----

function syncBatchCheckboxesForList() {
    if (!state.listContainer || !state.active) return;
    const lis = state.listContainer.querySelectorAll("li");
    let domIndex = state.scannedItems.length;
    for (const li of lis) {
        const link = li.querySelector('a[href*="/artworks/"]');
        if (!link) continue;
        const m = link.getAttribute("href").match(/\/artworks\/(\d+)/);
        if (!m) continue;
        const pid = m[1];
        if (state.checkboxes.has(pid)) continue;
        const anchor = resolveThumbnailAnchor(li, { context: "list" });
        if (!anchor) continue;
        const item = { pid, li, anchor, domIndex: domIndex++ };
        if (isIllustSavedOnArtistList(item)) continue;
        state.scannedItems.push(item);
        injectBatchCheckbox(item);
    }
}

function startBatchObserver() {
    stopBatchObserver();
    const target = state.listContainer || document.body;
    state.observer = new MutationObserver((mutations) => {
        let added = false;
        for (const mut of mutations) {
            if (mut.addedNodes.length > 0) {
                added = true;
                break;
            }
        }
        if (added) syncBatchCheckboxesForList();
    });
    state.observer.observe(target, { childList: true, subtree: true });
    state.observerTimeout = setTimeout(() => {
        stopBatchObserver();
        if (state.active) {
            dbg("batch-save-page: observer 5min 生命周期到，重新挂载");
            startBatchObserver();
        }
    }, OBSERVER_LIFETIME_MS);
}

function stopBatchObserver() {
    if (state.observer) {
        state.observer.disconnect();
        state.observer = null;
    }
    if (state.observerTimeout) {
        clearTimeout(state.observerTimeout);
        state.observerTimeout = null;
    }
}

// ---- 工具栏挂载 ----

function mountToolbar() {
    const toolbar = createArtistIllustPageBatchToolbar({
        onSelectAll: () => setAllCheckboxes(true),
        onSelectNone: () => setAllCheckboxes(false),
        onInvert: () => invertCheckboxes(),
        onExecute: () => executeBatchSaveSelectedIllustrations(),
    });
    const btn = document.getElementById(BATCH_ENTRY_BUTTON_ID);
    if (btn && btn.parentElement) btn.parentElement.appendChild(toolbar);
    else document.body.appendChild(toolbar);
}

// ---- 排序（uploadDate 升序 + DOM 反转降级）----

async function sortIllustPidsByUploadDateAsc(pids) {
    const domIndexMap = new Map();
    state.scannedItems.forEach((it) => domIndexMap.set(it.pid, it.domIndex));

    const withKey = [];
    for (const pid of pids) {
        let sortKey = null;
        try {
            const details = await getArtworkDetails(pid);
            const ts = Date.parse(details.uploadDate);
            sortKey = Number.isNaN(ts) ? null : ts;
        } catch (e) {
            dbg("sortIllustPidsByUploadDateAsc: 取详情失败，降级 DOM 序 pid=", pid, e && e.message);
        }
        const domIndex = domIndexMap.get(pid) ?? 0;
        withKey.push({ pid, sortKey: sortKey ?? Number.MAX_SAFE_INTEGER - domIndex });
    }

    withKey.sort((a, b) => a.sortKey - b.sortKey);
    return withKey.map((x) => x.pid);
}

// ---- 单件失败三选一对话框 ----

/**
 * @param {{ pid: string, message: string }} info
 * @returns {Promise<'retry'|'abort'|'skip'>}
 */
function showBatchItemFailureDialog({ pid, message }) {
    return new Promise((resolve) => {
        const overlay = document.createElement("div");
        overlay.style.cssText =
            "position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;";
        const box = document.createElement("div");
        box.style.cssText =
            "background:#fff;color:#333;max-width:420px;width:90%;padding:20px;border-radius:8px;font-size:14px;line-height:1.6;box-shadow:0 8px 24px rgba(0,0,0,0.3);";
        const text = document.createElement("div");
        text.style.marginBottom = "16px";
        text.textContent = `作品 ${pid} 保存失败：${message}`;
        const btnRow = document.createElement("div");
        btnRow.style.cssText = "display:flex;gap:8px;justify-content:flex-end;";

        const mk = (label, value, bg) => {
            const b = document.createElement("button");
            b.textContent = label;
            b.style.cssText = `padding:6px 14px;border:none;border-radius:4px;cursor:pointer;color:#fff;background:${bg};`;
            b.onclick = () => {
                overlay.remove();
                resolve(value);
            };
            return b;
        };

        btnRow.appendChild(mk("重试", "retry", "#0096fa"));
        btnRow.appendChild(mk("继续", "skip", "#888"));
        btnRow.appendChild(mk("中止", "abort", "#e4405f"));

        box.appendChild(text);
        box.appendChild(btnRow);
        overlay.appendChild(box);
        document.body.appendChild(overlay);
    });
}

// ---- 批量保存主流程 ----

async function executeBatchSaveSelectedIllustrations() {
    if (state.saving) return;

    const selected = collectSelectedPids();
    if (selected.length === 0) {
        showMessage("请先选择要保存的作品", true);
        return;
    }

    const eagleStatus = await checkEagle();
    if (!eagleStatus.running) {
        showMessage("Eagle 未启动，请先启动 Eagle 应用！", true);
        return;
    }
    if (!getFolderId()) {
        showMessage("未设置 Pixiv 文件夹 ID", true);
        return;
    }

    state.saving = true;
    const orderedPids = await sortIllustPidsByUploadDateAsc(selected);
    dbg("批量保存最终顺序（旧→新）:", orderedPids.join(","));

    const total = orderedPids.length;
    const task = createBatchSaveProgressTask({
        totalWorks: total,
        headerText: "批量保存",
        initialTitle: "准备中…",
    });

    try {
        for (let idx = 0; idx < total; idx++) {
            if (task.signal.aborted) {
                const e = new Error("已取消");
                e.name = "AbortError";
                throw e;
            }

            const pid = orderedPids[idx];
            task.reportWorkIndex({ current: idx + 1, total });
            task.beginWork({ artworkId: pid, title: `作品 ${pid}`, pageCount: 1 });

            let done = false;
            while (!done) {
                if (task.signal.aborted) {
                    const e = new Error("已取消");
                    e.name = "AbortError";
                    throw e;
                }
                try {
                    await saveArtworkById(pid, { task, signal: task.signal, openSavedArtwork: false });
                    removeCheckboxForPid(pid);
                    done = true;
                } catch (error) {
                    if (error.name === "AbortError") throw error;
                    err("批量保存单件失败 pid=", pid, error);
                    const choice = await showBatchItemFailureDialog({
                        pid,
                        message: error.message || "保存失败",
                    });
                    if (choice === "retry") continue;
                    if (choice === "abort") {
                        task.abort();
                        return;
                    }
                    done = true; // skip
                }
            }
        }
        task.complete();
        dbg("批量保存全部完成，共", total, "件");
    } catch (error) {
        if (error.name === "AbortError") {
            if (!task.signal.aborted) task.abort();
        } else {
            err("批量保存流程异常:", error);
            task.fail(`批量保存失败: ${error.message || error}`.replace(/\n/g, " "));
        }
    } finally {
        state.saving = false;
        exitArtistIllustListBatchMode();
    }
}

// ---- 模式开关 ----

async function enterArtistIllustListBatchMode() {
    if (state.active || state.entering) return;

    const gen = ++enterGeneration;
    state.entering = true;

    try {
        state.active = true;
        document.body.dataset.p2eBatchMode = "illust-page";

        const artistId = getArtistIdFromPath();
        state.savedContext = artistId ? await buildArtistListSavedContext(artistId) : null;
        if (gen !== enterGeneration) return;

        const items = await scanArtistIllustListItems();
        if (gen !== enterGeneration) return;

        state.scannedItems = [];
        for (const item of items) {
            if (isIllustSavedOnArtistList(item)) continue;
            state.scannedItems.push(item);
            injectBatchCheckbox(item);
        }
        dbg("批量模式已开启，未保存可选项:", state.scannedItems.length);

        if (gen !== enterGeneration) return;

        mountToolbar();
        startBatchObserver();
        setBatchEntryButtonLabel("退出批量保存");
    } catch (e) {
        err("enterArtistIllustListBatchMode 失败:", e);
        if (gen === enterGeneration) {
            exitArtistIllustListBatchMode();
        }
    } finally {
        if (gen === enterGeneration) {
            state.entering = false;
        }
    }
}

function exitArtistIllustListBatchMode() {
    enterGeneration++;
    state.entering = false;
    stopBatchObserver();
    removeArtistIllustPageBatchToolbar();
    for (const cb of document.querySelectorAll(".p2e-batch-checkbox")) cb.remove();
    state.checkboxes.clear();
    state.scannedItems = [];
    state.savedContext = null;
    state.listContainer = null;
    delete document.body.dataset.p2eBatchMode;
    state.active = false;
    setBatchEntryButtonLabel("批量保存");
}

function toggleBatchMode() {
    if (state.saving || state.entering) return; // 保存/进入进行中不允许经入口按钮切换
    if (state.active) exitArtistIllustListBatchMode();
    else enterArtistIllustListBatchMode();
}

/**
 * Monitor 入口：仅在画师插画列表页注入批量保存入口按钮。
 * 幂等（按钮 ID 去重）；离开插画页时若仍处批量模式则清理。
 */
export async function bindArtistIllustListPageBatchSave() {
    if (!isIllustListPage()) {
        if (state.active) exitArtistIllustListBatchMode();
        return;
    }
    if (state.active) return; // 已开启模式时不重复注入
    await injectArtistIllustPageBatchButton(toggleBatchMode);
}
