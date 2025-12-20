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
  plugins: [react()]
});
