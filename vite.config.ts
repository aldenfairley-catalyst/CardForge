import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// GitHub Pages: base = /<repo>/ during Actions build
function computeBase() {
  const repo = process.env.GITHUB_REPOSITORY?.split("/")[1];
  const isGhActions = !!process.env.GITHUB_ACTIONS;
  if (isGhActions && repo) return `/${repo}/`;
  return "/";
}

const apiPort = Number(process.env.FORGE_SERVER_PORT ?? process.env.PORT ?? 8787);
const apiTarget = `http://localhost:${apiPort}`;

export default defineConfig({
  base: computeBase(),
  // Store Vite's cache in a project-local folder to avoid node_modules permissions issues
  cacheDir: ".vite",
  plugins: [react()],
  server: {
    proxy: {
      "/api": {
        target: apiTarget,
        changeOrigin: true
      }
    }
  }
});
