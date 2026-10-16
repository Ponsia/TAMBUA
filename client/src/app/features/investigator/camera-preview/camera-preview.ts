import {
  Component,
  ElementRef,
  ViewChild,
  inject,
  ChangeDetectorRef,
  AfterViewInit,
  OnDestroy,
  NgZone,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { API_CONFIG } from '../../../core/config/api.config';
import { RecordsPage } from '../../../core/pages/records-page';
import { RecordItem, SubjectType } from '../../../core/models/records.model';

import {
  LucideCctv,
  LucideWifi,
  LucideCamera,
  LucideUser,
  LucideCheck,
  LucideArrowLeftRight,
  LucideShieldAlert,
  LucideActivity,
} from '@lucide/angular';

// ------------------------------------------------------------------
// AI engine wire format (ai-engine/app/main.py, /ws/stream)
// ------------------------------------------------------------------
interface RawFace {
  track_id: number;
  bbox: number[];
  is_matched: boolean;
  confidence_score: number;
  subject_type: SubjectType | null;
  subject_id: string | null;
  full_name: string | null;
  photo_url: string | null;
}

interface RawObsPhone {
  name: string;
  kind: 'usb' | 'wifi' | 'unknown';
  detail: string;
}

type ServerMessage =
  | { event: 'STREAM_FRAME_UPDATE'; faces: RawFace[]; frame_width?: number; frame_height?: number }
  | { event: 'OBS_SOURCES'; phones: RawObsPhone[] }
  | {
      event: 'DETECTION_REPORTED';
      subject_type: SubjectType;
      subject_id: string;
      full_name: string | null;
      confidence_score: number;
    }
  | { event: 'ERROR'; message: string };

/** GET /status on the AI engine. */
interface EngineStatus {
  device: string;
  registry: { indexed: number; last_error: string | null };
  cameras: {
    workers: { camera_id: string; state: string; error: string | null }[];
  };
  obs_sources: RawObsPhone[];
  detections_reported: number;
}

interface Detection {
  id: string;
  trackId: number;
  bbox: number[];
  isMatched: boolean;
  subjectType: SubjectType | null;
  subjectId: string | null;
  name: string | null;
  photoUrl: string | null;
  confidence: number;
  capturedSnapshot: string | null;
  lastSeen: number;
}

interface MatchViewModel {
  id: string;
  confidence: number;
  capturedSnapshot: string | null;
  databasePhoto: string | null;
  name: string;
  subjectType: SubjectType;
  subjectId: string;
  recordLabel: string;
  status: string;
  detailLabel: string;
  detail: string;
  lastSeen: string;
  reported: boolean;
}

interface RecentItem {
  id: string;
  snapshot: string;
  name: string;
  confidence: number;
  time: string;
  personKey: string;
}

interface BboxTrack {
  id: string;
  el: HTMLDivElement;
  bbox: number[];
  lastSeen: number;
  isMatched: boolean;
}

// ------------------------------------------------------------------
// OBS Virtual Camera discovery (browser-side MediaDevices)
// ------------------------------------------------------------------
const OBS_KEYWORDS = ['obs virtual camera', 'obs-camera', 'obs virtual', 'virtual camera', 'obs'];

async function findOBSVirtualCamera(): Promise<MediaDeviceInfo | null> {
  try {
    await navigator.mediaDevices
      .getUserMedia({ video: true })
      .then((s) => s.getTracks().forEach((t) => t.stop()))
      .catch(() => {});
    const vids = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput');
    for (const kw of OBS_KEYWORDS) {
      const hit = vids.find((d) => d.label.toLowerCase().includes(kw));
      if (hit) return hit;
    }
    return null;
  } catch {
    return null;
  }
}

// ------------------------------------------------------------------
// Tuning constants
// ------------------------------------------------------------------
/** Same person won't reappear in the recent strip for this many ms. */
const RECENT_DEDUP_MS = 5 * 60 * 1000;
/** Upper bound on frames sent per second (the engine answers each one). */
const MAX_FPS = 10;
/** A frame without an answer for this long is treated as lost. */
const FRAME_TIMEOUT_MS = 4000;
/** No message at all for this long means the socket is dead. */
const WS_SILENCE_TIMEOUT_MS = 10000;
const WS_RECONNECT_MIN_MS = 1000;
const WS_RECONNECT_MAX_MS = 30000;
const STATUS_POLL_MS = 15000;
/** Browser-fed cameras are registered with one of these stream sources. */
const BROWSER_SOURCES = ['browser', 'webcam', 'browser:webcam', 'browser:obs'];

const BBOX_HTML_MATCHED = `<div style="width:100%;height:100%;border:2px solid #22c587;border-radius:6px;background:rgba(34,197,135,0.25);box-shadow:0 0 15px rgba(34,197,129,0.3);box-sizing:border-box;"></div>`;
const BBOX_HTML_UNMATCHED = `<div style="width:100%;height:100%;border:2px solid #dc2626;border-radius:6px;background:rgba(239,68,68,0.15);box-shadow:0 0 15px rgba(239,68,68,0.6);box-sizing:border-box;"></div>`;

@Component({
  selector: 'app-camera-preview',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    LucideCctv,
    LucideWifi,
    LucideCamera,
    LucideUser,
    LucideCheck,
    LucideArrowLeftRight,
    LucideShieldAlert,
    LucideActivity,
  ],
  templateUrl: './camera-preview.html',
  styleUrls: ['./camera-preview.css', './camera-preview-responsive.css'],
})
export class CameraPreviewComponent extends RecordsPage implements AfterViewInit, OnDestroy {
  private readonly config = inject(API_CONFIG);
  private readonly http = inject(HttpClient);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly zone = inject(NgZone);

  readonly resource = 'cameras' as const;

  now = new Date();
  isConnected = false;
  isWebcamActive = false;
  webcamError = '';
  engineError = '';
  cameraLabel = '';
  /** Registered camera the browser feed is reported as (optional). */
  reportCameraId = '';

  currentMatch: MatchViewModel | null = null;
  recentDetections: RecentItem[] = [];
  engineStatus: EngineStatus | null = null;
  obsPhones: RawObsPhone[] = [];

  @ViewChild('cameraVideo') private videoRef?: ElementRef<HTMLVideoElement>;
  @ViewChild('bboxLayer') private bboxLayerRef?: ElementRef<HTMLDivElement>;

  private canvas: HTMLCanvasElement | null = null;
  private ws: WebSocket | null = null;
  private mediaStream: MediaStream | null = null;

  private detections = new Map<string, Detection>();
  private bboxTracks = new Map<string, BboxTrack>();
  private subjectRecords = new Map<string, RecordItem | null>();
  private reportedSubjects = new Set<string>();
  private recentPersonLastSeen = new Map<string, number>();
  private videoMeta = { w: 0, h: 0, serverW: 640, serverH: 480 };
  private videoRect = { W: 0, H: 0 };

  private cleanupRaf = 0;
  private snapshotInterval: ReturnType<typeof setInterval> | null = null;
  private frameInterval: ReturnType<typeof setInterval> | null = null;
  private clockInterval: ReturnType<typeof setInterval> | null = null;
  private wsWatchdog: ReturnType<typeof setInterval> | null = null;
  private statusInterval: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private lastWsMessageAt = 0;
  private frameSentAt = 0;
  private reconnectAttempts = 0;
  private destroyed = false;

  // ------------------------------------------------------------------
  // Summary cards
  // ------------------------------------------------------------------
  get totalCameras(): number {
    return this.records.length;
  }
  get activeCameras(): number {
    return this.records.filter((camera) => camera.status === 'ACTIVE').length;
  }
  get streamingCameras(): number {
    return this.engineStatus?.cameras.workers.filter((w) => w.state === 'streaming').length ?? 0;
  }
  get indexedFaces(): number | null {
    return this.engineStatus?.registry.indexed ?? null;
  }
  /** ACTIVE cameras whose feed comes from an investigator's browser. */
  get browserCameras(): RecordItem[] {
    return this.records.filter(
      (camera) =>
        camera.status === 'ACTIVE' && BROWSER_SOURCES.includes((camera.streamSource || '').trim().toLowerCase()),
    );
  }

  // ------------------------------------------------------------------
  // Lifecycle
  // ------------------------------------------------------------------
  ngAfterViewInit(): void {
    this.canvas = document.createElement('canvas');
    this.startClock();
    void this.startWebcam();
    this.startWebSocket();
    this.startBboxCleanupLoop();
    this.snapshotInterval = setInterval(() => this.updateSnapshots(), 150);
    this.wsWatchdog = setInterval(() => this.checkSocket(), 2000);
    this.loadEngineStatus();
    this.statusInterval = setInterval(() => this.loadEngineStatus(), STATUS_POLL_MS);
    window.addEventListener('resize', this.onResize);
    this.refreshVideoRect();
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    for (const timer of [this.clockInterval, this.frameInterval, this.snapshotInterval, this.wsWatchdog, this.statusInterval]) {
      if (timer) clearInterval(timer);
    }
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.cleanupRaf) cancelAnimationFrame(this.cleanupRaf);
    this.closeSocket();
    this.mediaStream?.getTracks().forEach((t) => t.stop());
    this.mediaStream = null;
    this.bboxTracks.forEach((t) => t.el.remove());
    this.bboxTracks.clear();
    window.removeEventListener('resize', this.onResize);
  }

  /** Re-open the socket so the engine reports detections for the chosen camera. */
  reportCameraChanged(): void {
    this.reportedSubjects.clear();
    this.closeSocket();
    this.reconnectAttempts = 0;
    this.startWebSocket();
  }

  private startClock(): void {
    const tick = () => {
      this.now = new Date();
      this.cdr.markForCheck();
    };
    tick();
    this.clockInterval = setInterval(tick, 1000);
  }

  private loadEngineStatus(): void {
    this.http.get<EngineStatus>(new URL('status', this.config.aiEngineUrl).href).subscribe({
      next: (status) => {
        this.engineStatus = status;
        this.obsPhones = status.obs_sources ?? [];
        this.engineError = '';
        this.cdr.markForCheck();
      },
      error: () => {
        this.engineStatus = null;
        this.engineError = 'The AI engine is not reachable. Live recognition is paused.';
        this.cdr.markForCheck();
      },
    });
  }

  // ------------------------------------------------------------------
  // Webcam (prefers the OBS virtual camera when present)
  // ------------------------------------------------------------------
  private async startWebcam(): Promise<void> {
    const size = { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 30 } };
    try {
      const obs = await findOBSVirtualCamera();
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        video: obs ? { deviceId: { exact: obs.deviceId }, ...size } : size,
        audio: false,
      });
    } catch {
      try {
        this.mediaStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      } catch {
        this.zone.run(() => {
          this.webcamError = 'No camera is available, or camera access was blocked in the browser.';
          this.cdr.markForCheck();
        });
        return;
      }
    }

    const v = this.videoRef?.nativeElement;
    if (v && this.mediaStream) {
      v.srcObject = this.mediaStream;
      v.addEventListener('loadedmetadata', () => {
        this.videoMeta.w = v.videoWidth;
        this.videoMeta.h = v.videoHeight;
        this.refreshVideoRect();
        this.bboxTracks.forEach((t) => this.applyBboxToDom(t.el, t.bbox));
      });
      this.zone.run(() => {
        this.isWebcamActive = true;
        this.webcamError = '';
        this.cameraLabel = this.mediaStream?.getVideoTracks()[0]?.label || 'Default camera';
        this.cdr.markForCheck();
      });
    }
  }

  // ------------------------------------------------------------------
  // WebSocket to the AI engine, with backoff reconnect
  // ------------------------------------------------------------------
  private socketUrl(): string | null {
    const token = this.auth.getToken();
    if (!token || !this.auth.isAuthenticated()) return null;
    const url = new URL('ws/stream', this.config.aiEngineUrl);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.searchParams.set('token', token);
    if (this.reportCameraId) url.searchParams.set('camera_id', this.reportCameraId);
    return url.href;
  }

  private startWebSocket(): void {
    if (this.destroyed) return;
    const url = this.socketUrl();
    if (!url) return;
    const ws = new WebSocket(url);
    ws.binaryType = 'arraybuffer';
    this.ws = ws;

    ws.onopen = () => {
      this.reconnectAttempts = 0;
      this.lastWsMessageAt = Date.now();
      this.frameSentAt = 0;
      this.zone.run(() => {
        this.isConnected = true;
        this.cdr.markForCheck();
      });
      if (this.frameInterval) clearInterval(this.frameInterval);
      this.frameInterval = setInterval(() => this.pushFrame(), 1000 / MAX_FPS);
    };

    ws.onmessage = (e) => {
      this.lastWsMessageAt = Date.now();
      try {
        this.handleServerMessage(JSON.parse(e.data) as ServerMessage);
      } catch {
        /* ignore malformed messages */
      }
    };

    ws.onclose = (event) => {
      if (this.frameInterval) clearInterval(this.frameInterval);
      this.frameInterval = null;
      this.zone.run(() => {
        this.isConnected = false;
        this.bboxTracks.forEach((t) => t.el.remove());
        this.bboxTracks.clear();
        this.detections.clear();
        this.currentMatch = null;
        if (event.code === 4401) this.engineError = 'The AI engine rejected your session. Sign in again.';
        this.cdr.markForCheck();
      });
      if (event.code !== 4401) this.scheduleReconnect();
    };
  }

  private closeSocket(): void {
    if (this.frameInterval) clearInterval(this.frameInterval);
    this.frameInterval = null;
    if (this.ws) {
      this.ws.onopen = this.ws.onmessage = this.ws.onclose = null;
      try {
        this.ws.close();
      } catch {
        /* already closed */
      }
      this.ws = null;
    }
    this.isConnected = false;
  }

  private scheduleReconnect(): void {
    if (this.destroyed || this.reconnectTimer) return;
    const delay = Math.min(WS_RECONNECT_MAX_MS, WS_RECONNECT_MIN_MS * 2 ** this.reconnectAttempts);
    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.startWebSocket();
    }, delay);
  }

  private checkSocket(): void {
    const ws = this.ws;
    if (this.destroyed || !ws || ws.readyState !== WebSocket.OPEN) return;
    if (Date.now() - this.lastWsMessageAt > WS_SILENCE_TIMEOUT_MS) ws.close();
  }

  /** Sends the current frame, one at a time: the next frame waits for the engine's answer. */
  private pushFrame(): void {
    const ws = this.ws;
    const video = this.videoRef?.nativeElement;
    const canvas = this.canvas;
    if (!ws || ws.readyState !== WebSocket.OPEN || !video || !canvas) return;
    if (video.readyState < 2 || !video.videoWidth) return;
    if (this.frameSentAt && Date.now() - this.frameSentAt < FRAME_TIMEOUT_MS) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const scale = Math.min(1, 960 / video.videoWidth);
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    this.frameSentAt = Date.now();
    canvas.toBlob(
      (blob) => {
        if (!blob || ws.readyState !== WebSocket.OPEN) {
          this.frameSentAt = 0;
          return;
        }
        void blob.arrayBuffer().then((buf) => {
          if (ws.readyState === WebSocket.OPEN) ws.send(buf);
        });
      },
      'image/jpeg',
      0.8,
    );
  }

  // ------------------------------------------------------------------
  // Server messages
  // ------------------------------------------------------------------
  private handleServerMessage(data: ServerMessage): void {
    switch (data.event) {
      case 'OBS_SOURCES':
        this.zone.run(() => {
          this.obsPhones = Array.isArray(data.phones) ? data.phones : [];
          this.cdr.markForCheck();
        });
        return;
      case 'ERROR':
        this.zone.run(() => {
          this.engineError = data.message;
          this.cdr.markForCheck();
        });
        return;
      case 'DETECTION_REPORTED':
        this.zone.run(() => {
          this.reportedSubjects.add(`${data.subject_type}:${data.subject_id}`);
          if (this.currentMatch?.subjectId === data.subject_id) {
            this.currentMatch = { ...this.currentMatch, reported: true };
          }
          this.cdr.markForCheck();
        });
        return;
      case 'STREAM_FRAME_UPDATE':
        this.frameSentAt = 0;
        this.handleFrame(data);
        return;
    }
  }

  private handleFrame(data: Extract<ServerMessage, { event: 'STREAM_FRAME_UPDATE' }>): void {
    if (!Array.isArray(data.faces)) return;
    if (data.frame_width && data.frame_height) {
      this.videoMeta.serverW = data.frame_width;
      this.videoMeta.serverH = data.frame_height;
    }
    const now = performance.now();

    this.zone.runOutsideAngular(() => {
      for (const face of data.faces) {
        if (face.bbox) this.upsertBboxTrack(`track-${face.track_id}`, face.bbox, face.is_matched, now);
      }
    });

    for (const face of data.faces) {
      if (!face.bbox) continue;
      const id = `track-${face.track_id}`;
      const det: Detection = this.detections.get(id) ?? {
        id,
        trackId: face.track_id,
        bbox: face.bbox,
        isMatched: false,
        subjectType: null,
        subjectId: null,
        name: null,
        photoUrl: null,
        confidence: 0,
        capturedSnapshot: null,
        lastSeen: now,
      };
      det.bbox = face.bbox;
      det.lastSeen = now;
      det.isMatched = face.is_matched;
      if (face.is_matched && face.subject_type && face.subject_id) {
        det.subjectType = face.subject_type;
        det.subjectId = face.subject_id;
        det.name = face.full_name;
        det.photoUrl = face.photo_url;
        det.confidence = face.confidence_score;
        this.loadSubject(face.subject_type, face.subject_id);
      }
      this.detections.set(id, det);
    }
  }

  /** Fetches the matched person's record once, for the details panel. */
  private loadSubject(type: SubjectType, id: string): void {
    const key = `${type}:${id}`;
    if (this.subjectRecords.has(key)) return;
    this.subjectRecords.set(key, null);
    this.api.subject(type, id).subscribe({
      next: (record) => {
        this.subjectRecords.set(key, record);
        this.cdr.markForCheck();
      },
      error: () => this.subjectRecords.delete(key),
    });
  }

  // ------------------------------------------------------------------
  // Bounding boxes (imperative DOM, outside Angular)
  // ------------------------------------------------------------------
  private upsertBboxTrack(id: string, bbox: number[], isMatched: boolean, now: number): void {
    let track = this.bboxTracks.get(id);
    if (!track) {
      const layer = this.bboxLayerRef?.nativeElement;
      if (!layer) return;
      const el = document.createElement('div');
      el.className = 'bbox-box';
      el.innerHTML = isMatched ? BBOX_HTML_MATCHED : BBOX_HTML_UNMATCHED;
      layer.appendChild(el);
      track = { id, el, bbox, lastSeen: now, isMatched };
      this.bboxTracks.set(id, track);
    } else if (track.isMatched !== isMatched) {
      track.isMatched = isMatched;
      track.el.innerHTML = isMatched ? BBOX_HTML_MATCHED : BBOX_HTML_UNMATCHED;
    }
    track.bbox = bbox;
    track.lastSeen = now;
    this.applyBboxToDom(track.el, bbox);
  }

  private refreshVideoRect(): void {
    const rect = this.videoRef?.nativeElement.getBoundingClientRect();
    this.videoRect = { W: rect?.width ?? 0, H: rect?.height ?? 0 };
  }

  private applyBboxToDom(el: HTMLDivElement, bbox: number[]): void {
    const videoEl = this.videoRef?.nativeElement;
    if (!videoEl) return;
    if (!this.videoRect.W || !this.videoRect.H) this.refreshVideoRect();
    const { W, H } = this.videoRect;
    const vw = this.videoMeta.w || videoEl.videoWidth || 1280;
    const vh = this.videoMeta.h || videoEl.videoHeight || 720;

    // The video is rendered with object-fit: cover and mirrored (scaleX(-1)).
    const scale = Math.max(W / vw, H / vh);
    const offsetX = (W - vw * scale) / 2;
    const offsetY = (H - vh * scale) / 2;
    const sx = vw / this.videoMeta.serverW;
    const sy = vh / this.videoMeta.serverH;
    const [x1, y1, x2, y2] = bbox;
    const left = x1 * sx * scale + offsetX;
    const top = y1 * sy * scale + offsetY;
    const w = (x2 - x1) * sx * scale;
    const h = (y2 - y1) * sy * scale;

    el.style.transform = `translate3d(${W - left - w}px, ${top}px, 0)`;
    el.style.width = `${w}px`;
    el.style.height = `${h}px`;
  }

  private onResize = (): void => {
    this.refreshVideoRect();
    this.bboxTracks.forEach((t) => this.applyBboxToDom(t.el, t.bbox));
  };

  /** Fades out and removes boxes for faces that left the frame. */
  private startBboxCleanupLoop(): void {
    const GRACE_MS = 600;
    const PURGE_MS = 1200;
    const tick = () => {
      const now = performance.now();
      const purge: string[] = [];
      this.bboxTracks.forEach((t, id) => {
        const age = now - t.lastSeen;
        t.el.style.opacity = age > GRACE_MS ? '0' : '1';
        if (age > PURGE_MS) {
          t.el.remove();
          purge.push(id);
        }
      });
      if (purge.length) {
        purge.forEach((id) => {
          this.bboxTracks.delete(id);
          this.detections.delete(id);
        });
        this.zone.run(() => {
          if (this.currentMatch && purge.includes(this.currentMatch.id)) this.currentMatch = null;
          this.cdr.markForCheck();
        });
      }
      this.cleanupRaf = requestAnimationFrame(tick);
    };
    this.zone.runOutsideAngular(() => (this.cleanupRaf = requestAnimationFrame(tick)));
  }

  // ------------------------------------------------------------------
  // Face crops for the match panel and recent strip
  // ------------------------------------------------------------------
  private updateSnapshots(): void {
    const video = this.videoRef?.nativeElement;
    if (!video?.videoWidth || !video.videoHeight) return;
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    const canvas = document.createElement('canvas');
    let latest: Detection | null = null;

    for (const det of this.detections.values()) {
      if (!det.isMatched || !det.subjectId) continue;
      const [x1, y1, x2, y2] = this.bboxTracks.get(det.id)?.bbox || det.bbox;
      const padX = (x2 - x1) * 0.35;
      const padY = (y2 - y1) * 0.3;
      const sx = vw / this.videoMeta.serverW;
      const sy = vh / this.videoMeta.serverH;
      const cx = Math.max(0, (x1 - padX) * sx);
      const cy = Math.max(0, (y1 - padY) * sy);
      const cw = Math.min(vw - cx, (x2 - x1 + padX * 2) * sx);
      const ch = Math.min(vh - cy, (y2 - y1 + padY * 2) * sy);
      if (cw <= 0 || ch <= 0) continue;
      canvas.width = cw;
      canvas.height = ch;
      const ctx = canvas.getContext('2d');
      if (!ctx) continue;
      ctx.drawImage(video, cx, cy, cw, ch, 0, 0, cw, ch);
      det.capturedSnapshot = canvas.toDataURL('image/jpeg', 0.7);
      if (!latest || det.lastSeen > latest.lastSeen) latest = det;
    }

    if (latest) {
      const match = latest;
      this.zone.run(() => {
        this.currentMatch = this.toMatchVm(match);
        this.pushRecent(match);
        this.cdr.markForCheck();
      });
    }
  }

  private toMatchVm(det: Detection): MatchViewModel {
    const type = det.subjectType as SubjectType;
    const subjectId = det.subjectId as string;
    const record = this.subjectRecords.get(`${type}:${subjectId}`) ?? null;
    const watchlist = type === 'WATCHLIST';
    return {
      id: det.id,
      confidence: det.confidence,
      capturedSnapshot: det.capturedSnapshot,
      databasePhoto: det.photoUrl || record?.photoUrl || null,
      name: record?.fullName || det.name || 'Unknown',
      subjectType: type,
      subjectId,
      recordLabel: watchlist ? 'Watchlist person' : 'Missing person',
      status: record?.status || '—',
      detailLabel: watchlist ? 'Risk level' : 'Category',
      detail: (watchlist ? record?.riskLevel : record?.category)?.replace(/_/g, ' ') || '—',
      lastSeen: watchlist ? record?.reason || '—' : record?.lastSeenLocation || '—',
      reported: this.reportedSubjects.has(`${type}:${subjectId}`),
    };
  }

  private pushRecent(det: Detection): void {
    if (!det.capturedSnapshot || !det.subjectId) return;
    const key = `${det.subjectType}:${det.subjectId}`;
    const nowMs = Date.now();
    if (nowMs - (this.recentPersonLastSeen.get(key) ?? 0) < RECENT_DEDUP_MS) return;
    this.recentPersonLastSeen.set(key, nowMs);
    const item: RecentItem = {
      id: det.id,
      snapshot: det.capturedSnapshot,
      name: det.name || 'Match',
      confidence: det.confidence,
      time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }),
      personKey: key,
    };
    this.recentDetections = [item, ...this.recentDetections.filter((r) => r.personKey !== key)].slice(0, 5);
  }

  // ------------------------------------------------------------------
  // Template helpers
  // ------------------------------------------------------------------
  pct(v: number | undefined): number {
    return v == null ? 0 : Math.round(v * 100);
  }

  formatTime(d: Date): string {
    return d.toLocaleTimeString('en-GB', { hour12: false });
  }
}
