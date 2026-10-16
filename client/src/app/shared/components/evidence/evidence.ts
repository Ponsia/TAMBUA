import { API_CONFIG } from '../../../core/config/api.config';
import { Component, OnChanges, inject, input } from '@angular/core';

@Component({
  selector: 'app-evidence',
  standalone: true,
  template: `
    @if (videoUrl && !videoFailed) {
      <video
        controls
        preload="metadata"
        [src]="videoUrl"
        [poster]="imageUrl"
        (error)="videoFailed = true"
      ></video>
    } @else if (imageUrl && !imageFailed) {
      <img [src]="imageUrl" alt="Detection frame" loading="lazy" (error)="imageFailed = true" />
    } @else {
      <p>Evidence is unavailable.</p>
    }
  `,
  styles: ['img, video { display: block; width: 100%; max-height: 360px; object-fit: contain; }'],
})
export class EvidenceComponent implements OnChanges {
  private readonly config = inject(API_CONFIG);
  ngOnChanges(): void {
    this.videoFailed = false;
    this.imageFailed = false;
  }
  readonly snapshot = input<string | null | undefined>();
  readonly clip = input<string | null | undefined>();
  videoFailed = false;
  imageFailed = false;
  get imageUrl(): string {
    return this.mediaUrl(this.snapshot());
  }
  get videoUrl(): string {
    return this.mediaUrl(this.clip());
  }

  private mediaUrl(value: string | null | undefined): string {
    if (!value) return '';
    try {
      const url = new URL(value, this.config.backendUrl);
      return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
    } catch {
      return '';
    }
  }
}
