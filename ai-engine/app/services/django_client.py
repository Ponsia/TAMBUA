"""
Calls from the AI engine into the Django backend.

Django owns persons, cameras, storage and the verification workflow; the
engine only reads the registry and reports candidate matches:

    GET  /ingest/persons/     every enrollable person (with a photo)
    GET  /ingest/cameras/     every ACTIVE camera
    POST /ingest/detections/  a candidate match + frame snapshot

All calls carry the shared X-AI-Engine-Key header.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

import requests

from app import config

logger = logging.getLogger("TAMBUA_DJANGO_CLIENT")

_session = requests.Session()


class DjangoError(RuntimeError):
    pass


def _headers() -> dict[str, str]:
    return {"X-AI-Engine-Key": config.AI_ENGINE_API_KEY}


def _get(path: str) -> dict:
    try:
        resp = _session.get(f"{config.DJANGO_BASE_URL}{path}", headers=_headers(), timeout=10)
    except requests.RequestException as exc:
        raise DjangoError(f"Django unreachable: {exc}") from exc
    if resp.status_code != 200:
        raise DjangoError(f"GET {path} -> HTTP {resp.status_code}: {resp.text[:200]}")
    return resp.json()


def fetch_persons() -> list[dict]:
    return list(_get("/ingest/persons/").get("persons", []))


def fetch_cameras() -> list[dict]:
    return list(_get("/ingest/cameras/").get("cameras", []))


def report_detection(
    *,
    camera_id: str,
    subject_type: str,
    subject_id: str,
    confidence_score: float,
    frame_jpeg: bytes,
    detected_at: datetime | None = None,
) -> dict:
    detected_at = detected_at or datetime.now(timezone.utc)
    data = {
        "camera_id": camera_id,
        "subject_type": subject_type,
        "subject_id": subject_id,
        "confidence_score": f"{confidence_score:.4f}",
        "detected_at": detected_at.isoformat(),
    }
    files = {"frame_snapshot": ("frame.jpg", frame_jpeg, "image/jpeg")}
    try:
        resp = _session.post(
            f"{config.DJANGO_BASE_URL}/ingest/detections/",
            headers=_headers(),
            data=data,
            files=files,
            timeout=15,
        )
    except requests.RequestException as exc:
        raise DjangoError(f"Django unreachable: {exc}") from exc
    if resp.status_code != 201:
        raise DjangoError(f"Detection rejected -> HTTP {resp.status_code}: {resp.text[:200]}")
    return resp.json()


# ----------------------------------------------------------------------
# Photo download (restricted to the configured storage prefixes)
# ----------------------------------------------------------------------
class PhotoError(ValueError):
    pass


def photo_url_allowed(url: str) -> bool:
    return any(url.startswith(prefix) for prefix in config.PHOTO_URL_ALLOWED_PREFIXES)


def download_photo(url: str) -> bytes:
    if not url or not photo_url_allowed(url):
        raise PhotoError("Photo URL is not in the TAMBUA media store.")
    try:
        with _session.get(url, timeout=15, stream=True) as resp:
            if resp.status_code != 200:
                raise PhotoError(f"Photo download failed (HTTP {resp.status_code}).")
            chunks: list[bytes] = []
            size = 0
            for chunk in resp.iter_content(64 * 1024):
                size += len(chunk)
                if size > config.PHOTO_MAX_BYTES:
                    raise PhotoError("Photo is too large.")
                chunks.append(chunk)
            return b"".join(chunks)
    except requests.RequestException as exc:
        raise PhotoError(f"Photo download failed: {exc}") from exc
