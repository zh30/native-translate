# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Native Translate** is a privacy-focused Chrome browser extension that uses Chrome's built-in AI Translator and Language Detector APIs. It provides on-device translation without external API calls, supporting full-page translation and hover-to-translate functionality with 26 languages. The extension follows Chrome Extension Manifest v3 architecture and includes comprehensive internationalization support.

## Development Commands

### Build & Development
- `pnpm dev` - Start development build with file watching
- `pnpm build` - Production build (creates dist/ and Native-translate.zip)
- `pnpm tsc` - TypeScript type checking
- `pnpm lint` - Run Biome linter
- `pnpm lint:fix` - Run Biome linter with auto-fix
- **Package Manager**: Uses `pnpm@9.15.1+` (specified in packageManager field)

### Testing
- No test framework configured yet (`npm test` returns error)

## Architecture

### Browser Extension Structure
The extension follows Chrome Extension Manifest v3 architecture with these entry points:

- **Background Script** (`src/scripts/background.ts`) - Service worker handling tab events and side panel management for zhanghe.dev
- **Content Script** (`src/scripts/contentScript.ts`) - Main translation engine with hover-to-translate functionality
- **Side Panel** (`src/sidePanel/sidePanel.tsx`) - React component for the extension's side panel UI
- **Popup** (`src/popup/popup.tsx`) - React component for extension popup with settings and translation controls

### Key Features
1. **On-Device Translation**: Uses Chrome's built-in AI Translator API (Chrome 138+)
2. **Full-Page Translation**: Appends translated text under original content blocks
3. **Hover-to-Translate**: Hold modifier key (Alt/Control/Shift) and hover over paragraphs
4. **Automatic Language Detection**: Uses Chrome's Language Detector API
5. **Model Caching**: Downloads and caches translation models per language pair
6. **Internationalization**: Support for 13 languages via `_locales/` directory
7. **RTL/LTR Support**: Automatic text direction handling for target languages

### Technology Stack
- **Frontend**: React 19 + TypeScript
- **Styling**: Tailwind CSS v4 with PostCSS
- **Build Tool**: Rspack (webpack alternative) with SWC compiler
- **UI Components**: Radix UI primitives (Select, Label, Button)
- **Bundle Structure**: Separate chunks for popup, sidePanel, background, and contentScript

### Core Architecture Patterns

#### Translation Engine (`src/scripts/contentScript.ts`)
- **Block Collection**: Intelligently selects translatable content blocks while avoiding navigation elements
- **Model Management**: Handles translator/detector API availability, downloads, and caching
- **Progress Overlay**: Shows download and translation progress with user feedback
- **Memory Caching**: Caches translations at both line and language-pair levels
- **Hover System**: Event-driven hover translation with configurable modifier keys

#### Settings Management
- **Storage**: Uses chrome.storage.local for persistence
- **Hotkey Configuration**: Configurable modifier keys (Alt/Control/Shift)
- **Language Preferences**: Target language selection with 26 supported options
- **Real-time Updates**: Settings changes propagate to content scripts immediately

#### Chrome APIs Integration
- **Translator API**: `window.Translator` for on-device translation
- **Language Detector API**: `window.LanguageDetector` for source language detection
- **Storage API**: For settings and model readiness caching
- **Scripting API**: For content script injection when needed
- **Tabs API**: For tab management and communication

### File Structure Patterns
```
src/
├── manifest.json          # Extension configuration
├── popup/                 # Popup UI (HTML + React)
├── sidePanel/            # Side panel UI (HTML + React) 
├── scripts/              # Background and content scripts
├── styles/               # Tailwind CSS configuration
├── components/ui/        # Reusable UI components (Radix-based)
└── utils/                # Utility functions (i18n, RTL)
```

### Development Patterns
- **React Components**: Functional components with hooks (React.useState)
- **Chrome APIs**: Uses chrome.tabs, chrome.sidePanel, chrome.action, chrome.storage
- **Error Handling**: Graceful fallbacks for API unavailability and script injection failures
- **Styling**: Tailwind utility classes with dark mode support
- **Type Safety**: Strict TypeScript with Chrome API types from chrome-types

### Rspack Configuration
- **Entry Points**: Multi-entry setup for all extension components
- **TypeScript**: SWC-based transpilation with JSX support and automatic runtime
- **CSS**: PostCSS + Tailwind processing with extraction to separate files
- **Output**: Clean builds to `dist/` directory with manifest and assets copying
- **Zip Plugin**: Custom ZipAfterBuildPlugin creates distribution zip file
- **Asset Handling**: Icons and fonts copied to appropriate locations

### Manifest Configuration
- **Permissions**: storage, activeTab, scripting, tabs, sidePanel
- **Content Scripts**: Runs on all URLs (`<all_urls>`)
- **Minimum Chrome**: v138+ (required for built-in AI APIs)
- **Side Panel**: Default path set to `sidePanel.html`
- **Action**: Popup enabled with full icon set

### Code Quality Tools
- **Biome**: Linting and formatting (2-space indentation, 100-character line width)
- **TypeScript**: Strict type checking with Chrome API definitions
- **Chrome Types**: Type definitions for Chrome extension APIs
- **Git Integration**: Biome VCS support enabled

### Internationalization
- **Chrome i18n**: Uses chrome.i18n.getMessage for all UI text
- **Locale Support**: 13 languages in `_locales/` directory
- **RTL Handling**: Automatic direction detection and styling
- **Fallback Strategy**: Returns key if translation not found