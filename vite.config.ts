import { defineConfig } from "vite";

// Static export for IPFS: relative asset URLs, hash routing, output in dist/.
export default defineConfig({
  root: "site",
  base: "./",
  publicDir: "public",
  build: { outDir: "../dist", emptyOutDir: true, assetsInlineLimit: 0 },
  test: { root: ".", include: ["test/unit/**/*.test.ts"] },
} as never);
