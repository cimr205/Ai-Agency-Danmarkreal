import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { sentryVitePlugin } from "@sentry/vite-plugin";

// Release = the deployed git SHA, so a Sentry issue maps to an exact commit.
// Vercel exposes it at build time; SENTRY_RELEASE overrides for other CI.
const sentryRelease =
  process.env.SENTRY_RELEASE || process.env.VITE_SENTRY_RELEASE || process.env.VERCEL_GIT_COMMIT_SHA || "";
// production / preview / development on Vercel; falls back to the Vite mode at runtime.
const sentryEnvironment = process.env.VITE_SENTRY_ENVIRONMENT || process.env.VERCEL_ENV || "";
// Source maps are uploaded only when the build has credentials for it. Without
// them the build is byte-for-byte what it was before (no maps emitted).
const uploadSourceMaps = Boolean(
  process.env.SENTRY_AUTH_TOKEN && process.env.SENTRY_ORG && process.env.SENTRY_PROJECT,
);

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  define: {
    __SENTRY_RELEASE__: JSON.stringify(sentryRelease),
    __SENTRY_ENVIRONMENT__: JSON.stringify(sentryEnvironment),
  },
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
    // This repository also contains large Python/HR applications. Watching
    // those trees can queue tens of thousands of unrelated page reloads and
    // prevent the frontend dev server from responding during startup.
    watch: {
      ignored: [
        "**/hr/**",
        "**/scraper/**",
        "**/twilio-server/**",
      ],
    },
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    // Must stay last. Uploads maps to Sentry, then deletes them from dist/ so
    // they are never served publicly.
    uploadSourceMaps &&
      sentryVitePlugin({
        org: process.env.SENTRY_ORG,
        project: process.env.SENTRY_PROJECT,
        authToken: process.env.SENTRY_AUTH_TOKEN,
        url: process.env.SENTRY_URL,
        release: sentryRelease ? { name: sentryRelease } : undefined,
        sourcemaps: { filesToDeleteAfterUpload: ["./dist/**/*.map"] },
        telemetry: false,
      }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  // elah's MP4 export runs in a dedicated module Web Worker (OffscreenCanvas).
  // Both settings below are required for that worker — omit either and export
  // fails at runtime. See https://www.elah.dev/docs/installation
  worker: {
    format: "es",
  },
  optimizeDeps: {
    exclude: ["@elah/editor", "@elah/core", "@elah/react", "@elah/timeline", "mediabunny"],
    // Force react-dom's CJS->ESM interop (named exports like createPortal) to be
    // pre-bundled consistently. Without this, elah's excluded packages import the
    // raw un-bundled react-dom and hit "does not provide an export named ...".
    include: ["react-dom", "react-dom/client"],
  },
  build: {
    target: "esnext",
    // "hidden" = emit maps for the upload without a sourceMappingURL comment.
    sourcemap: uploadSourceMaps ? "hidden" : false,
    rollupOptions: {
      output: {
        // NOTE: every key in this static manualChunks object gets a
        // <link rel="modulepreload"> in the root index.html, so it loads on
        // EVERY route regardless of whether that route uses it. jspdf is
        // only needed on the invoice pages (PDF export) — it must not be
        // listed here, or it eagerly loads on the dashboard and everywhere
        // else too. Vite's default splitting already gives it its own async
        // chunk via the dynamic/lazy imports in invoicePdf.ts's callers.
        manualChunks: {
          "vendor-react": ["react", "react-dom", "react-router-dom"],
          "vendor-ui": ["@radix-ui/react-dialog", "@radix-ui/react-dropdown-menu", "@radix-ui/react-select", "@radix-ui/react-tooltip", "@radix-ui/react-popover"],
          "vendor-supabase": ["@supabase/supabase-js"],
          "vendor-query": ["@tanstack/react-query"],
        },
      },
    },
  },
}));
