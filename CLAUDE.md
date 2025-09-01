# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Native Translate** is a privacy-focused Chrome browser extension that uses Chrome's built-in AI Translator and Language Detector APIs. It provides on-device translation without external API calls, supporting full-page translation and hover-to-translate functionality with 26 languages. The extension follows Chrome Extension Manifest v3 architecture and includes comprehensive internationalization support.

## Development Commands

### Build & Development
- `pnpm dev` - Start development build with file watching AND auto-reload server (listens on port 5173/5174)
- `pnpm build` - Production build (creates dist/ and Native-translate.zip)
- `pnpm tsc` - TypeScript type checking
- `pnpm lint` - Run Biome linter
- `pnpm lint:fix` - Run Biome linter with auto-fix
- **Package Manager**: Uses `pnpm@9.15.1+` (specified in packageManager field)

### Development Auto-Reload
- **Watch Mode**: `pnpm dev` runs Rspack in watch mode, rebuilding on file changes
- **Extension Reload**: Manual reload required in chrome://extensions during development
- **Environment**: Uses `__DEV__` flag to conditionally enable dev features

### Testing
- No test framework configured yet (`npm test` returns error)

## Architecture

### Browser Extension Structure
The extension follows Chrome Extension Manifest v3 architecture with these entry points:

- **Background Script** (`src/scripts/background.ts`) - Service worker handling tab events and side panel management
- **Content Script** (`src/scripts/contentScript.ts`) - Main translation engine with hover-to-translate functionality and page world bridge
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
8. **Triple-Space Translation**: Type three spaces in input fields to translate content automatically
9. **Multi-Frame Support**: Content script runs in all frames including about:blank pages
10. **Input Field Translation**: Supports translation in contentEditable areas and text inputs

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
- **Translator API Adapter**: Supports both legacy (`window.Translator`) and modern (`window.translation.createTranslator`) Chrome APIs
- **Page World Bridge**: Injects bridge script to access Translator API from isolated content script context
- **Fallback Strategy**: Gracefully falls back to bridge translation when direct API access is unavailable
- **Input Field Translation**: Triple-space trigger for translating content in input fields and contentEditable areas
- **IME Awareness**: Handles composition events for Asian languages to prevent false triggers
- **Smart Element Selection**: Avoids translating code blocks, tables, and navigation elements

#### Settings Management
- **Storage**: Uses chrome.storage.local for persistence
- **Hotkey Configuration**: Configurable modifier keys (Alt/Control/Shift)
- **Language Preferences**: Target language selection with 26 supported options
- **Real-time Updates**: Settings changes propagate to content scripts immediately

#### Chrome APIs Integration
- **Translator API**: `window.Translator` (legacy) and `window.translation.createTranslator` (modern) for on-device translation
- **Language Detector API**: `window.LanguageDetector` for source language detection
- **Storage API**: For settings and model readiness caching
- **Scripting API**: For content script injection when needed
- **Tabs API**: For tab management and communication
- **Runtime API**: For extension messaging and lifecycle management

### File Structure Patterns
```
src/
├── manifest.json          # Extension configuration
├── popup/                 # Popup UI (HTML + React)
├── sidePanel/            # Side panel UI (HTML + React) 
├── scripts/              # Background and content scripts
├── shared/               # Cross-context types and utilities
├── styles/               # Tailwind CSS configuration
├── components/ui/        # Reusable UI components (Radix-based)
└── utils/                # Utility functions (i18n, RTL, EPUB parsing)
```

### Development Patterns
- **React Components**: Functional components with hooks (React.useState)
- **Chrome APIs**: Uses chrome.tabs, chrome.sidePanel, chrome.action, chrome.storage
- **Error Handling**: Graceful fallbacks for API unavailability and script injection failures
- **Styling**: Tailwind utility classes with dark mode support
- **Type Safety**: Strict TypeScript with Chrome API types from chrome-types

### Rspack Configuration
- **Entry Points**: Multi-entry setup for all extension components including offscreen document
- **TypeScript**: SWC-based transpilation with JSX support and automatic runtime
- **CSS**: PostCSS + Tailwind processing with extraction to separate files
- **Output**: Clean builds to `dist/` directory with manifest and assets copying
- **Zip Plugin**: Custom ZipAfterBuildPlugin creates distribution zip file (production only)
- **Asset Handling**: Icons and fonts copied to appropriate locations

### Manifest Configuration
- **Permissions**: storage, activeTab, scripting, tabs, sidePanel
- **Content Scripts**: Runs on all URLs (`<all_urls>`) with `all_frames: true` and `match_about_blank: true`
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

### Development Architecture
- **Bridge Architecture**: Content script injects bridge into page world to access Translator API
- **API Adapter Pattern**: Handles both legacy and modern Chrome Translator API implementations
- **Streaming Translation**: Progressive translation with visual feedback for long texts
- **Memory Management**: WeakSet tracking and translation caching for performance

## Cursor Rules Summary

### Project Structure & Entry Points
- **Entry points must match manifest.json exactly**: background.js, contentScript.js, popup.html, sidePanel.html
- **Use `@/*` path aliases** for absolute imports from `src/` (configured in both tsconfig.json and rspack.config.js)
- **Maintain strict naming consistency** between build outputs and manifest references
- **Core configuration files**: rspack.config.js, tsconfig.json, biome.json, package.json
- **Browser extension manifest**: src/manifest.json with minimum Chrome version 138+

### TypeScript & React 19
- **Strict TypeScript mode**: `strict: true` enabled, avoid `any` types, prefer `unknown` or explicit types
- **Explicit type annotations**: Public APIs must have complete function signatures and return types
- **React 19 patterns**: Function components with hooks, automatic JSX runtime, explicit prop typing
- **Import order**: React → third-party → local (types, components, utils)
- **Component props must be explicitly typed** with interfaces
- **Target & libs**: ES2020 with DOM, DOM.Iterable, ES2020 for extension runtime compatibility

### UI & Styling
- **Use Radix UI components** from `src/components/ui/` (Button, Select, Label, Progress, Textarea)
- **Tailwind CSS with `cn()` utility** for class merging (clsx + tailwind-merge)
- **Z-index for overlays**: `z-[2147483647]` to avoid being covered by page content
- **Component variants** using `class-variance-authority` pattern
- **Dark mode support**: Use `dark:` prefix, avoid custom CSS when possible
- **Typography**: Default `text-sm` with compact spacing
- **Import global styles**: Each entry point must import `../styles/tailwind.css`

### Extension Development
- **Manifest v3** with service worker architecture
- **Chrome 138+ required** for built-in AI APIs
- **Development builds** use watch mode with manual extension reload
- **Production builds** automatically create zip distribution package
- **Multi-frame support**: Content scripts run in all frames including about:blank
- **Path mapping**: Use `@/*` aliases consistently across TypeScript and build config