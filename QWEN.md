# Native Translate - Context for Qwen Code

This document provides a high-level overview of the Native Translate project, intended for use by Qwen Code to understand the codebase and provide effective assistance.

## Project Overview

Native Translate is a privacy-focused Chrome extension that leverages Chrome's built-in AI Translator and Language Detector APIs. It performs all translation and language detection tasks directly within the browser, ensuring user content never leaves the device. Translation models are downloaded and cached locally, enabling offline use after the initial download.

### Key Features

- **Full-page Translation:** Appends translated text beneath the original content blocks.
- **Hover-to-Translate:** Hold a selected modifier key (Alt/Ctrl/Shift) and hover over a paragraph to translate it inline.
- **Offline Capability:** Models are cached for offline use after downloading.
- **Privacy by Design:** No external network requests for translation by default. No telemetry or analytics.
- **Localized UI:** Uses Chrome's i18n framework for multi-language support.

### Technologies

- **Language:** TypeScript
- **Framework:** React 19
- **Styling:** Tailwind CSS v4
- **UI Components:** Radix UI primitives
- **Build Tool:** Rspack (SWC) for a Manifest V3 Chrome Extension
- **Package Manager:** pnpm
- **Linting/Formatting:** Biome

## Codebase Structure

The project follows a standard structure for a Chrome Extension MV3 project built with React and Rspack.

```
src/
  manifest.json         # Extension manifest
  popup/                # Popup UI (settings, translate button)
    popup.html
    popup.tsx
  sidePanel/            # Side panel UI (placeholder)
    sidePanel.html
    sidePanel.tsx
  scripts/              # Background and Content Scripts
    background.ts       # Handles side panel toggle, action click
    contentScript.ts    # Core translation engine and UI overlay
  components/ui/        # Reusable UI components (e.g., Button, Select)
  utils/                # Utility functions (e.g., i18n, RTL handling)
  styles/
    tailwind.css        # Tailwind base styles
public/                 # Static assets (icons)
_locales/               # i18n message files
```

### Core Components

1.  **`src/scripts/contentScript.ts`**: The heart of the extension. It handles:
    - Detecting the source language of the page content.
    - Downloading and managing translation models via Chrome's `Translator` API.
    - Performing the actual translation of text blocks.
    - Injecting the translated text into the page DOM.
    - Managing the UI overlay for progress/status messages.
    - Implementing the hover-to-translate functionality by listening to mouse/keyboard events.
    - Caching translations in memory to avoid redundant API calls.
    - Listening for messages from the popup (e.g., to trigger full-page translation).

2.  **`src/popup/popup.tsx`**: The UI that appears when the extension icon is clicked in the toolbar. It allows users to:
    - Select the target language for translation.
    - Choose the modifier key for hover-to-translate.
    - Trigger full-page translation for the active tab.
    - It communicates with the content script via `chrome.tabs.sendMessage`.

3.  **`src/scripts/background.ts`**: The background service worker. It handles:
    - Toggling the Side Panel (if enabled).
    - Configuring the behavior of the extension's action (toolbar icon click).

4.  **`src/sidePanel/sidePanel.tsx`**: A minimal placeholder for the extension's side panel.

5.  **`_locales/`**: Contains message files for internationalization (English, Chinese, etc.).

## Development Workflow

- **Install Dependencies:** `pnpm install`
- **Development Build (Watch):** `pnpm dev` (Uses `rspack build --watch`)
- **Production Build:** `pnpm build` (Uses `rspack build --mode production`)
- **Type Checking:** `pnpm tsc`
- **Linting:** `pnpm lint` or `pnpm lint:fix` (Uses Biome)

### Rspack Configuration (`rspack.config.js`)

- Configured for a multi-entry MV3 extension.
- Entries: `popup`, `sidePanel`, `background`, `contentScript`.
- Uses `swc-loader` for TypeScript/TSX.
- Uses `postcss-loader` and `tailwindcss` for styling.
- Copies static assets (`public/`, `manifest.json`, `_locales/`) to the `dist/` folder.
- Automatically zips the `dist/` folder into `Native-translate.zip` after a production build.
- Ensures clean output directory on each build.

## Deployment

1.  Run `pnpm build`.
2.  Load the generated `dist/` folder (or the `Native-translate.zip` file) into Chrome via `chrome://extensions` in Developer Mode.

## Important Considerations for Qwen Code

- **Chrome APIs:** The code heavily relies on Chrome Extension APIs (e.g., `chrome.i18n`, `chrome.storage`, `chrome.tabs`, `chrome.scripting`, `chrome.runtime`) and the experimental Built-in AI APIs (`window.Translator`, `window.LanguageDetector`). Understanding these APIs' behavior is crucial.
- **Asynchronous Nature:** Translation and model downloading are asynchronous operations managed with Promises. State management (e.g., model readiness, download progress) is important.
- **DOM Manipulation:** The content script dynamically injects translated text and UI elements into web pages. Selecting appropriate elements and avoiding conflicts with existing page structure/styles is handled by specific logic in `contentScript.ts`.
- **Content Security Policy (CSP):** As an MV3 extension, the CSP is strict. All scripts must be bundled and included in the extension package. This is handled by Rspack.
- **Permissions:** The extension requires specific permissions (`storage`, `activeTab`, `scripting`, `tabs`, `sidePanel`) as declared in `manifest.json`. These are necessary for its functionality.