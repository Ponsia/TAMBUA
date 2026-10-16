"""
OBS WebSocket discovery of DroidCam phone sources (USB + Wi-Fi).

Optional: enabled with OBS_ENABLED and only if obsws-python is installed and
OBS is reachable. The poller reports ONLY sources that are verifiably
delivering live frames in the current program scene, using several signals
because DroidCam keeps video_active=True even when the phone is gone:
pixel variance of the rendered frame (placeholder frames are flat), the
plugin's own connection settings, a frame-advance hash (frozen frames), and
per-device de-duplication (one phone is one camera).
"""

from __future__ import annotations

import asyncio
import base64
import hashlib
import io
import logging
import time
from typing import Awaitable, Callable

from PIL import Image

from app import config

logger = logging.getLogger("TAMBUA_OBS")

try:
    import obsws_python as obs

    OBS_AVAILABLE = True
except ImportError:  # pragma: no cover - optional dependency
    OBS_AVAILABLE = False

OBS_HOST = config.OBS_HOST
OBS_PORT = config.OBS_PORT
OBS_PASSWORD = config.OBS_PASSWORD
PIL_AVAILABLE = True

# Frame-advance: if the same tiny screenshot hash repeats for longer than
# this, the source is frozen.
OBS_FRAME_STALE_AFTER_S = 6.0

# Screenshot parameters for the pixel-variance and hash checks.
OBS_SHOT_W = 128
OBS_SHOT_H = 72
OBS_SHOT_QUALITY = 60

# Real camera images score well above this; DroidCam's placeholder frame is
# near-flat grey and scores near 0.
OBS_MIN_FRAME_VARIANCE = 40.0
OBS_DEBUG_VARIANCE = False

# ----------------------------------------------------------------
# OBS per-source state (frame hash + last change time)
# ----------------------------------------------------------------
# input_name -> (last_frame_hash, monotonic_ts_of_last_hash_change)
_obs_frame_state: dict[str, tuple[str, float]] = {}


def _safe_call(fn, *args, **kwargs):
    """Call an obsws-python method, return None on failure."""
    try:
        return fn(*args, **kwargs)
    except Exception as e:
        logger.debug(f"OBS call failed ({getattr(fn, '__name__', fn)}): {e}")
        return None


# ----------------------------------------------------------------
# Scene helpers — only the CURRENT PROGRAM SCENE counts
# ----------------------------------------------------------------
def _get_program_scene_name(client) -> str | None:
    resp = _safe_call(client.get_current_program_scene)
    if resp is None:
        return None
    return (
        getattr(resp, "current_program_scene_name", None)
        or getattr(resp, "scene_name", None)
    )


def _get_scene_items_for_program_scene(client) -> dict[str, dict]:
    """
    Map source_name -> scene item info for the CURRENT PROGRAM SCENE only.

    Sources that exist in other scenes, or that are disabled in the
    program scene, are NOT rendered by OBS and therefore not "live".
    """
    program_scene = _get_program_scene_name(client)
    if not program_scene:
        logger.debug("OBS: could not determine current program scene")
        return {}

    items_resp = _safe_call(client.get_scene_item_list, program_scene)
    items = getattr(items_resp, "scene_items", []) or []

    result: dict[str, dict] = {}
    for item in items:
        source_name = item.get("sourceName")
        if not source_name:
            continue
        candidate = {
            "scene": program_scene,
            "sceneItemId": item.get("sceneItemId"),
            "sceneItemEnabled": bool(item.get("sceneItemEnabled", False)),
        }
        existing = result.get(source_name)
        # Prefer the enabled instance if the same source is listed twice.
        if existing is None or (
            candidate["sceneItemEnabled"] and not existing["sceneItemEnabled"]
        ):
            result[source_name] = candidate

    return result


# ----------------------------------------------------------------
# Screenshot helpers — one screenshot, used for hash + variance
# ----------------------------------------------------------------
def _grab_frame(client, input_name: str) -> bytes | None:
    """Fetch a small PNG screenshot of the source, decoded to bytes."""
    resp = _safe_call(
        client.get_source_screenshot,
        input_name,
        "png",
        OBS_SHOT_W,
        OBS_SHOT_H,
        OBS_SHOT_QUALITY,
    )
    if resp is None:
        return None
    data = getattr(resp, "image_data", None)
    if not data:
        return None
    if "," in data:
        data = data.split(",", 1)[1]
    try:
        return base64.b64decode(data)
    except Exception:
        return None


def _frame_hash_from_bytes(raw: bytes) -> str:
    return hashlib.md5(raw).hexdigest()


def _pixel_variance_from_bytes(raw: bytes) -> float | None:
    """
    Decode the PNG and return the variance of luminance values.

    Real camera frame → high variance (texture, noise).
    Flat placeholder  → near-zero variance (solid grey/black).
    """
    if not PIL_AVAILABLE:
        return None
    try:
        img = Image.open(io.BytesIO(raw)).convert("L")  # grayscale
    except Exception as e:
        logger.debug(f"pixel-variance decode failed: {e}")
        return None

    pixels = list(img.getdata())
    if not pixels:
        return None

    mean = sum(pixels) / len(pixels)
    var = sum((p - mean) ** 2 for p in pixels) / len(pixels)
    return var


# ----------------------------------------------------------------
# DroidCam plugin settings inspection
# ----------------------------------------------------------------
# Field names vary across DroidCam-OBS versions. We check all of them.
_CONNECTED_FLAG_KEYS = ("connected", "isConnected", "is_connected")
_STATUS_KEYS = ("connection_status", "device_status", "status")
_DIM_PAIRS = (
    ("video_width", "video_height"),
    ("width", "height"),
)


def _settings_say_disconnected(settings: dict) -> tuple[bool, str]:
    """
    Look for a definitive disconnect signal in DroidCam's own settings.
    Returns (is_disconnected, reason).
    """
    # Explicit boolean flags
    for key in _CONNECTED_FLAG_KEYS:
        if key in settings and settings[key] is False:
            return True, f"settings.{key}=False"

    # Status strings
    for key in _STATUS_KEYS:
        if key in settings:
            v = str(settings[key]).lower()
            if v in ("disconnected", "offline", "error", "failed", "closed", "no device"):
                return True, f"settings.{key}={v}"

    # Zero/none resolution
    for wkey, hkey in _DIM_PAIRS:
        if wkey in settings and hkey in settings:
            try:
                w = int(settings[wkey] or 0)
                h = int(settings[hkey] or 0)
                if w <= 0 or h <= 0:
                    return True, f"settings.{wkey}x{hkey}={w}x{h}"
            except (TypeError, ValueError):
                pass

    return False, ""


# ----------------------------------------------------------------
# The liveness gate
# ----------------------------------------------------------------
def _is_input_actually_live(
    client,
    input_name: str,
    scene_item: dict | None,
    settings: dict,
    now: float,
) -> tuple[bool, str]:
    """
    Strictly verify whether a DroidCam input is producing live frames.

    Order (cheap → expensive):
      1. Must be in the current program scene.
      2. Must be unmuted.
      3. Scene item must be enabled.
      4. OBS must report video_active AND video_showing.
      5. DroidCam's own settings must not indicate a disconnect.
      6. Rendered frame must have real pixel variance (not a flat
         placeholder).
      7. Rendered frame hash must be changing over time (not frozen).
    """
    # 1. Program scene membership
    if scene_item is None:
        return False, "not_in_program_scene"

    # 2. Mute
    mute_resp = _safe_call(client.get_input_mute, input_name)
    if mute_resp is not None and getattr(mute_resp, "input_muted", False):
        return False, "muted"

    # 3. Scene item enabled
    if not scene_item.get("sceneItemEnabled", False):
        return False, "scene_item_disabled"

    # 4. OBS active flags (necessary, not sufficient)
    active_resp = _safe_call(client.get_source_active, input_name)
    if active_resp is None:
        return False, "no_active_query"
    if not bool(getattr(active_resp, "video_active", False)):
        return False, "video_inactive"
    if not bool(getattr(active_resp, "video_showing", False)):
        return False, "video_not_showing"

    # 5. DroidCam settings
    disconnected, why = _settings_say_disconnected(settings)
    if disconnected:
        return False, f"device_disconnected ({why})"

    # 6. Pixel variance — catches animated "connecting…" placeholders
    raw = _grab_frame(client, input_name)
    if raw is None:
        return False, "no_frame_data"

    var = _pixel_variance_from_bytes(raw)
    if var is not None:
        if OBS_DEBUG_VARIANCE:
            logger.info(f"🔬 variance {input_name!r} = {var:.1f}")
        if var < OBS_MIN_FRAME_VARIANCE:
            return False, f"placeholder_frame (variance={var:.1f})"

    # 7. Frame-advance check (catches frozen real frames)
    h = _frame_hash_from_bytes(raw)
    prev = _obs_frame_state.get(input_name)
    _obs_frame_state[input_name] = (h, now)

    if prev is not None:
        prev_hash, prev_ts = prev
        if h == prev_hash and (now - prev_ts) >= OBS_FRAME_STALE_AFTER_S:
            return False, f"frame_frozen (same hash for {now - prev_ts:.1f}s)"

    return True, "live"


# ----------------------------------------------------------------
# Metadata extraction + dedupe
# ----------------------------------------------------------------
def _classify_obs_input(inp_name: str, settings: dict) -> dict:
    """Extract connection metadata from a droidcam-obs input."""
    wifi_ip = settings.get("wifi_ip") or settings.get("wifiIp")
    usb_serial = settings.get("adb_serial") or settings.get("adbSerial")

    if usb_serial:
        kind, detail = "usb", str(usb_serial)
    elif wifi_ip:
        kind, detail = "wifi", str(wifi_ip)
    else:
        kind, detail = "unknown", ""

    return {
        "name": inp_name,
        "kind": kind,
        "detail": detail,
        "active": True,
    }


def _dedupe_by_device(phones: list[dict]) -> list[dict]:
    """Collapse multiple inputs that point at the same physical phone."""
    seen: set[tuple[str, str]] = set()
    out: list[dict] = []
    for p in phones:
        detail = p.get("detail") or ""
        if not detail:
            out.append(p)
            continue
        key = (p["kind"], detail)
        if key in seen:
            logger.info(
                f"🔁 Dropping duplicate OBS input {p['name']!r} "
                f"(same device as earlier: {key})"
            )
            continue
        seen.add(key)
        out.append(p)
    return out


# ----------------------------------------------------------------
# Main query
# ----------------------------------------------------------------
def _query_obs_sources() -> list[dict]:
    """
    Blocking query — returns ONLY droidcam-obs inputs that are
    verifiably live in the current program scene AND producing
    non-placeholder, non-frozen frames.
    """
    if not OBS_AVAILABLE:
        return []

    try:
        client = obs.ReqClient(
            host=OBS_HOST, port=OBS_PORT, password=OBS_PASSWORD, timeout=2
        )
    except Exception as e:
        logger.debug(f"OBS connection failed: {e}")
        return []

    try:
        resp = client.get_input_list()
        inputs = getattr(resp, "inputs", []) or []

        program_scene = _get_program_scene_name(client)
        scene_items = _get_scene_items_for_program_scene(client)
        now = time.monotonic()

        phones: list[dict] = []
        seen_names: set[str] = set()

        for inp in inputs:
            kind = (inp.get("inputKind") or "").lower()
            if "droidcam" not in kind:
                continue

            inp_name = inp.get("inputName")
            if not inp_name or inp_name in seen_names:
                continue
            seen_names.add(inp_name)

            # Grab settings once — used both for liveness and metadata.
            try:
                s_resp = client.get_input_settings(inp_name)
                settings = getattr(s_resp, "input_settings", {}) or {}
            except Exception:
                settings = {}

            scene_item = scene_items.get(inp_name)

            is_live, reason = _is_input_actually_live(
                client, inp_name, scene_item, settings, now
            )

            if not is_live:
                # Reset frame state if it's no longer contributing frames.
                if reason.startswith(("frame_frozen", "no_frame_data", "placeholder_frame")):
                    _obs_frame_state.pop(inp_name, None)
                logger.debug(
                    f"📴 OBS source {inp_name!r} NOT live ({reason}) "
                    f"[program_scene={program_scene!r}]"
                )
                continue

            logger.debug(
                f"✅ OBS source {inp_name!r} LIVE ({reason}) "
                f"[program_scene={program_scene!r}]"
            )
            phones.append(_classify_obs_input(inp_name, settings))

        # Drop frame state for inputs that vanished from OBS entirely.
        for stale_name in list(_obs_frame_state.keys()):
            if stale_name not in seen_names:
                _obs_frame_state.pop(stale_name, None)

        # Same physical phone registered twice → collapse to one entry.
        phones = _dedupe_by_device(phones)

        return phones

    except Exception as e:
        logger.error(f"OBS query error: {e}")
        return []
    finally:
        try:
            client.disconnect()
        except Exception:
            pass



latest_sources: list[dict] = []


async def obs_poll_loop(broadcast: Callable[[dict], Awaitable[None]]) -> None:
    """Poll OBS every few seconds and broadcast the live source list."""
    global latest_sources
    if not (config.OBS_ENABLED and OBS_AVAILABLE):
        logger.info("OBS discovery disabled.")
        return

    logger.info("OBS poller started -> %s:%s", OBS_HOST, OBS_PORT)
    while True:
        try:
            phones = await asyncio.to_thread(_query_obs_sources)
            if phones != latest_sources:
                logger.info("OBS live sources changed: %d active", len(phones))
            latest_sources = phones
            await broadcast({"event": "OBS_SOURCES", "phones": phones, "count": len(phones)})
        except Exception:
            logger.exception("OBS poll loop error")
        await asyncio.sleep(config.OBS_POLL_INTERVAL_S)
