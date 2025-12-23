# Captain Jawa Forge (Card Builder MVP)

React + TypeScript + Vite + React Flow.

## Local
1) Install Node.js 20 (via nvm or your package manager).
2) From the repo root run `npm ci` (this uses the lockfile and also runs `npm ci --prefix server` via postinstall).
3) Run `npm run dev` to start both the Vite client and the local API server.
4) Open `http://localhost:5173`.

### Data provider (persistence)
- Use the **Data** selector in the top nav to switch between the browser/localStorage provider and the Express/SQLite API provider.
- Set `VITE_PROVIDER_KIND=local-api` to default to the API-backed provider when developing locally.

### Troubleshooting local setup
- Avoid `sudo npm install`; it can create permission issues with the Vite cache. If you already used sudo, remove the generated `node_modules` folder and rerun `npm install`.
- If you see `Outdated optimize dep` or permission errors for `node_modules/.vite`, delete any `node_modules/.vite` folder and restart with `npm run dev` (the Vite cache now lives in a project-local `.vite` directory).
- If you see `tsx: command not found`, the server dependencies were not installed. Run `npm run install:server` from the repo root.
- If port 8787 is already taken, set `FORGE_SERVER_PORT=8788` (or another open port) before running `npm run dev`. The Vite proxy will honor the same variable.
- If `npm ci` reports proxy-related 403 errors or hangs, clear any legacy proxy variables (`http-proxy`, `https-proxy`) and prefer uppercase `HTTP_PROXY` / `HTTPS_PROXY` or `npm_config_proxy` / `npm_config_https_proxy` set to the correct endpoint. The repo pins `registry=https://registry.npmjs.org/` in `.npmrc`; removing stale proxy/auth config avoids MaxListeners warnings during install.

## GitHub Pages
1) Push to main
2) Settings → Pages → Build and deployment → GitHub Actions
3) Workflow publishes automatically

## Import/Export
- Imports CJ-1.0/CJ-1.1 card JSON or CJ-FORGE-PROJECT-1.0 bundles; incoming cards are migrated to CJ-1.2 automatically.
- Exports CJ-1.2 card JSON and CJ-FORGE-PROJECT-1.0 (wrapping the CJ-1.2 card plus CJ-GRAPH-1.x layout metadata).
- Card + action libraries use distinct schemas:

| Library | Purpose | Schema | Storage key | Import/Export file name |
| --- | --- | --- | --- | --- |
| Card Library | Local deck/scenario card pool | CJ-CARD-LIB-1.0 | `CJ_CARD_LIBRARY_V1` | `cj_card_library.json` |
| Action Library | Ability/step/targeting snippets | CJ-ACTION-LIB-1.0 | `CJ_ACTION_LIBRARY` | `cj_action_library.json` |

## AI Image Generation (Builder)
- Supports OpenAI and Gemini providers via the AI Image modal.
- If a Proxy URL is configured, requests are POSTed there; otherwise the app calls the provider API directly with your supplied key using the modal request (prompt, size, negative prompt, references).
- Responses that contain a base64 data URL or image URL will automatically fill `visuals.cardImage` for the active card.
