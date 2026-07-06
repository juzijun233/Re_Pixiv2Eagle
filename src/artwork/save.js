"use strict";

import {
    getFolderId,
    getCreateSubFolder,
    getSaveByType,
} from "../tampermonkey/setting.js";
import { err } from "../tampermonkey/logger.js";
import { showMessage } from "../ui/toast.js";
import { checkEagle } from "../eagle/client.js";
import { createEagleFolder, getSeriesFolder } from "../eagle/folder.js";
import { getArtistFolder } from "../eagle/artist.js";
import { getTypeFolderInfo, getOrCreateTypeFolder } from "../eagle/type-folder.js";
import { saveToEagleSequential, getAllEagleItemsInFolder } from "../eagle/items.js";
import { publishSaved } from "../shared/marking/saved-event-bus.js";
import { convertUgoiraToGifBlob, blobToDataURL } from "./ugoira/convert.js";
import { getArtworkId } from "./id.js";
import { getArtworkDetails } from "./details.js";
import { createSaveProgressTask } from "../ui/save-progress/index.js";
import { SAVE_STAGE } from "../ui/save-progress/types.js";

/**
 * 将 batch 进度任务适配为单作品保存所需的进度接口。
 * FETCHING/FOLDER/CONVERTING 阶段合并到同一 batch toast（不新增 toast）；
 * UPLOADING 阶段双轨进度转发到 batch task；complete/fail/abort 由 batch 循环统一控制，此处为 no-op。
 * @param {import('../ui/save-progress/index.js').createBatchSaveProgressTask extends (...a:any)=>infer R ? R : any} batchTask
 * @param {string} artworkId
 * @param {AbortSignal} signal
 */
function createBatchWorkProgressAdapter(batchTask, artworkId, signal) {
    return {
        signal: signal ?? batchTask.signal,
        reportStage(stage, { current, total } = {}) {
            if (stage === SAVE_STAGE.UPLOADING && total !== undefined) {
                batchTask.reportSubmitProgress({ current: current ?? 0, total });
                batchTask.reportEagleProgress({ current: 0, total });
            }
        },
        updateArtworkInfo({ title, pageCount }) {
            batchTask.beginWork({ artworkId, title, pageCount: pageCount ?? 1 });
        },
        reportFrameProgress() {},
        reportSubmitProgress(p) {
            batchTask.reportSubmitProgress(p);
        },
        reportEagleProgress(p) {
            batchTask.reportEagleProgress(p);
        },
        complete() {},
        fail() {},
        abort() {},
    };
}

/**
 * 按作品 ID 保存到 Eagle（单作品保存核心）。
 * @param {string} artworkId
 * @param {{ task?: object, signal?: AbortSignal, openSavedArtwork?: boolean }} [options]
 * @returns {Promise<{ folderId: string, itemId: string, pageCount: number }>}
 */
export async function saveArtworkById(artworkId, options = {}) {
    const { task: externalTask, signal: externalSignal, openSavedArtwork } = options;
    const isBatch = !!externalTask;

    const folderId = getFolderId();
    const folderInfo = folderId ? `Pixiv 文件夹 ID: ${folderId}` : "未设置 Pixiv 文件夹 ID";

    const progress = isBatch
        ? createBatchWorkProgressAdapter(externalTask, artworkId, externalSignal)
        : createSaveProgressTask({ artworkId, title: "加载中…", pageCount: 1 });

    const signal = externalSignal ?? externalTask?.signal ?? progress.signal;
    const shouldOpen = openSavedArtwork ?? !isBatch;

    try {
        progress.reportStage(SAVE_STAGE.FETCHING, { current: 0, total: 1 });

        const details = await getArtworkDetails(artworkId);
        progress.updateArtworkInfo({ title: details.illustTitle, pageCount: details.pageCount });
        progress.reportStage(SAVE_STAGE.FETCHING, { current: 1, total: 1 });

        progress.reportStage(SAVE_STAGE.FOLDER, { current: 0, total: 1 });

        const artistFolder = await getArtistFolder(folderId, details.userId, details.userName);
        let targetFolderId = artistFolder.id;
        let parentFolderObj = artistFolder;

        if (getSaveByType()) {
            const typeInfo = getTypeFolderInfo(details.illustType);
            const typeFolder = await getOrCreateTypeFolder(artistFolder, typeInfo);
            if (typeFolder) {
                targetFolderId = typeFolder.id;
                parentFolderObj = typeFolder;
            }
        }

        if (details.illustType === 1 && details.seriesNavData) {
            const seriesId = details.seriesNavData.seriesId;
            const seriesTitle = details.seriesNavData.title;
            const seriesFolder = await getSeriesFolder(parentFolderObj, details.userId, seriesId, seriesTitle);
            targetFolderId = seriesFolder.id;
        }

        if (
            details.illustType === 1 ||
            (getCreateSubFolder() === "multi-page" && details.pageCount > 1) ||
            getCreateSubFolder() === "always"
        ) {
            targetFolderId = await createEagleFolder(details.illustTitle, targetFolderId, artworkId);
        }

        progress.reportStage(SAVE_STAGE.FOLDER, { current: 1, total: 1 });

        let imageUrls = details.originalUrls;
        if (details.illustType === 2) {
            progress.reportStage(SAVE_STAGE.CONVERTING, { current: 0, total: 1 });
            const gifBlob = await convertUgoiraToGifBlob(artworkId, {
                signal,
                onFrameProgress: ({ current, total }) => {
                    progress.reportStage(SAVE_STAGE.CONVERTING, { current, total });
                    progress.reportFrameProgress({ current, total });
                },
            });
            progress.reportStage(SAVE_STAGE.CONVERTING, { current: 1, total: 1 });
            imageUrls = [await blobToDataURL(gifBlob)];
        }

        const pageTotal = imageUrls.length;

        let baselineCount = 0;
        if (pageTotal > 1) {
            const baselineItems = await getAllEagleItemsInFolder(targetFolderId);
            baselineCount = baselineItems.length;
        }

        progress.reportStage(SAVE_STAGE.UPLOADING, { current: 0, total: pageTotal });

        const { itemId } = await saveToEagleSequential(imageUrls, targetFolderId, details, artworkId, {
            signal,
            baselineCount,
            onSubmitProgress: ({ current, total }) => {
                progress.reportSubmitProgress({ current, total });
            },
            onEagleProgress: ({ current, total }) => {
                progress.reportEagleProgress({ current, total });
            },
        });

        const kind = details.illustType === 1 && details.seriesNavData ? "manga-chapter" : "artwork";
        publishSaved({
            kind,
            id: artworkId,
            userId: details.userId,
            folderId: targetFolderId,
            itemId,
            savedAt: Date.now(),
        });

        if (!isBatch) {
            progress.complete({ folderId: targetFolderId, itemId, pageCount: pageTotal, openSavedArtwork: shouldOpen });
        }

        return { folderId: targetFolderId, itemId, pageCount: pageTotal };
    } catch (error) {
        err(error);
        if (error.name === "AbortError") {
            if (!isBatch && !progress.signal.aborted) progress.abort();
            throw error;
        }
        if (!isBatch) {
            const msg = error.message || "保存失败";
            progress.fail(`${folderInfo}\n${msg}`.replace(/\n/g, " "));
        }
        throw error;
    }
}

// 保存当前作品到 Eagle（详情页薄包装：前置校验 + 打开已保存作品）
export async function saveCurrentArtwork() {
    const folderId = getFolderId();
    const folderInfo = folderId ? `Pixiv 文件夹 ID: ${folderId}` : "未设置 Pixiv 文件夹 ID";

    const eagleStatus = await checkEagle();
    if (!eagleStatus.running) {
        showMessage(`${folderInfo}\nEagle 未启动，请先启动 Eagle 应用！`, true);
        return;
    }

    const artworkId = getArtworkId();
    if (!artworkId) {
        showMessage("无法获取作品 ID", true);
        return;
    }

    try {
        await saveArtworkById(artworkId, { openSavedArtwork: true });
    } catch (error) {
        // 错误已由 saveArtworkById 内部经 progress.fail 呈现，此处静默避免未捕获 promise
    }
}
