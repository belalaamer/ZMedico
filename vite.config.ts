import { defineConfig } from "vite";
import type { OutputChunk } from "rollup";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

const refreshJavaScriptAssetMetadata = () => ({
  name: "zmedico-refresh-javascript-asset-metadata",
  generateBundle(_options: unknown, bundle: Record<string, OutputChunk | { type: string }>) {
    for (const output of Object.values(bundle)) {
      if (output.type === "chunk") {
        (output as OutputChunk).code += "\n/* zmedico-asset-metadata-refresh */\n";
      }
    }
  },
});

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    refreshJavaScriptAssetMetadata(),
    process.env.NODE_ENV === "development" && componentTagger(),
  ],
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
  },
});
