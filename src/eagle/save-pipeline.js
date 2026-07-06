"use strict";

function makeAbortError(message = "保存已取消") {
    const e = new Error(message);
    e.name = "AbortError";
    return e;
}

/**
 * 提交与落盘解耦：逐条 await submit（HTTP 成功后才 onSubmitProgress），
 * 全部提交成功后再单次落盘轮询。
 *
 * @param {{
 *   submits: Array<() => Promise<void>>,
 *   total?: number,
 *   baselineCount?: number,
 *   signal?: AbortSignal,
 *   onSubmitProgress?: (p: { current: number, total: number }) => void,
 *   onEagleProgress?: (p: { current: number, total: number }) => void,
 *   waitForPersistSingle?: (args: {
 *     signal?: AbortSignal,
 *     onProgress?: (current: number, total: number) => void,
 *   }) => Promise<{ itemId?: string } | void>,
 *   waitForPersistMulti?: (args: {
 *     baselineCount: number,
 *     target: number,
 *     signal?: AbortSignal,
 *     onProgress?: (persisted: number) => void,
 *   }) => Promise<void>,
 * }} params
 * @returns {Promise<{ submittedCount: number }>}
 */
export async function runSubmitThenPersistPipeline({
    submits,
    total,
    baselineCount = 0,
    signal,
    onSubmitProgress,
    onEagleProgress,
    waitForPersistSingle,
    waitForPersistMulti,
}) {
    const submittedTotal = total ?? submits.length;
    if (submittedTotal === 0 || submits.length === 0) {
        return { submittedCount: 0 };
    }

    let submittedCount = 0;

    for (let i = 0; i < submits.length; i++) {
        if (signal?.aborted) {
            throw makeAbortError();
        }

        await submits[i]();
        submittedCount += 1;
        onSubmitProgress?.({ current: submittedCount, total: submittedTotal });
    }

    if (submittedCount === 1 && waitForPersistSingle) {
        await waitForPersistSingle({
            signal,
            onProgress: (current, tot) => onEagleProgress?.({ current, total: tot }),
        });
    } else if (waitForPersistMulti) {
        await waitForPersistMulti({
            baselineCount,
            target: submittedCount,
            signal,
            onProgress: (persisted) =>
                onEagleProgress?.({
                    current: Math.min(persisted, submittedCount),
                    total: submittedCount,
                }),
        });
    }

    return { submittedCount };
}
