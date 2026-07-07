"use strict";

import { getCacheStats, clearCache } from "../../../shared/marking/saved-lookup.js";
import { invalidateEagleIndex } from "../../../eagle/index-cache.js";
import { syncNow } from "../../../eagle/sync.js";
import { showToast } from "../../toast.js";
import { pushAction } from "../action-log.js";
import { createPixivStyledButton } from "../../button.js";

function formatTime(ts) {
    if (!ts) return "从未";
    return new Date(ts).toLocaleString();
}

export function mountSavedCacheSection(container) {
    const fieldset = document.createElement("fieldset");
    const legend = document.createElement("legend");
    legend.textContent = "已保存缓存";
    fieldset.appendChild(legend);

    const stats = document.createElement("div");
    stats.className = "p2e-status-bar";
    fieldset.appendChild(stats);

    const syncBtn = createPixivStyledButton("立即同步", "primary");
    syncBtn.type = "button";
    const clearBtn = createPixivStyledButton("清除缓存");
    clearBtn.type = "button";

    const stack = document.createElement("div");
    stack.className = "p2e-control-panel__action-stack";
    stack.appendChild(syncBtn);
    stack.appendChild(clearBtn);
    fieldset.appendChild(stack);

    const hint = document.createElement("div");
    hint.className = "p2e-inline-error";
    hint.style.visibility = "hidden";
    fieldset.appendChild(hint);

    function renderStats() {
        const s = getCacheStats();
        stats.textContent = "";
        const rows = [
            ["总条目", String(s.entryCount)],
            ["插画", String(s.artworkCount)],
            ["小说", String(s.novelCount)],
            ["漫画章节", String(s.mangaChapterCount)],
            ["画师数", String(s.artistCount)],
            ["上次同步", formatTime(s.lastSyncAt)],
            ["根文件夹", s.pixivFolderId || "未设置"],
        ];
        for (const [label, value] of rows) {
            const l = document.createElement("div");
            l.className = "p2e-status-bar__label";
            l.textContent = label;
            const v = document.createElement("div");
            v.className = "p2e-status-bar__value";
            v.textContent = value;
            stats.appendChild(l);
            stats.appendChild(v);
        }
    }

    syncBtn.addEventListener("click", async () => {
        syncBtn.disabled = true;
        syncBtn.textContent = "同步中…";
        pushAction({ label: "立即同步", status: "pending" });
        const result = await syncNow();
        syncBtn.disabled = false;
        syncBtn.textContent = "立即同步";
        if (result.ok) {
            pushAction({ label: "立即同步", status: "success", message: `新增 ${result.added}，移除 ${result.removed}` });
        } else {
            pushAction({ label: "立即同步", status: "error", message: result.error || "失败" });
        }
        renderStats();
    });

    clearBtn.addEventListener("click", () => {
        if (!window.confirm("确定清除本地已保存标记缓存？清除后需重新积累或立即同步。")) return;
        clearCache();
        invalidateEagleIndex();
        showToast("已清除本地标记缓存", "success");
        pushAction({ label: "清除缓存", status: "success" });
        renderStats();
    });

    container.appendChild(fieldset);

    return {
        render(snapshot) {
            const connected = snapshot.eagle.connected;
            syncBtn.disabled = !connected;
            syncBtn.style.opacity = connected ? "1" : "0.5";
            syncBtn.title = connected ? "以 Eagle 为准补全并清理本地缓存" : "Eagle 未连接";
            hint.style.visibility = connected ? "hidden" : "visible";
            hint.textContent = connected ? "" : "Eagle 未连接，无法立即同步";
            renderStats();
        },
    };
}
