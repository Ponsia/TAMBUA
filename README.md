# e-TAMBUA

Face-recognition support for watchlist and missing-person investigations.
Everything runs locally.

```
 Angular client (4200) ──/graphql, /uploads, /exports──▶ Django backend (8000) ──▶ PostgreSQL (5432)
        │                                                   │   ▲                 └▶ MinIO (9000)
        │ ws /ws/stream, GET /status (JWT)                  │   │ /ingest/* (X-AI-Engine-Key)
        └──────────────────────────────▶ AI engine (8001) ◀─┘   │
                     /embed, /search, /registry/sync ───────────┘
                                         │
                                         ├▶ Qdrant (6333)   face index
                                         └▶ camera streams  (RTSP/HTTP/files, MediaMTX 8554)
```

| Part | Folder | Responsibility |
| --- | --- | --- |
| Backend | `server/backend` | Source of truth: users, roles, persons, cases, cameras, alerts, sightings, audit log, file storage (MinIO). GraphQL API for the client; `/ingest/*` endpoints for the AI engine. |
| AI engine | `ai-engine` | Service only (no UI). InsightFace detection/recognition, Qdrant face index synced from Django, camera workers, browser live-stream analysis. Reports candidate matches to Django as pending alerts/sightings. |
| Client | `client` | Angular app for the three roles (system owner admin, watchlist manager, investigator). |

## How recognition works

1. A watchlist manager adds a person or case with a photo. The photo is stored in MinIO through Django, and the face is enrolled (`enrollFace`).
2. Django notifies the engine, which re-reads `/ingest/persons/` (active watchlist entries and open cases) and updates the Qdrant index. Removed persons and found/closed cases leave the index. The engine also re-syncs every 30 s.
3. Every ACTIVE camera whose stream source OpenCV can open (`rtsp://…`, `http://…`, a device number such as `0`, or a video file) gets a server-side worker. Strong matches (≥ `FACE_REPORT_THRESHOLD`) become pending alerts (watchlist) or sightings (cases) with a frame snapshot; the same person on the same camera is reported at most once per minute.
4. Cameras with stream source `browser` are fed from the investigator's Camera Preview page (webcam or OBS Virtual Camera) over `/ws/stream`.
5. Watchlist managers confirm or reject each detection; confirmed ones form the movement timeline.
6. Photo search uploads the photo and asks the engine for the closest enrolled face; every search is logged.

## Requirements

- PostgreSQL 16 with the `pgvector` extension available (`CREATE EXTENSION vector` runs in the migrations), database `tambua`.
- Docker (MinIO, Qdrant, MediaMTX).
- Python 3.12.
- Node 22 (`nvm install 22`; Angular 22 does not run on older versions).

## First-time setup

```sh
# Infrastructure
cd server && docker compose up -d && cd ..        # MinIO + bucket tambua-media (public read)
cd ai-engine && docker compose up -d && cd ..     # Qdrant + MediaMTX

# Backend
cd server
python3 -m venv venv && venv/bin/pip install -r backend/requirements.txt
cp backend/.env.example backend/.env              # then set DB_PASSWORD and the shared secrets
cd backend && ../venv/bin/python manage.py migrate
../venv/bin/python manage.py createsuperuser      # system owner admin
cd ../..

# AI engine
cd ai-engine
python3 -m venv venv && venv/bin/pip install -r requirements.txt
cp .env.example .env                              # AI_ENGINE_API_KEY and JWT_SECRET must equal the backend's
cd ..

# Client
cd client && nvm use && npm ci && cd ..
```

`AI_ENGINE_API_KEY` and `JWT_SECRET` must be identical in `server/backend/.env` and `ai-engine/.env`: the engine authenticates Django with the key and verifies the officers' login tokens with the secret. Generate them with `python3 -c "import secrets; print(secrets.token_urlsafe(48))"`.

The first engine start downloads the InsightFace `buffalo_l` model (~280 MB) to `~/.insightface/models`. The engine uses the GPU when `onnxruntime-gpu` and CUDA are installed and falls back to CPU otherwise.

## Run

Three terminals:

```sh
cd server/backend && ../venv/bin/python manage.py runserver 127.0.0.1:8000
cd ai-engine && venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8001
cd client && nvm use && npm start                 # http://localhost:4200
```

Health: `http://localhost:8000/health/ready/` and `http://localhost:8001/health`.

## Cameras

Register cameras as the admin (Cameras page). The stream source is what the engine reads:

- IP camera: `rtsp://user:pass@192.168.1.20:554/stream1`
- Phone through OBS: push OBS to `rtmp://127.0.0.1:1935/live` with stream key `obs`, then use `rtsp://127.0.0.1:8554/live/obs`
- USB webcam on the engine machine: `0`
- Recorded footage: an absolute file path (played in a loop)
- The investigator's browser feed: `browser`

Only ACTIVE cameras are processed.

## Tests

```sh
cd client && npm test -- --watch=false && npm run build
cd server/backend && ../venv/bin/python manage.py check
```
