import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { map } from 'rxjs';
import { API_CONFIG } from '../config/api.config';

export const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const PHOTO_MAX_BYTES = 8 * 1024 * 1024;

/** Returns an error message for an unacceptable photo, or '' when it can be uploaded. */
export function photoProblem(file: File): string {
  if (!PHOTO_TYPES.includes(file.type)) return 'Select a JPEG, PNG or WebP image.';
  if (!file.size || file.size > PHOTO_MAX_BYTES) return 'Select a non-empty image up to 8 MB.';
  return '';
}

@Injectable({ providedIn: 'root' })
export class PhotoUploadService {
  private readonly http = inject(HttpClient);
  private readonly config = inject(API_CONFIG);

  /** Stores the photo in MinIO through Django and returns its permanent URL. */
  upload(file: File) {
    const body = new FormData();
    body.append('file', file, file.name);
    return this.http.post<{ url: string }>(this.config.uploadUrl, body).pipe(
      map((response) => {
        if (!response?.url || typeof response.url !== 'string') {
          throw new Error('The photo upload did not return a URL.');
        }
        return response.url;
      }),
    );
  }
}
