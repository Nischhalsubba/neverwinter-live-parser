/**
 * Vite configuration for the renderer bundle.
 * Uses relative asset paths so packaged Electron builds can load the UI from
 * file:// URLs without blank-screen asset resolution failures.
 */
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "./",
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          charts: ["recharts"]
        }
      }
    }
  },
  server: {
    host: "127.0.0.1",
    port: 5173
  },
  test: {
    exclude: ["dist/**", "dist-electron/**", "node_modules/**"]
  }
});
