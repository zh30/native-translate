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
- Entry points must match manifest.json exactly
- Use `@/*` path aliases consistently
- Component props must be explicitly typed
- Prioritize Radix UI components and Tailwind utilities
- Follow Biome formatting and TypeScript strict mode
- Use meaningful variable/function names
- Import global styles in each entry point