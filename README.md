# Captain Jawa Forge (Card Builder MVP)

React + TypeScript + Vite + React Flow.

## Local
npm install
npm run dev

### Local Run (SQLite + API proxy)
1) Install Node.js 20 (via nvm or your package manager)
2) `npm install`
3) `npm run dev` (launches the Vite client; start the backend with `npm run dev --prefix server`)
4) Open `http://localhost:5173`

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
