"""
Qdrant index of enrolled faces.

One point per Django subject (WatchlistPerson or MissingPersonCase). The
point id is derived from (subject_type, subject_id), and the payload carries
exactly what Django's /ingest/persons/ registry returned, so the index is a
pure function of the Django database and can be rebuilt at any time.
"""

from __future__ import annotations

import logging
import threading
import uuid

from qdrant_client import QdrantClient
from qdrant_client.models import Distance, PointIdsList, PointStruct, QueryRequest, VectorParams

from app import config

logger = logging.getLogger("TAMBUA_VECTOR_DB")

VECTOR_SIZE = 512  # ArcFace (buffalo_l)
_POINT_NAMESPACE = uuid.UUID("5b0f1c2e-7d0a-4a4e-9a51-0c1f8f3b6a11")


def point_id(subject_type: str, subject_id: str) -> str:
    return str(uuid.uuid5(_POINT_NAMESPACE, f"{subject_type}:{subject_id}"))


def _similarity_to_confidence(score: float) -> float:
    return round(max(0.0, min(1.0, float(score))), 4)


class FaceIndex:
    def __init__(self) -> None:
        self.client = QdrantClient(host=config.QDRANT_HOST, port=config.QDRANT_PORT, timeout=10)
        self.collection = config.QDRANT_COLLECTION
        self._ready = False
        self._lock = threading.Lock()

    def ensure_collection(self) -> None:
        with self._lock:
            if self._ready:
                return
            if not self.client.collection_exists(self.collection):
                self.client.create_collection(
                    collection_name=self.collection,
                    vectors_config=VectorParams(size=VECTOR_SIZE, distance=Distance.COSINE),
                )
                logger.info("Created Qdrant collection %r", self.collection)
            self._ready = True

    def ping(self) -> bool:
        try:
            self.client.get_collections()
            return True
        except Exception:
            return False

    def count(self) -> int:
        self.ensure_collection()
        return self.client.count(collection_name=self.collection, exact=True).count

    # ------------------------------------------------------------------
    # Registry maintenance
    # ------------------------------------------------------------------
    def indexed_subjects(self) -> dict[str, dict]:
        """point_id -> payload for every indexed face."""
        self.ensure_collection()
        result: dict[str, dict] = {}
        offset = None
        while True:
            points, offset = self.client.scroll(
                collection_name=self.collection,
                limit=256,
                offset=offset,
                with_payload=True,
                with_vectors=False,
            )
            for p in points:
                result[str(p.id)] = p.payload or {}
            if offset is None:
                return result

    def upsert(self, person: dict, embedding: list[float], quality: float) -> None:
        self.ensure_collection()
        payload = {
            "subject_type": person["subject_type"],
            "subject_id": person["subject_id"],
            "full_name": person.get("full_name") or "",
            "photo_url": person.get("photo_url") or "",
            "quality_score": quality,
        }
        self.client.upsert(
            collection_name=self.collection,
            points=[
                PointStruct(
                    id=point_id(person["subject_type"], person["subject_id"]),
                    vector=embedding,
                    payload=payload,
                )
            ],
            wait=True,
        )

    def delete(self, point_ids: list[str]) -> None:
        if not point_ids:
            return
        self.ensure_collection()
        self.client.delete(
            collection_name=self.collection,
            points_selector=PointIdsList(points=point_ids),
            wait=True,
        )

    # ------------------------------------------------------------------
    # Search
    # ------------------------------------------------------------------
    def search_many(self, embeddings: list[list[float]], threshold: float) -> list[dict | None]:
        """Best match (or None) for each embedding, in input order."""
        if not embeddings:
            return []
        self.ensure_collection()
        responses = self.client.query_batch_points(
            collection_name=self.collection,
            requests=[
                QueryRequest(query=emb, limit=1, score_threshold=threshold, with_payload=True)
                for emb in embeddings
            ],
        )
        matches: list[dict | None] = []
        for response in responses:
            points = response.points or []
            if not points:
                matches.append(None)
                continue
            best = points[0]
            payload = best.payload or {}
            matches.append(
                {
                    "subject_type": payload.get("subject_type"),
                    "subject_id": payload.get("subject_id"),
                    "full_name": payload.get("full_name"),
                    "photo_url": payload.get("photo_url"),
                    "confidence_score": _similarity_to_confidence(best.score),
                }
            )
        return matches

    def search_one(self, embedding: list[float], threshold: float) -> dict | None:
        return self.search_many([embedding], threshold)[0]


face_index = FaceIndex()
