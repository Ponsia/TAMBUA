# TAMBUA

Angular frontend for the TAMBUA GraphQL API.

## Run locally

Requires Node 22 (`nvm use` reads `.nvmrc`).

```sh
npm ci
npm start
```

Open `http://localhost:4200`. The development proxy forwards `/graphql/`, `/uploads/`, `/exports/` and `/health/` to the Django backend on `http://localhost:8000`. The camera preview connects to the AI engine on `http://localhost:8001`. See the repository README for starting the backend and the engine.

API paths are centralized in `src/app/core/config/api.config.ts`.

## Production

```sh
npm run build
```

Serve `dist/TAMBUA/browser`. The Angular development proxy is not included in this build. Configure the production web server to proxy `/graphql/`, `/uploads/`, `/exports/` and `/health/` to the backend, and set `aiEngineUrl` in `api.config.ts` to the engine's public URL. Other application routes must fall back to `index.html`.

Alternatively, override `API_CONFIG` in `app.config.ts` with absolute backend URLs and configure backend CORS for the frontend origin. An HTTPS frontend requires HTTPS media and API URLs; configure `backendUrl` accordingly.

## Verification

```sh
npm test -- --watch=false
npm run build
```

See [API integration details](docs/backend-integration.md) for supported workflows and current server limitations.
