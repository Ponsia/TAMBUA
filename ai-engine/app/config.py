"""
Central configuration for the TAMBUA AI engine.

Every value is read from the environment (optionally via ai-engine/.env) so
the same code runs locally and in a deployment. Defaults match the local
setup described in README.md.
"""

from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

PROJECT_ROOT = Path(__file__).resolve().parents[1]
load_dotenv(PROJECT_ROOT / ".env")


def _bool(name: str, default: bool) -> bool:
    return os.getenv(name, str(default)).strip().lower() in {"1", "true", "yes", "on"}


def _list(name: str, default: str) -> list[str]:
    return [item.strip() for item in os.getenv(name, default).split(",") if item.strip()]


# --- Django backend (source of truth for persons, cameras, detections) -------
DJANGO_BASE_URL = os.getenv("DJANGO_BASE_URL", "http://localhost:8000").rstrip("/")
# Shared secret: sent to Django on /ingest/* calls and required from Django on
# /embed, /search and /registry/sync.
AI_ENGINE_API_KEY = os.getenv("AI_ENGINE_API_KEY", "")

# Must equal Django's JWT_SECRET so browser tokens can be verified on /ws/stream.
JWT_SECRET = os.getenv("JWT_SECRET", "")
JWT_ALGORITHM = "HS256"

# Browser origins allowed to call the engine (camera preview page).
CORS_ALLOWED_ORIGINS = _list("CORS_ALLOWED_ORIGINS", "http://localhost:4200,http://127.0.0.1:4200")

# --- Face model ---------------------------------------------------------------
# auto: use CUDA when onnxruntime-gpu + a GPU are present, otherwise CPU.
AI_DEVICE = os.getenv("AI_DEVICE", "auto").strip().lower()
FACE_MODEL_NAME = os.getenv("FACE_MODEL_NAME", "buffalo_l")
FACE_DET_SIZE = int(os.getenv("FACE_DET_SIZE", "640"))
# Faces the detector is less sure about than this are ignored.
FACE_MIN_DET_SCORE = float(os.getenv("FACE_MIN_DET_SCORE", "0.5"))

# Cosine-similarity thresholds (ArcFace): 0.5+ very confident, 0.4 moderate.
# MATCH: shown as a match in live preview / photo search.
# REPORT: high enough to raise an Alert/Sighting for human verification.
FACE_MATCH_THRESHOLD = float(os.getenv("FACE_MATCH_THRESHOLD", "0.40"))
FACE_REPORT_THRESHOLD = float(os.getenv("FACE_REPORT_THRESHOLD", "0.45"))

# --- Vector index -------------------------------------------------------------
QDRANT_HOST = os.getenv("QDRANT_HOST", "localhost")
QDRANT_PORT = int(os.getenv("QDRANT_PORT", "6333"))
QDRANT_COLLECTION = os.getenv("QDRANT_COLLECTION", "tambua_faces")

# --- Photo downloads ----------------------------------------------------------
# Photos are only fetched from these URL prefixes (MinIO bucket served to
# Django). Prevents the engine being used to fetch arbitrary URLs.
PHOTO_URL_ALLOWED_PREFIXES = _list(
    "PHOTO_URL_ALLOWED_PREFIXES",
    "http://localhost:9000/tambua-media/,http://127.0.0.1:9000/tambua-media/",
)
PHOTO_MAX_BYTES = int(os.getenv("PHOTO_MAX_BYTES", str(10 * 1024 * 1024)))

# --- Background loops ---------------------------------------------------------
REGISTRY_SYNC_INTERVAL_S = float(os.getenv("REGISTRY_SYNC_INTERVAL_S", "30"))
CAMERA_SYNC_INTERVAL_S = float(os.getenv("CAMERA_SYNC_INTERVAL_S", "30"))
# How often each camera worker analyses its newest frame.
CAMERA_PROCESS_INTERVAL_S = float(os.getenv("CAMERA_PROCESS_INTERVAL_S", "0.5"))
# Same person on the same camera is reported at most once per cooldown.
DETECTION_COOLDOWN_S = float(os.getenv("DETECTION_COOLDOWN_S", "60"))
CAMERA_WORKERS_ENABLED = _bool("CAMERA_WORKERS_ENABLED", True)

# --- OBS discovery (optional) -------------------------------------------------
OBS_ENABLED = _bool("OBS_ENABLED", True)
OBS_HOST = os.getenv("OBS_HOST", "localhost")
OBS_PORT = int(os.getenv("OBS_PORT", "4455"))
OBS_PASSWORD = os.getenv("OBS_PASSWORD", "")
OBS_POLL_INTERVAL_S = float(os.getenv("OBS_POLL_INTERVAL_S", "3"))
