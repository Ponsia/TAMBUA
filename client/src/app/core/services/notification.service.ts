import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { MonoTypeOperatorFunction, tap } from 'rxjs';
import { apiError } from './api-error';

export interface Notice { id: number; kind: 'success' | 'error'; message: string; }
@Injectable({ providedIn: 'root' })
export class NotificationService {
  readonly notices = signal<Notice[]>([]);
  private sequence = 0;
  private timers = new Map<number, ReturnType<typeof setTimeout>>();
  constructor() { inject(DestroyRef).onDestroy(() => this.timers.forEach(clearTimeout)); }
  success(message: string): void { this.show('success', message); }
  error(message: string): void { this.show('error', message); }
  private show(kind: Notice['kind'], message: string): void {
    const duplicate = this.notices().find((notice) => notice.kind === kind && notice.message === message);
    if (duplicate) this.dismiss(duplicate.id);
    if (this.notices().length >= 3) this.dismiss(this.notices()[0].id);
    const notice = { id: ++this.sequence, kind, message };
    this.notices.update((items) => [...items, notice]);
    this.resume(notice.id);
  }
  pause(id: number): void { clearTimeout(this.timers.get(id)); this.timers.delete(id); }
  resume(id: number): void {
    this.pause(id);
    const notice = this.notices().find((item) => item.id === id);
    // Errors remain until dismissed; success messages pause while being read.
    if (notice?.kind === 'success') this.timers.set(id, setTimeout(() => this.dismiss(id), 6500));
  }
  dismiss(id: number): void { this.pause(id); this.notices.update((items) => items.filter((item) => item.id !== id)); }
  feedback<T>(message: string | ((value: T) => string)): MonoTypeOperatorFunction<T> {
    return tap({ next: (value) => this.success(typeof message === 'function' ? message(value) : message), error: (error) => this.error(apiError(error)) });
  }
}
