"""
TAMBUA AI engine — face recognition service for the Django backend.

HTTP (service-to-service, X-AI-Engine-Key):
    POST /embed           {photo_url} -> embedding for enrollFace
    POST /search          {photo_url} -> best registry match for searchByPhoto
    POST /registry/sync   re-read /ingest/persons/ now (called after person edits)
    POST /cameras/sync    re-read /ingest/cameras/ now (called after camera edits)

HTTP (browser, Bearer JWT issued by Django):
    GET  /status          registry, camera worker and OBS state

WebSocket (browser, ?token=<JWT>[&camera_id=<ACTIVE camera id>]):
    /ws/stream            JPEG frames in, face boxes + matches out. With a
                          camera_id, strong matches are reported to Django as
                          pending Alerts/Sightings.

GET /health is public and dependency-aware.
"""

from __future__ import annotations

import asyncio
import hmac
import logging
from contextlib import asynccontextmanager

import jwt
from fastapi import Depends, FastAPI, Header, HTTPException, WebSocket, WebSocketDisconnect, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from app import config
from app.database.qdrant_client import face_index
from app.services import django_client, obs
from app.services.ai_engine import get_engine
from app.services.camera_workers import camera_manager
from app.services.detections import reporter
from app.services.registry_sync import embed_photo_url, registry_sync

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("TAMBUA_MAIN_API")
# Per-request client logs would drown the engine's own messages.
logging.getLogger("httpx").setLevel(logging.WARNING)
# obsws-python logs a full traceback on every failed connect while OBS is closed.
logging.getLogger("obsws_python").setLevel(logging.CRITICAL)


# ----------------------------------------------------------------------
# Browser connections (for OBS source broadcasts)
# ----------------------------------------------------------------------
class ConnectionManager:
    def __init__(self) -> None:
        self.active: set[WebSocket] = set()

    async def broadcast(self, message: dict) -> None:
        for ws in list(self.active):
            try:
                await ws.send_json(message)
            except Exception:
                self.active.discard(ws)


manager = ConnectionManager()

# Strong references so fire-and-forget tasks are not garbage-collected mid-run.
_background_tasks: set[asyncio.Task] = set()


def run_in_background(coro) -> None:
    task = asyncio.create_task(coro)
    _background_tasks.add(task)
    task.add_done_callback(_background_tasks.discard)


async def _periodic(name: str, interval: float, fn) -> None:
    while True:
        try:
            await asyncio.to_thread(fn)
        except Exception:
            logger.exception("%s failed", name)
        await asyncio.sleep(interval)


@asynccontextmanager
async def lifespan(app: FastAPI):
    if not config.AI_ENGINE_API_KEY:
        logger.error("AI_ENGINE_API_KEY is not set: Django calls will be rejected.")
    if not config.JWT_SECRET:
        logger.error("JWT_SECRET is not set: browser WebSocket/status calls will be rejected.")

    await asyncio.to_thread(get_engine)  # load the model before serving
    try:
        await asyncio.to_thread(face_index.ensure_collection)
    except Exception:
        logger.exception("Qdrant is not reachable yet; registry sync will retry.")

    tasks = [
        asyncio.create_task(_periodic("registry sync", config.REGISTRY_SYNC_INTERVAL_S, registry_sync.sync)),
        asyncio.create_task(_periodic("camera sync", config.CAMERA_SYNC_INTERVAL_S, camera_manager.sync)),
        asyncio.create_task(obs.obs_poll_loop(manager.broadcast)),
    ]
    logger.info("TAMBUA AI engine started")
    try:
        yield
    finally:
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        camera_manager.stop_all()
        logger.info("TAMBUA AI engine stopped")


app = FastAPI(title="TAMBUA AI Engine", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET"],
    allow_headers=["Authorization"],
)


# ----------------------------------------------------------------------
# Auth
# ----------------------------------------------------------------------
def require_service_key(x_ai_engine_key: str = Header(default="")) -> None:
    expected = config.AI_ENGINE_API_KEY
    if not expected or not hmac.compare_digest(x_ai_engine_key, expected):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid or missing AI engine API key.")


def decode_user_token(token: str) -> dict | None:
    if not token or not config.JWT_SECRET:
        return None
    try:
        return jwt.decode(
            token, config.JWT_SECRET, algorithms=[config.JWT_ALGORITHM], options={"require": ["exp", "sub"]}
        )
    except jwt.PyJWTError:
        return None


def require_user(authorization: str = Header(default="")) -> dict:
    token = authorization[len("Bearer "):].strip() if authorization.startswith("Bearer ") else ""
    claims = decode_user_token(token)
    if claims is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Sign in again.")
    return claims


# ----------------------------------------------------------------------
# Health / status
# ----------------------------------------------------------------------
@app.get("/health")
async def health() -> dict:
    qdrant_ok = await asyncio.to_thread(face_index.ping)
    return {
        "status": "ok" if qdrant_ok else "degraded",
        "device": get_engine().device,
        "components": {
            "model": "ok",
            "qdrant": "ok" if qdrant_ok else "error",
            "django_registry": "error" if registry_sync.last_error else "ok",
        },
        "indexed_faces": registry_sync.indexed,
    }


@app.get("/status")
async def engine_status(_: dict = Depends(require_user)) -> dict:
    return {
        "device": get_engine().device,
        "registry": registry_sync.status(),
        "cameras": camera_manager.status(),
        "obs_sources": obs.latest_sources,
        "detections_reported": reporter.reported_total,
        "report_error": reporter.last_error,
        "thresholds": {"match": config.FACE_MATCH_THRESHOLD, "report": config.FACE_REPORT_THRESHOLD},
    }


# ----------------------------------------------------------------------
# Service API used by Django
# ----------------------------------------------------------------------
class PhotoRequest(BaseModel):
    photo_url: str


@app.post("/embed", dependencies=[Depends(require_service_key)])
async def embed(body: PhotoRequest) -> dict:
    try:
        vector, quality = await asyncio.to_thread(embed_photo_url, body.photo_url)
    except django_client.PhotoError as exc:
        return {"found": False, "reason": str(exc)}
    return {"found": True, "vector": vector, "quality_score": quality}


@app.post("/search", dependencies=[Depends(require_service_key)])
async def search(body: PhotoRequest) -> dict:
    try:
        vector, _ = await asyncio.to_thread(embed_photo_url, body.photo_url)
    except django_client.PhotoError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    match = await asyncio.to_thread(face_index.search_one, vector, config.FACE_MATCH_THRESHOLD)
    if match is None:
        return {"found": False}
    return {"found": True, **match}


@app.post("/registry/sync", status_code=202, dependencies=[Depends(require_service_key)])
async def trigger_registry_sync() -> dict:
    run_in_background(asyncio.to_thread(registry_sync.sync))
    return {"queued": True}


@app.post("/cameras/sync", status_code=202, dependencies=[Depends(require_service_key)])
async def trigger_camera_sync() -> dict:
    run_in_background(asyncio.to_thread(camera_manager.sync))
    return {"queued": True}


# ----------------------------------------------------------------------
# Live stream from the investigator's browser
# ----------------------------------------------------------------------
class IoUTracker:
    """Stable track_id per face across frames, from bbox overlap."""

    def __init__(self, iou_threshold: float = 0.3, max_age: int = 10) -> None:
        self.iou_threshold = iou_threshold
        self.max_age = max_age
        self.next_id = 1
        self.tracks: dict[int, dict] = {}

    @staticmethod
    def _iou(a: list, b: list) -> float:
        ix1, iy1 = max(a[0], b[0]), max(a[1], b[1])
        ix2, iy2 = min(a[2], b[2]), min(a[3], b[3])
        inter = max(0.0, ix2 - ix1) * max(0.0, iy2 - iy1)
        union = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter
        return inter / union if union > 0 else 0.0

    def update(self, bboxes: list[list[int]]) -> list[int]:
        for track in self.tracks.values():
            track["age"] += 1
        ids: list[int] = []
        used: set[int] = set()
        for bbox in bboxes:
            best_id, best_iou = None, self.iou_threshold
            for tid, track in self.tracks.items():
                if tid in used:
                    continue
                iou = self._iou(bbox, track["bbox"])
                if iou > best_iou:
                    best_id, best_iou = tid, iou
            if best_id is None:
                best_id = self.next_id
                self.next_id += 1
            self.tracks[best_id] = {"bbox": bbox, "age": 0}
            used.add(best_id)
            ids.append(best_id)
        for tid in [t for t, track in self.tracks.items() if track["age"] > self.max_age]:
            del self.tracks[tid]
        return ids


def _analyse_frame(frame_bytes: bytes) -> tuple[object, list[dict], list[dict | None]]:
    engine = get_engine()
    img = engine.decode(frame_bytes)
    if img is None:
        return None, [], []
    faces = engine.analyze(img)
    matches = face_index.search_many([f["embedding"] for f in faces], config.FACE_MATCH_THRESHOLD) if faces else []
    return img, faces, matches


@app.websocket("/ws/stream")
async def video_stream(websocket: WebSocket) -> None:
    origin = websocket.headers.get("origin")
    if origin and origin not in config.CORS_ALLOWED_ORIGINS:
        await websocket.close(code=1008, reason="Origin not allowed")  # handshake refused
        return
    await websocket.accept()
    # Close with an application code (after accepting) so the browser can tell
    # an expired session apart from a network failure and stop reconnecting.
    if decode_user_token(websocket.query_params.get("token", "")) is None:
        await websocket.close(code=4401, reason="Unauthorized")
        return

    camera_id = websocket.query_params.get("camera_id") or None
    if camera_id and not camera_manager.is_active_camera(camera_id):
        await websocket.send_json(
            {"event": "ERROR", "message": "The selected camera is not ACTIVE; detections will not be reported."}
        )
        camera_id = None

    manager.active.add(websocket)
    await websocket.send_json({"event": "OBS_SOURCES", "phones": obs.latest_sources, "count": len(obs.latest_sources)})
    tracker = IoUTracker()

    async def report(img, bbox: list[int], match: dict) -> None:
        if await asyncio.to_thread(reporter.maybe_report, camera_id, img, bbox, match):
            try:
                await websocket.send_json(
                    {
                        "event": "DETECTION_REPORTED",
                        "subject_type": match["subject_type"],
                        "subject_id": match["subject_id"],
                        "full_name": match.get("full_name"),
                        "confidence_score": match["confidence_score"],
                    }
                )
            except Exception:
                pass

    try:
        while True:
            message = await websocket.receive()
            if message.get("type") == "websocket.disconnect":
                break
            frame = message.get("bytes")
            if not frame:
                continue

            img, faces, matches = await asyncio.to_thread(_analyse_frame, frame)
            if img is None:
                await websocket.send_json({"event": "STREAM_FRAME_UPDATE", "faces": [], "count": 0})
                continue

            track_ids = tracker.update([f["bbox"] for f in faces])
            payload_faces = []
            for face, match, track_id in zip(faces, matches, track_ids):
                entry = {
                    "track_id": track_id,
                    "bbox": face["bbox"],
                    "landmarks": face["landmarks"],
                    "is_matched": match is not None,
                    "confidence_score": match["confidence_score"] if match else 0.0,
                    "subject_type": match["subject_type"] if match else None,
                    "subject_id": match["subject_id"] if match else None,
                    "full_name": match["full_name"] if match else None,
                    "photo_url": match["photo_url"] if match else None,
                }
                payload_faces.append(entry)
                if match and camera_id:
                    run_in_background(report(img, face["bbox"], match))

            await websocket.send_json(
                {
                    "event": "STREAM_FRAME_UPDATE",
                    "count": len(payload_faces),
                    "frame_width": int(img.shape[1]),
                    "frame_height": int(img.shape[0]),
                    "faces": payload_faces,
                }
            )
    except WebSocketDisconnect:
        pass
    except Exception:
        logger.exception("Stream loop error")
    finally:
        manager.active.discard(websocket)
