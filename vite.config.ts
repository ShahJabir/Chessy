import { defineConfig } from "vite";

export default defineConfig({
  server: {
    host: "0.0.0.0",
    port: 5173,
    strictPort: true,
    allowedHosts: true as unknown as string[],
  },
  preview: {
    host: "0.0.0.0",
    port: 4173,
    strictPort: true,
    allowedHosts: true as unknown as string[],
  },
  build: {
    target: "es2020",
    chunkSizeWarningLimit: 1600,
  },
});
