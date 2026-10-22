import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  // The console is served from the root; the static landing page sits under a repository path on GitHub Pages.
  base: process.env.SITE_BASE || "/",
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      "/api": { target: "http://127.0.0.1:8787", changeOrigin: true, ws: true },
      "/agent": { target: "http://127.0.0.1:8787", changeOrigin: true },
    },
  },
});
