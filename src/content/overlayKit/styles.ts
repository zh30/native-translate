export const OVERLAY_STYLES = `
:host {
  all: initial;
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 2147483647;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  --nt-ai-from: oklch(0.606 0.25 292.7);
  --nt-ai-to: oklch(0.667 0.295 322.1);
  --nt-overlay-bg: #ffffff;
  --nt-overlay-fg: #09090b;
  --nt-overlay-muted: #52525b;
  --nt-overlay-line: rgba(24,24,27,0.1);
  --nt-overlay-accent: #155e75;
  --nt-radius: 16px;
  --nt-shadow: 0 16px 48px rgba(15,23,42,0.08);
  color: var(--nt-overlay-fg);
}
:host([data-theme='dark']) {
  --nt-overlay-bg: #09090b;
  --nt-overlay-fg: #fafafa;
  --nt-overlay-muted: #a1a1aa;
  --nt-overlay-line: rgba(250,250,250,0.12);
  --nt-overlay-accent: #a5f3fc;
  --nt-shadow: 0 16px 48px rgba(0,0,0,0.35);
}
* { box-sizing: border-box; }
.nt-layer { pointer-events: none; }
.nt-interactive { pointer-events: auto; }
.nt-pill {
  display: inline-flex;
  gap: 4px;
  padding: 4px;
  border-radius: 999px;
  background: var(--nt-overlay-bg);
  color: var(--nt-overlay-fg);
  border: 1px solid var(--nt-overlay-line);
  box-shadow: var(--nt-shadow);
  backdrop-filter: blur(16px);
  animation: nt-fade-up 120ms cubic-bezier(0.25, 1, 0.5, 1);
}
.nt-card {
  min-width: 260px;
  max-width: min(420px, 90vw);
  border-radius: var(--nt-radius);
  background: var(--nt-overlay-bg);
  border: 1px solid var(--nt-overlay-line);
  box-shadow: var(--nt-shadow);
  backdrop-filter: blur(16px);
  padding: 10px 12px;
  animation: nt-fade-up 180ms cubic-bezier(0.25, 1, 0.5, 1);
}
.nt-btn {
  appearance: none;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  padding: 5px 8px;
  border-radius: 999px;
  cursor: pointer;
}
.nt-btn:hover { background: color-mix(in oklab, var(--nt-overlay-accent) 14%, transparent); }
.nt-btn-ai {
  background: linear-gradient(90deg, var(--nt-ai-from), var(--nt-ai-to));
  color: white;
}
.nt-muted { color: var(--nt-overlay-muted); font-size: 11px; }
.nt-quote {
  font-size: 12px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.nt-stream { font-size: 13px; line-height: 1.55; white-space: pre-wrap; color: var(--nt-overlay-accent); }
.nt-caret {
  display: inline-block;
  width: 0.55ch;
  height: 1em;
  margin-left: 2px;
  background: linear-gradient(var(--nt-ai-from), var(--nt-ai-to));
  animation: nt-pulse 1s ease-in-out infinite;
}
.nt-skel { height: 10px; border-radius: 4px; margin: 6px 0; background: linear-gradient(90deg, var(--nt-overlay-line), transparent, var(--nt-overlay-line)); background-size: 200% 100%; animation: nt-shimmer 1.6s linear infinite; }
.nt-hud {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.35);
  cursor: crosshair;
  pointer-events: auto;
}
.nt-rect {
  position: absolute;
  border: 2px solid transparent;
  border-image: linear-gradient(90deg, var(--nt-ai-from), var(--nt-ai-to)) 1;
  box-shadow: 0 0 0 9999px rgba(0,0,0,0.35);
}
.nt-badge {
  position: absolute;
  transform: translateY(-120%);
  background: #18181b;
  color: white;
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 999px;
}
.nt-word {
  border-bottom: 1px dashed color-mix(in oklab, var(--nt-ai-from) 70%, transparent);
  background: color-mix(in oklab, var(--nt-ai-from) 14%, transparent);
  cursor: pointer;
}
@keyframes nt-fade-up { from { opacity: 0; transform: translateY(4px) scale(0.98);} to { opacity: 1; transform: none; } }
@keyframes nt-shimmer { from { background-position: 200% 0;} to { background-position: -200% 0;} }
@keyframes nt-pulse { 50% { opacity: 0.35; } }
@media (prefers-reduced-motion: reduce) {
  .nt-pill, .nt-card, .nt-skel, .nt-caret { animation: none !important; }
}
`
