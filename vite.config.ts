import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// GitHub Pages: base = /<repo>/ during Actions build
function computeBase() {
  const repo = process.env.GITHUB_REPOSITORY?.split("/")[1];
  const isGhActions = !!process.env.GITHUB_ACTIONS;
  if (isGhActions && repo) return `/${repo}/`;
  return "/";
}

export default defineConfig({
  base: computeBase(),
  // Store Vite's cache in a project-local folder to avoid node_modules permissions issues
  cacheDir: ".vite",
  plugins: [react()],
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:8787",
        changeOrigin: true
      }
    }
  }
});
