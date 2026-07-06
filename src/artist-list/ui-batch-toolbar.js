"use strict";

import { createPixivStyledButton } from "../ui/button.js";
import { waitForElement } from "../ui/dom.js";
import {
    ARTIST_ILLUST_LIST_HEADER_SELECTOR,
    ARTIST_ILLUST_LIST_HEADER_PARTIAL_SELECTOR,
} from "../config/selectors/list.js";

export const BATCH_ENTRY_BUTTON_ID = "eagle-artist-illust-page-batch-btn";
export const BATCH_TOOLBAR_ID = "eagle-artist-illust-page-batch-toolbar";

/**
 * 在「作品」标题栏注入批量保存入口按钮（幂等，按 ID 去重）。
 * @param {() => void} onToggle 点击入口时的模式切换回调
 */
export async function injectArtistIllustPageBatchButton(onToggle) {
    if (document.getElementById(BATCH_ENTRY_BUTTON_ID)) return;

    let header = await waitForElement(ARTIST_ILLUST_LIST_HEADER_SELECTOR, 5000);
    if (!header) header = document.querySelector(ARTIST_ILLUST_LIST_HEADER_PARTIAL_SELECTOR);
    if (!header) return;

    // 等待期间可能已被并发注入
    if (document.getElementById(BATCH_ENTRY_BUTTON_ID)) return;

    const btn = createPixivStyledButton("批量保存");
    btn.id = BATCH_ENTRY_BUTTON_ID;
    btn.style.marginLeft = "10px";
    btn.onclick = () => onToggle();
    header.appendChild(btn);
}

/**
 * 更新入口按钮文案（进入/退出批量模式时切换）。
 * @param {string} text
 */
export function setBatchEntryButtonLabel(text) {
    const btn = document.getElementById(BATCH_ENTRY_BUTTON_ID);
    if (btn) btn.textContent = text;
}

/**
 * 创建批量工具栏（全选/全不选/反选/批量保存），幂等。
 * @param {{
 *   onSelectAll: () => void,
 *   onSelectNone: () => void,
 *   onInvert: () => void,
 *   onExecute: () => void,
 * }} handlers
 * @returns {HTMLElement}
 */
export function createArtistIllustPageBatchToolbar({ onSelectAll, onSelectNone, onInvert, onExecute }) {
    const existing = document.getElementById(BATCH_TOOLBAR_ID);
    if (existing) return existing;

    const toolbar = document.createElement("div");
    toolbar.id = BATCH_TOOLBAR_ID;
    toolbar.style.cssText = "display:flex;gap:8px;align-items:center;margin-left:10px;";

    const makeBtn = (label, handler, variant) => {
        const b = createPixivStyledButton(label, variant);
        b.style.height = "32px";
        b.style.padding = "0 12px";
        b.onclick = handler;
        return b;
    };

    toolbar.appendChild(makeBtn("全选", onSelectAll));
    toolbar.appendChild(makeBtn("全不选", onSelectNone));
    toolbar.appendChild(makeBtn("反选", onInvert));
    toolbar.appendChild(makeBtn("批量保存", onExecute, "primary"));
    return toolbar;
}

/** 移除批量工具栏（退出批量模式时调用）。 */
export function removeArtistIllustPageBatchToolbar() {
    const toolbar = document.getElementById(BATCH_TOOLBAR_ID);
    if (toolbar) toolbar.remove();
}
