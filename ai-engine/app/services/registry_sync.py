"""
Keeps the Qdrant face index in step with Django's person registry.

Each sync:
  * fetches /ingest/persons/ (active watchlist persons + open cases with a photo),
  * embeds any person whose photo is new or changed,
  * deletes points for persons that left the registry (removed, found, closed).

Runs periodically and on demand (Django calls POST /registry/sync after a
person is created, edited or changes status).
"""

from __future__ import annotations

import logging
import threading
import time

from app.database.qdrant_client import face_index, point_id
from app.services import django_client
from app.services.ai_engine import get_engine

logger = logging.getLogger("TAMBUA_REGISTRY_SYNC")

# A photo that failed (no face, download error) is retried after this long.
_FAILURE_RETRY_S = 600


class RegistrySync:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._failures: dict[str, tuple[float, str]] = {}  # photo_url -> (when, reason)
        self.last_sync_at: float | None = None
        self.last_error: str | None = None
        self.indexed = 0
        self.not_enrollable: list[dict] = []

    def sync(self) -> dict:
        # Serialize syncs; a second request while one runs just waits for it.
        with self._lock:
            return self._sync_locked()

    def _sync_locked(self) -> dict:
        try:
            persons = django_client.fetch_persons()
        except django_client.DjangoError as exc:
            self.last_error = str(exc)
            logger.warning("Registry sync skipped: %s", exc)
            return self.status()

        existing = face_index.indexed_subjects()
        wanted: set[str] = set()
        added = 0
        now = time.time()
        not_enrollable: list[dict] = []

        for person in persons:
            pid = point_id(person["subject_type"], person["subject_id"])
            wanted.add(pid)
            photo_url = person.get("photo_url") or ""
            current = existing.get(pid)
            if current and current.get("photo_url") == photo_url:
                if current.get("full_name") != person.get("full_name"):
                    # Name changed, photo did not: refresh the payload only.
                    face_index.client.set_payload(
                        collection_name=face_index.collection,
                        payload={"full_name": person.get("full_name") or ""},
                        points=[pid],
                    )
                continue

            failure = self._failures.get(photo_url)
            if failure and now - failure[0] < _FAILURE_RETRY_S:
                not_enrollable.append({**person, "reason": failure[1]})
                if current:
                    face_index.delete([pid])  # old photo must not keep matching
                continue

            try:
                embedding, quality = embed_photo_url(photo_url)
            except django_client.PhotoError as exc:
                self._failures[photo_url] = (now, str(exc))
                not_enrollable.append({**person, "reason": str(exc)})
                if current:
                    face_index.delete([pid])
                logger.warning("Cannot enroll %s %s: %s", person["subject_type"], person["subject_id"], exc)
                continue

            face_index.upsert(person, embedding, quality)
            self._failures.pop(photo_url, None)
            added += 1

        stale = [pid for pid in existing if pid not in wanted]
        face_index.delete(stale)

        self.indexed = face_index.count()
        self.not_enrollable = not_enrollable
        self.last_sync_at = time.time()
        self.last_error = None
        if added or stale:
            logger.info("Registry sync: %d enrolled, %d removed, %d indexed", added, len(stale), self.indexed)
        return self.status()

    def status(self) -> dict:
        return {
            "indexed": self.indexed,
            "last_sync_at": self.last_sync_at,
            "last_error": self.last_error,
            "not_enrollable": [
                {"subject_type": p["subject_type"], "subject_id": p["subject_id"], "full_name": p.get("full_name"), "reason": p["reason"]}
                for p in self.not_enrollable
            ],
        }


def embed_photo_url(photo_url: str) -> tuple[list[float], float]:
    """Download a stored photo and return (embedding, detection quality)."""
    raw = django_client.download_photo(photo_url)
    engine = get_engine()
    img = engine.decode(raw)
    if img is None:
        raise django_client.PhotoError("File is not a readable image.")
    face = engine.best_face(img)
    if face is None:
        raise django_client.PhotoError("No face was found in the photo.")
    return face["embedding"], round(face["det_score"], 4)


registry_sync = RegistrySync()
