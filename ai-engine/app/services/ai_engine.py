"""
InsightFace wrapper: face detection, 512-D ArcFace embeddings and landmarks.

Runs on CUDA when available (AI_DEVICE=auto|cuda) and on CPU otherwise, so
the engine starts on any machine. All inference is serialized with a lock
because an ONNX Runtime session must not be entered from several threads at
once (camera workers, WebSocket clients and HTTP requests share it).
"""

from __future__ import annotations

import logging
import os
import sys
import threading
import warnings

import cv2
import numpy as np

from app import config

logger = logging.getLogger("TAMBUA_AI_ENGINE")

# InsightFace 0.7.3 calls a scikit-image API deprecated in newer releases.
warnings.filterwarnings("ignore", category=FutureWarning, module="insightface")

# Windows only: make CUDA/cuDNN DLLs from the venv or the CUDA toolkit visible
# before ONNX Runtime loads. No-op on Linux/macOS.
if os.name == "nt":  # pragma: no cover - platform specific
    for _dll_dir in (
        os.path.join(sys.prefix, "Lib", "site-packages", "nvidia", "cudnn", "bin"),
        os.environ.get("CUDA_PATH_BIN", r"C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v12.6\bin"),
    ):
        if os.path.isdir(_dll_dir):
            os.add_dll_directory(_dll_dir)

import onnxruntime  # noqa: E402
from insightface.app import FaceAnalysis  # noqa: E402


def _select_providers() -> tuple[list, int]:
    available = onnxruntime.get_available_providers()
    wants_cuda = config.AI_DEVICE in {"auto", "cuda", "gpu"}
    if wants_cuda and "CUDAExecutionProvider" in available:
        return ["CUDAExecutionProvider", "CPUExecutionProvider"], 0
    if config.AI_DEVICE in {"cuda", "gpu"}:
        logger.warning("AI_DEVICE=%s requested but CUDA is not available; using CPU.", config.AI_DEVICE)
    return ["CPUExecutionProvider"], -1


class AIEngine:
    def __init__(self) -> None:
        providers, ctx_id = _select_providers()
        logger.info("Loading InsightFace %s (providers=%s) ...", config.FACE_MODEL_NAME, providers)
        self.app = FaceAnalysis(
            name=config.FACE_MODEL_NAME,
            allowed_modules=["detection", "recognition", "landmark_2d_106"],
            providers=providers,
        )
        self.app.prepare(ctx_id=ctx_id, det_size=(config.FACE_DET_SIZE, config.FACE_DET_SIZE))
        self.device = "cuda" if ctx_id >= 0 else "cpu"
        self._lock = threading.Lock()
        logger.info("InsightFace ready on %s", self.device.upper())

    # ------------------------------------------------------------------
    # Decoding
    # ------------------------------------------------------------------
    @staticmethod
    def decode(image_bytes: bytes) -> np.ndarray | None:
        if not image_bytes:
            return None
        img = cv2.imdecode(np.frombuffer(image_bytes, np.uint8), cv2.IMREAD_COLOR)
        return img

    # ------------------------------------------------------------------
    # Analysis
    # ------------------------------------------------------------------
    def analyze(self, img: np.ndarray) -> list[dict]:
        """Detect every face in a BGR image; return bbox, score, embedding, landmarks."""
        if img is None or img.size == 0:
            return []
        try:
            with self._lock:
                faces = self.app.get(img)
        except Exception:
            logger.exception("Face analysis failed")
            return []

        results: list[dict] = []
        for face in faces:
            if face.normed_embedding is None or float(face.det_score) < config.FACE_MIN_DET_SCORE:
                continue
            results.append(
                {
                    "bbox": [int(v) for v in face.bbox.astype(int).tolist()],
                    "det_score": float(face.det_score),
                    "embedding": face.normed_embedding.astype(np.float32).tolist(),
                    "landmarks": self._landmarks(face),
                }
            )
        return results

    def best_face(self, img: np.ndarray) -> dict | None:
        """The largest confidently detected face, used for enrollment and photo search."""
        faces = self.analyze(img)
        if not faces:
            # Tightly cropped portraits (face filling the frame, e.g. ID photos)
            # are missed by the detector; retry with a margin around the image.
            h, w = img.shape[:2]
            pad_y, pad_x = h // 2, w // 2
            padded = cv2.copyMakeBorder(img, pad_y, pad_y, pad_x, pad_x, cv2.BORDER_CONSTANT, value=(0, 0, 0))
            faces = self.analyze(padded)
            for face in faces:
                x1, y1, x2, y2 = face["bbox"]
                face["bbox"] = [x1 - pad_x, y1 - pad_y, x2 - pad_x, y2 - pad_y]
                face["landmarks"] = None
        if not faces:
            return None
        return max(faces, key=lambda f: (f["bbox"][2] - f["bbox"][0]) * (f["bbox"][3] - f["bbox"][1]))

    @staticmethod
    def _landmarks(face) -> dict | None:
        """Pixel-space landmarks: 106-point model when present, else the 5 keypoints."""
        try:
            lm = getattr(face, "landmark_2d_106", None)
            if lm is not None and len(lm) >= 95:
                left_eye = np.mean(lm[35:41], axis=0)
                right_eye = np.mean(lm[89:95], axis=0)
                nose, mouth_left, mouth_right = lm[54], lm[52], lm[61]
            elif getattr(face, "kps", None) is not None and len(face.kps) >= 5:
                kps = face.kps
                right_eye, left_eye, nose, mouth_right, mouth_left = kps[0], kps[1], kps[2], kps[3], kps[4]
            else:
                return None

            def pt(p) -> list[float]:
                return [float(p[0]), float(p[1])]

            return {
                "left_eye": pt(left_eye),
                "right_eye": pt(right_eye),
                "nose": pt(nose),
                "mouth_left": pt(mouth_left),
                "mouth_right": pt(mouth_right),
                "left_eye_center": pt(left_eye),
                "right_eye_center": pt(right_eye),
                "face_center": [float((left_eye[0] + right_eye[0]) / 2), float(nose[1])],
                "eye_distance": float(np.linalg.norm(np.asarray(left_eye) - np.asarray(right_eye))),
                "face_width": float(face.bbox[2] - face.bbox[0]),
            }
        except Exception:
            logger.debug("Landmark extraction failed", exc_info=True)
            return None


_engine: AIEngine | None = None
_engine_lock = threading.Lock()


def get_engine() -> AIEngine:
    """Lazily created singleton (model load takes several seconds)."""
    global _engine
    if _engine is None:
        with _engine_lock:
            if _engine is None:
                _engine = AIEngine()
    return _engine
