import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Preview-safe: bind every interface, allow the Arena proxy host, and let the
// dev server talk to a real Shadow Quest API via VITE_API_ORIGIN without
// exposing that origin to the browser.
export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 5173,
    strictPort: false,
    allowedHosts: [".e2b.app", "localhost"],
    cors: true,
  },
  preview: {
    host: "0.0.0.0",
    allowedHosts: [".e2b.app", "localhost"],
  },
  build: {
    target: "es2022",
    cssMinify: true,
    rollupOptions: {
      output: {
        manualChunks: {
          gsap: ["gsap"],
        },
      },
    },
  },
});
