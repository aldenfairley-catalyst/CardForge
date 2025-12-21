# Captain Jawa Forge (Card Builder MVP)

React + TypeScript + Vite + React Flow.

## Local
1) Install Node.js 20 (via nvm or your package manager).
2) From the repo root run `npm install` (this also installs server deps via postinstall).
3) Run `npm run dev` to start both the Vite client and the local API server.
4) Open `http://localhost:5173`.

### Troubleshooting local setup
- Avoid `sudo npm install`; it can create permission issues with the Vite cache. If you already used sudo, remove the generated `node_modules` folder and rerun `npm install`.
- If you see `tsx: command not found`, the server dependencies were not installed. Run `npm run install:server` from the repo root.
- If port 8787 is already taken, set `PORT=8788` (or another open port) before running `npm run dev`. The server will also try the next two ports automatically.

## GitHub Pages
1) Push to main
2) Settings → Pages → Build and deployment → GitHub Actions
3) Workflow publishes automatically

## Import/Export
- Imports CJ-1.0 card JSON (or FORGE-1.0 project JSON)
- Exports CJ-1.0 card JSON + FORGE-1.0 project JSON

## AI Image Generation (Builder)
- Supports OpenAI and Gemini providers via the AI Image modal.
- If a Proxy URL is configured, requests are POSTed there; otherwise the app calls the provider API directly with your supplied key using the modal request (prompt, size, negative prompt, references).
- Responses that contain a base64 data URL or image URL will automatically fill `visuals.cardImage` for the active card.
