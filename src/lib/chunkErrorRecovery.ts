const RELOAD_FLAG = "chunk-reload-attempted";

/** Matches Vite's dynamic-import / module-preload failure messages across browsers. */
export function isChunkLoadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Loading chunk [\w-]+ failed/i.test(message);
}

/**
 * Reloads the page once to recover from a stale chunk after a new deploy.
 * Guards against an infinite reload loop if the reload doesn't actually fix it.
 */
export function reloadOnceForChunkError(): void {
  const alreadyTried = sessionStorage.getItem(RELOAD_FLAG);
  if (alreadyTried) return;
  sessionStorage.setItem(RELOAD_FLAG, "1");
  window.location.reload();
}

export function clearChunkReloadGuard(): void {
  sessionStorage.removeItem(RELOAD_FLAG);
}
