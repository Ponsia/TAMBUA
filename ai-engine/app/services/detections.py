"""
Turns high-confidence matches into Alerts / Sightings in Django.

Shared by the camera workers and the /ws/stream endpoint. A given person on a
given camera is reported at most once per DETECTION_COOLDOWN_S so a person
standing in front of a camera creates one pending review, not hundreds.
"""

from __future__ import annotations

import logging
import threading
import time

import cv2
import numpy as np

from app import config
from app.services import django_client

logger = logging.getLogger("TAMBUA_DETECTIONS")


class DetectionReporter:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._last_reported: dict[tuple[str, str, str], float] = {}
        self.reported_total = 0
        self.last_error: str | None = None

    def _claim(self, camera_id: str, subject_type: str, subject_id: str) -> bool:
        key = (camera_id, subject_type, subject_id)
        now = time.monotonic()
        with self._lock:
            last = self._last_reported.get(key)
            if last is not None and now - last < config.DETECTION_COOLDOWN_S:
                return False
            self._last_reported[key] = now
            return True

    def _release(self, camera_id: str, subject_type: str, subject_id: str) -> None:
        with self._lock:
            self._last_reported.pop((camera_id, subject_type, subject_id), None)

    def maybe_report(self, camera_id: str, img: np.ndarray, bbox: list[int], match: dict) -> bool:
        """Report the match if it is strong enough and not in cooldown. Blocking."""
        if match["confidence_score"] < config.FACE_REPORT_THRESHOLD:
            return False
        subject_type, subject_id = match["subject_type"], match["subject_id"]
        if not subject_type or not subject_id:
            return False
        if not self._claim(camera_id, subject_type, subject_id):
            return False

        try:
            django_client.report_detection(
                camera_id=camera_id,
                subject_type=subject_type,
                subject_id=subject_id,
                confidence_score=match["confidence_score"],
                frame_jpeg=annotated_jpeg(img, bbox),
            )
        except django_client.DjangoError as exc:
            # Let the next frame try again instead of silently dropping it.
            self._release(camera_id, subject_type, subject_id)
            self.last_error = str(exc)
            logger.warning("Could not report detection: %s", exc)
            return False

        self.reported_total += 1
        self.last_error = None
        logger.info(
            "Reported %s %s (%s) on camera %s at %.2f",
            subject_type, subject_id, match.get("full_name"), camera_id, match["confidence_score"],
        )
        return True


def annotated_jpeg(img: np.ndarray, bbox: list[int]) -> bytes:
    """Full frame with the matched face outlined, as evidence for the reviewer."""
    frame = img.copy()
    x1, y1, x2, y2 = bbox
    cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 200, 255), 2)
    ok, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 88])
    if not ok:
        raise django_client.DjangoError("Could not encode frame snapshot")
    return buf.tobytes()


reporter = DetectionReporter()
