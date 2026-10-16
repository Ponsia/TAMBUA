import { DOCUMENT } from '@angular/common';
import { DestroyRef, Injectable, inject, signal } from '@angular/core';

export type Theme = 'light' | 'dark';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);
  private readonly window = this.document.defaultView;
  private readonly preference = this.window?.matchMedia?.('(prefers-color-scheme: dark)');
  private readonly current = signal<Theme>(this.readPreference());
  readonly theme = this.current.asReadonly();

  constructor() {
    this.apply(this.current());
    const systemChanged = () => {
      if (!this.storedTheme()) this.apply(this.preference?.matches ? 'dark' : 'light');
    };
    const storageChanged = (event: StorageEvent) => {
      if (event.key === 'tambua_theme' || event.key === null) this.apply(this.readPreference());
    };
    this.preference?.addEventListener('change', systemChanged);
    this.window?.addEventListener('storage', storageChanged);
    this.destroyRef.onDestroy(() => {
      this.preference?.removeEventListener('change', systemChanged);
      this.window?.removeEventListener('storage', storageChanged);
    });
  }

  toggle(): void {
    const theme = this.current() === 'dark' ? 'light' : 'dark';
    this.apply(theme);
    try {
      this.window?.localStorage.setItem('tambua_theme', theme);
    } catch {}
  }

  private storedTheme(): Theme | null {
    try {
      const theme = this.window?.localStorage.getItem('tambua_theme');
      return theme === 'light' || theme === 'dark' ? theme : null;
    } catch {
      return null;
    }
  }

  private readPreference(): Theme {
    return this.storedTheme() || (this.preference?.matches ? 'dark' : 'light');
  }

  private apply(theme: Theme): void {
    this.current.set(theme);
    this.document.documentElement.dataset['theme'] = theme;
    this.document.documentElement.style.colorScheme = theme;
  }
}
