"use strict";

import { detectFolderMismatch, clearCache } from "../shared/marking/saved-lookup.js";
import { syncNow } from "../eagle/sync.js";
import { showToast } from "./toast.js";

// 同一会话仅提示一次，避免路由切换重复弹窗（spec §9.2）
let promptedThisSession = false;

/**
 * @param {{ cachedFolderId: string, currentFolderId: string, entryCount: number }} info
 */
function showFolderMismatchDialog(info) {
    const overlay = document.createElement("div");
    overlay.style.cssText =
        "position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;";

    const box = document.createElement("div");
    box.style.cssText =
        "background:#fff;color:#333;max-width:460px;width:90%;padding:20px;border-radius:8px;font-size:14px;line-height:1.6;box-shadow:0 8px 24px rgba(0,0,0,0.3);";

    const text = document.createElement("div");
    text.style.marginBottom = "16px";
    text.textContent =
        `检测到根文件夹变更：本地缓存对应 ${info.cachedFolderId}，` +
        `当前设置为 ${info.currentFolderId}（本地缓存 ${info.entryCount} 条已保存记录）。请选择处置方式：`;

    const btnRow = document.createElement("div");
    btnRow.style.cssText = "display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;";

    const close = () => overlay.remove();

    const mk = (label, bg, handler) => {
        const b = document.createElement("button");
        b.textContent = label;
        b.style.cssText = `padding:6px 14px;border:none;border-radius:4px;cursor:pointer;color:#fff;background:${bg};`;
        b.onclick = handler;
        return b;
    };

    // 选项 1：立即同步（以 Eagle 为准；成功后 pixivFolderId 由 syncNow.markSynced 更新）
    const syncBtn = mk("立即同步", "#0096fa", async () => {
        syncBtn.disabled = true;
        syncBtn.textContent = "同步中…";
        await syncNow();
        close();
    });
    // 选项 2：清除缓存
    const clearBtn = mk("清除缓存", "#e4405f", () => {
        clearCache();
        showToast("已清除本地标记缓存", "success");
        close();
    });
    // 选项 3：保留缓存（关闭即保留，spec §9.2）
    const keepBtn = mk("保留缓存", "#888", close);

    btnRow.appendChild(syncBtn);
    btnRow.appendChild(clearBtn);
    btnRow.appendChild(keepBtn);
    box.appendChild(text);
    box.appendChild(btnRow);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
}

/** bootstrap 调用：若检测到 mismatch 则弹窗（每会话一次）。 */
export function maybePromptFolderMismatch() {
    if (promptedThisSession) return;
    const info = detectFolderMismatch();
    if (!info) return;
    promptedThisSession = true;
    if (document.body) {
        showFolderMismatchDialog(info);
    } else {
        document.addEventListener("DOMContentLoaded", () => showFolderMismatchDialog(info), { once: true });
    }
}
