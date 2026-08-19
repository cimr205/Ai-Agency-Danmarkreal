import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { reloadOnceForChunkError, clearChunkReloadGuard } from "./lib/chunkErrorRecovery";

// A new deploy invalidates old JS chunk URLs. Any user with the app still
// open (or a stale cached index.html) will fail to fetch a lazy-loaded
// route's chunk — recover automatically with a single hard reload instead
// of leaving them stuck on a dead page.
window.addEventListener("vite:preloadError", () => {
  reloadOnceForChunkError();
});

createRoot(document.getElementById("root")!).render(<App />);

// If we're still running a few seconds after the reload that recovered from
// a chunk-load error, the app is healthy again — clear the guard so a later,
// unrelated deploy can also trigger a one-time auto-recovery.
setTimeout(clearChunkReloadGuard, 5000);
