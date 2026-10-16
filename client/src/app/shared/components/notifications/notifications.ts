import { Component, inject } from '@angular/core';
import { NotificationService } from '../../../core/services/notification.service';
@Component({
  selector: 'app-notifications',
  template: `<div class="notice-stack" aria-label="Action feedback">
    @for (notice of feedback.notices(); track notice.id) {
      <div class="notice" [class.error]="notice.kind === 'error'" [attr.role]="notice.kind === 'error' ? 'alert' : 'status'"
        (mouseenter)="feedback.pause(notice.id)" (mouseleave)="feedback.resume(notice.id)"
        (focusin)="feedback.pause(notice.id)" (focusout)="feedback.resume(notice.id)">
        <span class="notice-icon" aria-hidden="true">{{ notice.kind === 'success' ? '✓' : '!' }}</span>
        <div><strong>{{ notice.kind === 'success' ? 'Success' : 'Action unsuccessful' }}</strong><p>{{ notice.message }}</p></div>
        <button type="button" (click)="feedback.dismiss(notice.id)" aria-label="Dismiss notification">×</button>
      </div>
    }
  </div>`,
  styles: [`
    .notice-stack { position: fixed; right: 24px; bottom: 24px; width: min(420px, calc(100vw - 32px)); z-index: 10000; display: grid; gap: 12px; pointer-events: none; }
    .notice { display: flex; align-items: flex-start; gap: 12px; padding: 16px; border: 1px solid var(--line); border-left: 4px solid var(--success); background: var(--surface); color: var(--text); border-radius: 12px; box-shadow: var(--shadow-emphasis); pointer-events: auto; }
    .error { border-left-color: var(--danger); }
    .notice-icon { color: var(--success); font-weight: 700; font-size: 22px; }
    .error .notice-icon { color: var(--danger); }
    strong { font-size: var(--font-body); } p { margin: 4px 0 0; font-size: var(--font-small); line-height: 1.6; overflow-wrap: anywhere; }
    button { margin-left: auto; flex-shrink: 0; min-width: 36px; min-height: 36px; border: 0; border-radius: 8px; color: var(--text); background: var(--surface-soft); font-size: 22px; }
    @media(max-width: 600px) { .notice-stack { right: 16px; bottom: 16px; } }
  `],
})
export class NotificationsComponent { readonly feedback = inject(NotificationService); }
