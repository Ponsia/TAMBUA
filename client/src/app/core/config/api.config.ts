import { InjectionToken } from '@angular/core';

export interface ApiConfig {
  /** Django GraphQL endpoint (proxied to the backend in development). */
  graphqlUrl: string;
  /** Django CSV/PDF export endpoints. */
  exportsUrl: string;
  /** Django photo upload endpoint (stores the file in MinIO, returns its URL). */
  uploadUrl: string;
  /** Django origin, used for the admin site and to resolve relative media URLs. */
  backendUrl: string;
  /** AI engine origin: live camera analysis (WebSocket) and engine status. */
  aiEngineUrl: string;
  /** How often review queues poll for new detections, in milliseconds. */
  livePollMs: number;
}

export const API_CONFIG = new InjectionToken<ApiConfig>('API_CONFIG', {
  providedIn: 'root',
  factory: () => ({
    graphqlUrl: '/graphql/',
    exportsUrl: '/exports/',
    uploadUrl: '/uploads/photo/',
    backendUrl: 'http://localhost:8000/',
    aiEngineUrl: 'http://localhost:8001/',
    livePollMs: 10000,
  }),
});
