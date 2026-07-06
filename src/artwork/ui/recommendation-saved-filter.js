"use strict";

import { getFilterRecSavedMode } from "../../tampermonkey/setting.js";
import {
    ensureBlurOverlay,
    removeBlurOverlay,
} from "../../shared/marking/rec-blur-overlay.js";

const SAVED_BLUR_OVERLAY_CLASS = "p2e-rec-saved-blur-overlay";

/**
 * @param {HTMLElement} li
 */
export function clearSavedFilterState(li) {
    if (!li || li.nodeType !== 1) return;
    const authorOwnsDisplay =
        li.dataset.p2eAuthorFiltered === "1" &&
        li.dataset.p2eAuthorFilterMode === "remove";
    if (!authorOwnsDisplay) {
        li.style.display = "";
    }
    if (li.dataset.p2eSavedFilterPositionSet === "1") {
        li.style.position = "";
        delete li.dataset.p2eSavedFilterPositionSet;
    }
    removeBlurOverlay(li, SAVED_BLUR_OVERLAY_CLASS);
    delete li.dataset.p2eSavedFiltered;
    delete li.dataset.p2eSavedFilterMode;
}

/**
 * @param {HTMLElement} li
 */
function applyHideMode(li) {
    li.style.display = "none";
    li.dataset.p2eSavedFiltered = "1";
    li.dataset.p2eSavedFilterMode = "hide";
}

/**
 * @param {HTMLElement} li
 */
function applyBlurMode(li) {
    ensureBlurOverlay(li, {
        overlayClass: SAVED_BLUR_OVERLAY_CLASS,
        positionDatasetKey: "p2eSavedFilterPositionSet",
    });
    li.dataset.p2eSavedFiltered = "1";
    li.dataset.p2eSavedFilterMode = "blur";
}

/**
 * @param {HTMLElement} li
 * @param {{ isSaved: boolean }} options
 */
export function applySavedFilter(li, { isSaved }) {
    if (!isSaved) {
        clearSavedFilterState(li);
        return;
    }

    const mode = getFilterRecSavedMode();

    if (mode === "mark") {
        clearSavedFilterState(li);
        return;
    }

    if (
        li.dataset.p2eSavedFiltered === "1" &&
        li.dataset.p2eSavedFilterMode === mode
    ) {
        // dataset 与 DOM 可能不同步：clearFilterState 会清空 display 但不改 saved dataset
        if (mode === "hide" && li.style.display !== "none") {
            applyHideMode(li);
        } else if (mode === "blur" && !li.querySelector(`.${SAVED_BLUR_OVERLAY_CLASS}`)) {
            applyBlurMode(li);
        }
        return;
    }

    clearSavedFilterState(li);

    if (mode === "hide") {
        applyHideMode(li);
    } else if (mode === "blur") {
        applyBlurMode(li);
    }
}

/**
 * @param {HTMLElement | null | undefined} zoneRoot
 * @param {(li: HTMLElement) => void} processLiRescan
 */
export function rescanZoneSavedFilter(zoneRoot, processLiRescan) {
    if (!zoneRoot) return;
    zoneRoot.querySelectorAll("li").forEach(clearSavedFilterState);
    zoneRoot.querySelectorAll("li").forEach((li) => {
        delete li.dataset.eagleChecked;
        li.querySelector(".eagle-saved-badge")?.remove();
    });
    zoneRoot.querySelectorAll("li").forEach((li) => processLiRescan(li));
}
