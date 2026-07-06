# Re_Pixiv2Eagle

[English](./README.en.md) · [中文](./README.md)

A refactored fork of upstream [Pixiv2Eagle](https://github.com/nekoday/Pixiv2Eagle). This repo uses **esbuild** to bundle ES modules under `src/` into a single userscript `dist/RePixiv2Eagle.js` for Tampermonkey. Current version: **3.5.1** (see [`src/header.txt`](src/header.txt)).

> ✨ **New:** Convert Pixiv ugoira to GIF and save to Eagle.
>
> **Conversion may take some time; please wait patiently.**

A Tampermonkey userscript for saving Pixiv illustrations, manga, and novels to [Eagle](https://eagle.cool/) image management software.

## Quick Start

### Requirements

1. Install the [Tampermonkey](https://www.tampermonkey.net/) browser extension
2. Install [Eagle](https://eagle.cool/) and keep the client running (listens on `http://localhost:41595`)

### Install the Script

**Recommended:** Download `RePixiv2Eagle.js` from [GitHub Releases](https://github.com/juzijun233/Re_Pixiv2Eagle/releases), create a new Tampermonkey script, paste the full contents, or import the local file.

> If no Release is available yet, use the developer build steps below; prebuilt scripts will appear on the Releases page in future versions.

**Developer alternative:**

```bash
git clone https://github.com/juzijun233/Re_Pixiv2Eagle.git
cd Re_Pixiv2Eagle
npm install
npm run build
```

Import the generated `dist/RePixiv2Eagle.js` into Tampermonkey.

### First-Time Setup

1. Create a folder in Eagle for Pixiv content, right-click it, and choose **Copy Link**
2. On any Pixiv page, click the **⚙️** floating button, or choose **Open Control Panel** from the Tampermonkey menu
3. In the **Eagle & Folders** section, paste the folder link (e.g. `http://localhost:41595/folder?id=XXXXXX`) or enter the ID only (`XXXXXX`), then click **Apply**

## Features

### Illustrations / Ugoira

- One-click save from artwork pages with title, tags, and metadata preserved
- Multi-page illustration batch download
- Ugoira automatically converted to GIF before saving

### Manga

- Automatic manga series folder creation and matching
- Saved-state badges on series pages
- **Update chapter numbers** button on series pages to align Eagle filenames with Pixiv chapter order

### Novels

- One-click save from novel pages (`/novel/show.php`)
- TXT, Markdown, and EPUB export formats
- Saved-state badges on novel series pages

### Eagle Organization

- Automatic per-artist folders (customizable name template)
- Optional type subfolders (illustrations / manga / novels)
- Manga series folders and per-artwork subfolders
- Configurable Pixiv root folder ID

### Saved-State Awareness

- Optional auto-detection on detail pages
- Saved badges on recommendation areas, artist lists, and series pages
- Cross-page badge updates via event bus

### Experience

- In-page control panel (FAB ⚙️) for all settings
- Save progress toasts
- Light / dark / system UI theme
- Config import / export (Base64)

### Advanced

- Optional Pixiv upload date as Eagle addition date
- Optional artwork description in Eagle annotations
- Artist folder name template (`$uid` / `$name`)
- Eagle save poll timeout and debug mode

## Usage by Content Type

| Page | What you get |
| ------ | ---------------- |
| `/artworks/{id}` | **Save to Eagle** button; saved badges in the recommendation area |
| `/users/{id}/series/{id}` and other manga series pages | Series saved badges; **Update chapter numbers** for filename ordering |
| `/novel/show.php?id={id}` | Novel save button |
| `/novel/series/{id}` | Novel series saved badges |
| `/users/{id}`, `/user/{id}`, and artwork list pages | Artist list saved badges |

Daily use: ensure Eagle is running → open the relevant Pixiv page → click save or check saved badges.

## Control Panel

Open via the **⚙️** FAB on Pixiv pages or Tampermonkey menu **Open Control Panel**. Sections:

| Section | Main settings |
| --------- | ---------------- |
| **Eagle & Folders** | Pixiv root folder ID |
| **Illustration / Manga Save** | Upload date, save description, save by type, auto-check saved status, subfolder mode (Off / Multi-page only / Always) |
| **Novels** | Save path, format (TXT / MD / EPUB) |
| **Recommendation Area** | Same-author filter, saved-item display (mark / blur / hide) |
| **Appearance** | UI theme (light / dark / system) |
| **Advanced** | Artist folder name template, Eagle save poll timeout |
| **Config Backup** | Base64 export / import of all exportable settings |
| **Quick Actions** | Save current artwork, force refresh Eagle index |

The Tampermonkey menu keeps only three items: **Open Control Panel**, **Force Refresh Eagle Index**, and **Toggle Debug Mode**. All other settings live in the control panel.

## Artist Folders

- Each artist gets a dedicated folder under the configured Pixiv folder (or Eagle root)
- Folder description contains `pid = artistID` for identification
- Logic:
  1. Look for an existing artist folder under the Pixiv root folder
  2. Match by `pid = artistID` in the description
  3. Create one if missing, with artist name and ID in the description
  4. Save artworks into the artist folder (and optional type / series subfolders)

### Folder ID Rules

- **ID set:** Find or create artist folders under the specified Pixiv folder; error if that folder is missing
- **ID cleared:** Find or create artist folders under the Eagle root

### Artist Folder Name Template

- `$uid` = artist ID, `$name` = artist name
- Default template: `$name`; example: `$uid_$name`
- Configure in the control panel **Advanced** section

## Artwork Subfolders

- **Series folders:** Manga series folders under the artist directory; description stores the Pixiv series URL (e.g. `https://www.pixiv.net/user/{artistId}/series/{seriesId}`) for traceability
- **Artwork subfolders:** Named after the artwork title; description stores the **artwork ID** for saved-state detection and lookup
- Manga or Pixiv series artworks go through the series folder into an artwork subfolder
- Other illustrations: set subfolder mode in **Illustration / Manga Save**: **Off → Multi-page only → Always**
  - **Off:** Save directly into artist / series folders
  - **Multi-page only:** Create subfolders when `pageCount > 1`
  - **Always:** Subfolders for all illustrations, manga, and ugoira

## Differences from Pixiv2Eagle

This repo is a modular esbuild refactor of [nekoday/Pixiv2Eagle](https://github.com/nekoday/Pixiv2Eagle) with extended features.

**Added in this fork (not in upstream or not equivalently implemented):**

- Web control panel with FAB entry; config import / export
- Ugoira → GIF conversion
- Novel save (TXT / MD / EPUB) and novel series badges
- Manga series badges and chapter number updates
- Recommendation / artist list badges and filters
- Save-by-type folders, save progress toasts, UI themes
- Cross-page saved-state sync (BroadcastChannel + GM storage)

**Not inherited from upstream:**

- **Direct save** — not implemented in this fork
- **Strict sorting** — not implemented in this fork

## Precautions

1. Ensure Eagle is running before use
2. Configure the Pixiv folder ID correctly (or save under the root)
3. Large files, multi-page works, or ugoira conversion may take time; speed depends on your network and Pixiv servers
4. Auto-check saved status may affect performance when many items exist
5. Comply with Pixiv terms of use and copyright

## FAQ

### Q: Why doesn't the save button appear?

Ensure Eagle is running, the script is installed correctly, and the page has fully loaded. Try **Save current artwork** under control panel **Quick Actions**.

### Q: How do I get the folder ID?

In Eagle, right-click the target folder → **Copy Link**, then extract the ID (format: `http://localhost:41595/folder?id=XXXXXX`). Paste and apply in control panel **Eagle & Folders**.

### Q: Where do I change settings?

Almost everything is in the Pixiv control panel (FAB ⚙️). The Tampermonkey menu only offers: open control panel, force refresh index, and debug mode.

### Q: What if saving fails?

Check that Eagle is running, the network is OK, and the folder ID is correct; enable debug mode in the control panel or menu, and check the browser console.

If the issue persists, open an issue on [GitHub Issues](https://github.com/juzijun233/Re_Pixiv2Eagle/issues).

## Disclaimer

**This software is provided as is, without any express or implied warranties. The author is not responsible for any loss or damage caused by the use of this software. By using this software, you agree to assume all related risks.**

This tool is only for conveniently collecting and managing artworks you like. Please respect artists' work, and don't forget to like and bookmark the works you enjoy—that is the best support for creators.

## Development

```bash
npm install
npm run dev     # Development (esbuild --watch)
npm run build   # Production build → dist/RePixiv2Eagle.js
npm run release # Build and copy to Releases/{version}/
```

Source lives under `src/` as ES modules; esbuild bundles from `src/index.js` into a single IIFE. `src/header.txt` is the userscript metadata banner. Per-version CHANGELOGs are at `Releases/{version}/CHANGELOG.md` (release dir is git-ignored; generated locally via `npm run release`).

### Directory Layout

```text
src/
├── index.js          # bootstrap entry
├── header.txt        # userscript metadata
├── tampermonkey/     # GM wrappers, settings, menu, logging
├── config/           # constants, selectors, page monitor
├── routing/          # URL routing and page handlers
├── ui/               # control panel, toast, theme, buttons
├── eagle/            # Eagle API, folders, index cache
├── artwork/          # illustrations and ugoira
├── manga/            # manga series
├── novel/            # novels
├── artist-list/      # artist list badges
└── shared/           # cross-domain utilities
scripts/
├── build.js          # esbuild build
└── release.js        # release packaging
dist/
└── RePixiv2Eagle.js  # build output (git-ignored)
```

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.

- The current version uses the MIT License
- The author reserves the right to change the license type in future versions
- Released versions will maintain their original licenses
