import { resolve } from "node:path";
import { defineConfig } from "electron-vite";
import { build, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";

const sharedAlias = { "@shared": resolve(__dirname, "src/shared") };

/**
 * `out/relay/index.js`: the stdio ↔ socket relay that `~/.cushn/bin/cushn-mcp` runs with the
 * app's own binary and `ELECTRON_RUN_AS_NODE=1`. Its own bundle: CommonJS, `node:` builtins only.
 */
function relayBundle(): Plugin {
  return {
    name: "cushn:relay",
    apply: "build",
    async closeBundle() {
      await build({
        configFile: false,
        logLevel: "warn",
        build: {
          ssr: resolve(__dirname, "src/relay/index.ts"),
          outDir: resolve(__dirname, "out/relay"),
          emptyOutDir: true,
          target: "node22",
          minify: false,
          reportCompressedSize: false,
          rolldownOptions: { output: { format: "cjs", entryFileNames: "index.js" } },
        },
      });
    },
  };
}

export default defineConfig({
  main: {
    resolve: { alias: sharedAlias },
    plugins: [relayBundle()],
  },
  preload: {
    resolve: { alias: sharedAlias },
  },
  renderer: {
    // electron-vite leaves the renderer unminified by default.
    build: { minify: true },
    resolve: {
      alias: {
        ...sharedAlias,
        "@": resolve(__dirname, "src/renderer"),
      },
    },
    plugins: [
      tanstackRouter({
        target: "react",
        autoCodeSplitting: true,
        routesDirectory: resolve(__dirname, "src/renderer/routes"),
        generatedRouteTree: resolve(__dirname, "src/renderer/routeTree.gen.ts"),
      }),
      tailwindcss(),
      react(),
    ],
  },
});
