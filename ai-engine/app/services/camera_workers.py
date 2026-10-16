"""
Server-side camera processing.

For every ACTIVE camera registered in Django whose stream_source OpenCV can
open (rtsp://, rtmp://, http(s):// streams, a local video file, or a device
index such as "0"), a worker:
  1. reads frames continuously (so the newest frame is always at hand),
  2. analyses the newest frame every CAMERA_PROCESS_INTERVAL_S,
  3. matches faces against the index and reports strong matches to Django.

The camera list is re-read from Django periodically and on POST /cameras/sync.
Cameras whose source is the investigator's browser (stream_source "browser"
or "webcam") are fed through /ws/stream instead and get no worker here.
"""

from __future__ import annotations

import logging
import threading
import time

import cv2
import numpy as np

from app import config
from app.database.qdrant_client import face_index
from app.services import django_client
from app.services.ai_engine import get_engine
from app.services.detections import reporter

logger = logging.getLogger("TAMBUA_CAMERAS")

BROWSER_SOURCES = {"browser", "webcam", "browser:webcam", "browser:obs"}


def is_browser_source(source: str) -> bool:
    return (source or "").strip().lower() in BROWSER_SOURCES


def _capture_target(source: str):
    source = source.strip()
    return int(source) if source.isdigit() else source


class CameraWorker:
    def __init__(self, camera: dict) -> None:
        self.camera = camera
        self.camera_id = str(camera["id"])
        self.source = camera["stream_source"]
        self.state = "starting"
        self.error: str | None = None
        self.frames_analysed = 0
        self.last_frame_at: float | None = None
        self._stop = threading.Event()
        self._frame: np.ndarray | None = None
        self._frame_lock = threading.Lock()
        self._reader = threading.Thread(target=self._read_loop, name=f"cam-read-{self.camera_id[:8]}", daemon=True)
        self._analyser = threading.Thread(target=self._analyse_loop, name=f"cam-ai-{self.camera_id[:8]}", daemon=True)

    def start(self) -> None:
        self._reader.start()
        self._analyser.start()

    def stop(self) -> None:
        self._stop.set()

    # ------------------------------------------------------------------
    def _read_loop(self) -> None:
        backoff = 2.0
        while not self._stop.is_set():
            cap = cv2.VideoCapture(_capture_target(self.source))
            if not cap.isOpened():
                self.state, self.error = "unreachable", f"Cannot open stream source {self.source!r}"
                cap.release()
                self._stop.wait(backoff)
                backoff = min(backoff * 2, 60.0)
                continue

            self.state, self.error, backoff = "streaming", None, 2.0
            is_file = not str(self.source).isdigit() and "://" not in self.source
            fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
            while not self._stop.is_set():
                ok, frame = cap.read()
                if not ok or frame is None:
                    if is_file:  # loop recorded footage
                        cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                        continue
                    self.state, self.error = "unreachable", "Stream stopped delivering frames"
                    break
                with self._frame_lock:
                    self._frame = frame
                self.last_frame_at = time.time()
                if is_file:  # play files at their native speed
                    time.sleep(1.0 / max(fps, 1.0))
            cap.release()
            self._stop.wait(backoff)

    def _analyse_loop(self) -> None:
        engine = None
        while not self._stop.wait(config.CAMERA_PROCESS_INTERVAL_S):
            with self._frame_lock:
                frame, self._frame = self._frame, None
            if frame is None:
                continue
            try:
                engine = engine or get_engine()
                faces = engine.analyze(frame)
                self.frames_analysed += 1
                if not faces:
                    continue
                matches = face_index.search_many([f["embedding"] for f in faces], config.FACE_MATCH_THRESHOLD)
                for face, match in zip(faces, matches):
                    if match:
                        reporter.maybe_report(self.camera_id, frame, face["bbox"], match)
            except Exception:
                logger.exception("Camera %s analysis failed", self.camera_id)

    def status(self) -> dict:
        return {
            "camera_id": self.camera_id,
            "name": self.camera.get("name"),
            "stream_source": self.source,
            "state": self.state,
            "error": self.error,
            "frames_analysed": self.frames_analysed,
            "last_frame_at": self.last_frame_at,
        }


class CameraManager:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self.workers: dict[str, CameraWorker] = {}
        self.cameras: dict[str, dict] = {}  # every ACTIVE camera, incl. browser-fed
        self.last_error: str | None = None

    def sync(self) -> dict:
        try:
            cameras = django_client.fetch_cameras()
        except django_client.DjangoError as exc:
            self.last_error = str(exc)
            logger.warning("Camera sync skipped: %s", exc)
            return self.status()

        with self._lock:
            self.cameras = {str(c["id"]): c for c in cameras}
            self.last_error = None
            if not config.CAMERA_WORKERS_ENABLED:
                return self._status_locked()

            wanted = {
                cid: cam for cid, cam in self.cameras.items()
                if cam.get("stream_source") and not is_browser_source(cam["stream_source"])
            }
            for cid, worker in list(self.workers.items()):
                if cid not in wanted or wanted[cid]["stream_source"] != worker.source:
                    worker.stop()
                    del self.workers[cid]
                    logger.info("Stopped camera worker %s", cid)
            for cid, cam in wanted.items():
                if cid not in self.workers:
                    worker = CameraWorker(cam)
                    self.workers[cid] = worker
                    worker.start()
                    logger.info("Started camera worker %s (%s)", cid, cam["stream_source"])
            return self._status_locked()

    def is_active_camera(self, camera_id: str) -> bool:
        return camera_id in self.cameras

    def stop_all(self) -> None:
        with self._lock:
            for worker in self.workers.values():
                worker.stop()
            self.workers.clear()

    def status(self) -> dict:
        with self._lock:
            return self._status_locked()

    def _status_locked(self) -> dict:
        return {
            "active_cameras": len(self.cameras),
            "workers": [w.status() for w in self.workers.values()],
            "browser_cameras": [
                {"camera_id": cid, "name": cam.get("name")}
                for cid, cam in self.cameras.items()
                if is_browser_source(cam.get("stream_source", ""))
            ],
            "last_error": self.last_error,
        }


camera_manager = CameraManager()
