# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Rover is a Chrome extension (Manifest V3) for searching bookmarks with the keyboard, Spotlight style. It is a Create React App project (TypeScript, React 18, react-bootstrap, Sass) with the webpack config overridden by CRACO.

## Commands

- `npm run build`: production build into `build/` via CRACO. Load `build/` as an unpacked extension at `chrome://extensions` to test.
- `npm test`: Jest + React Testing Library in watch mode (`react-scripts test`).
- Single test: `npm test -- -t "renders input component"` or `npm test -- src/App.test.tsx`. Add `--watchAll=false` for a one-shot run.
- `npm start` runs the CRA dev server, but `chrome.*` APIs are unavailable outside the extension context, so search does nothing there.

Linting is the CRA built-in ESLint config (`react-app`, `react-app/jest`), applied during build/start. There is no separate lint script.

## Architecture

Two separately bundled entry points, configured in `craco.config.js`:

- **Popup UI** (`src/index.tsx` -> `src/App.tsx`): served as `index.html`, set as `action.default_popup` in `public/manifest.json`. All UI logic lives in `App.tsx`: search input, result list (capped at `MAX_BOOKMARKS_COUNT`), and arrow-key/Enter navigation. Opening a bookmark sends `OPEN_BOOKMARK` to the background rather than opening the URL directly.
- **Background service worker** (`src/background.ts`): emitted as `static/js/background.js` (CRACO forces non-hashed `[name].js` filenames and disables the runtime chunk so the manifest path stays stable). It owns all `chrome.*` work: bookmark search, opening tabs, and per-bookmark open counts in `chrome.storage.local` (key `openCounts`, keyed by bookmark id). Search results are sorted by open count before the popup truncates them; counts are removed when a bookmark is deleted.

The popup and background communicate through `chrome.runtime.sendMessage`. Messages are typed as `Payload` (`src/interface/Payload.ts`) with an `ACTION_TYPE` enum (`src/enum/ActionType.ts`) discriminator. To add a new capability, add an enum member, handle it in `background.ts`'s message listener, and send it from the popup. The listener returns `true` to keep the response channel open for the async handler.

`public/manifest.json` is copied verbatim into `build/`. Its `version` is kept in sync with `package.json` manually when releasing.

## Styling

- `src/index.scss` imports `custom.scss` **before** Bootstrap so the Sass variable overrides there (focus ring, list-group active colors) take effect, then Bootstrap and bootstrap-icons.
- The popup size is fixed in `body` (`width: 450px`, `overflow-y: hidden`).
- Gradient borders on `.input-group` and the active `.list-group-item` (plus the `text-graident` icon class, spelled that way) are defined in `custom.scss`.

## Known inconsistencies

- README says the shortcut is Cmd+Shift+K, but `manifest.json` declares a placeholder `run-foo` command on Cmd+Shift+O (not `_execute_action`).
- The `HtmlWebpackPlugin` in `craco.config.js` generates an `options.html` for a nonexistent `options` chunk.
