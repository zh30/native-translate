# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Tiny Helmet** is a Chrome browser extension built with React, TypeScript, Tailwind CSS v4, and Rspack. The extension enhances developer experience by providing a side panel and reading time estimation for articles. It primarily activates on `zhanghe.dev` and includes internationalization support.

## Development Commands

### Build & Development
- `pnpm dev` - Start development build with file watching
- `pnpm build` - Production build 
- `pnpm tsc` - TypeScript type checking
- **Package Manager**: Uses `pnpm@9.15.1+` (specified in packageManager field)

### Testing
- No test framework configured yet (`npm test` returns error)

## Architecture

### Browser Extension Structure
The extension follows Chrome Extension Manifest v3 architecture with these entry points:

- **Background Script** (`src/scripts/background.ts`) - Service worker handling tab events and side panel management
- **Content Script** (`src/scripts/contentScript.ts`) - Injected into pages to add reading time badges to articles
- **Side Panel** (`src/sidePanel/sidePanel.tsx`) - React component for the extension's side panel UI
- **Popup** (`src/popup/popup.tsx`) - React component for extension popup (currently disabled in manifest)

### Key Features
1. **Conditional Side Panel**: Automatically enabled/disabled based on current tab URL (specifically `zhanghe.dev`)
2. **Reading Time Calculator**: Content script adds estimated reading time badges to articles
3. **Internationalization**: Support for English and Simplified Chinese (`_locales/` directory)

### Technology Stack
- **Frontend**: React 19 + TypeScript
- **Styling**: Tailwind CSS v4 with PostCSS
- **Build Tool**: Rspack (webpack alternative) with SWC compiler
- **Bundle Structure**: Separate chunks for popup, sidePanel, background, and contentScript

### File Structure Patterns
```
src/
├── manifest.json          # Extension configuration
├── popup/                 # Popup UI (HTML + React)
├── sidePanel/            # Side panel UI (HTML + React) 
├── scripts/              # Background and content scripts
└── styles/               # Tailwind CSS configuration
```

### Development Patterns
- **React Components**: Functional components with hooks (React.useState)
- **Chrome APIs**: Uses chrome.tabs, chrome.sidePanel, chrome.action
- **Error Handling**: Console logging with proper error catching
- **Styling**: Tailwind utility classes with custom configuration

### Rspack Configuration
- **Entry Points**: Multi-entry setup for all extension components
- **TypeScript**: SWC-based transpilation with JSX support
- **CSS**: PostCSS + Tailwind processing with extraction
- **Output**: Clean builds to `dist/` directory with manifest and assets copying

### Manifest Configuration
- **Permissions**: storage, activeTab, scripting, tabs, sidePanel
- **Content Scripts**: Runs on all URLs (`<all_urls>`)
- **Minimum Chrome**: v114+
- **Side Panel**: Default path set to `sidePanel.html`