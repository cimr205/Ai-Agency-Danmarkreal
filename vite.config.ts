import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    target: "esnext",
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
