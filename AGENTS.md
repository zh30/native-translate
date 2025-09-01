# Native Translate - Agent Guidelines

## Build & Test Commands
- **Development**: `pnpm dev` (watch mode with auto-rebuild)
- **Production**: `pnpm build` (creates dist/ + zip)
- **Type Check**: `pnpm tsc` (strict TypeScript validation)
- **Lint**: `pnpm lint` (Biome check)
- **Lint Fix**: `pnpm lint:fix` (Biome auto-fix)
- **Test**: No test framework configured yet

## Code Style Guidelines
- **Formatting**: 2-space indent, 100-char width, single quotes (JS), double quotes (JSX), semicolons as needed
- **TypeScript**: Strict mode enabled, explicit types for public APIs, avoid `any`, prefer `unknown`/generics
- **Imports**: React → third-party → local; use `@/*` aliases for `src/*`
- **Naming**: Meaningful names (avoid 1-2 letter vars), functions as verb phrases, variables as noun phrases
- **Components**: Function components with hooks, explicit prop interfaces, use Radix UI from `src/components/ui/`
- **Styling**: Tailwind with `cn()` utility, `dark:` for themes, `z-[2147483647]` for overlays
- **Error Handling**: Graceful fallbacks, meaningful error messages, avoid silent failures
- **Architecture**: Follow existing patterns, use chrome.storage.local, maintain MV3 structure

## Cursor Rules
- Entry points must match manifest.json exactly (popup.html, sidePanel.html, background.js, contentScript.js)
- Use `@/*` path aliases consistently for `src/*` imports
- Component props must be explicitly typed with interfaces
- Prioritize Radix UI components and Tailwind utilities over custom CSS
- Follow Biome formatting and TypeScript strict mode
- Use meaningful variable/function names (no 1-2 letter vars)
- Import global styles in each entry point
- Use Chrome i18n for all user-facing text with `_locales/*/messages.json`
- Set document direction (`dir="rtl|ltr"`) based on UI language
- Maintain MV3 extension structure and chrome.storage.local usage