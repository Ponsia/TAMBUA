import { Component, inject } from '@angular/core';
import { LucideMoon, LucideSun } from '@lucide/angular';
import { ThemeService } from '../../../core/services/theme.service';

@Component({
  selector: 'app-theme-toggle',
  imports: [LucideMoon, LucideSun],
  template: `
    <button
      type="button"
      class="theme-toggle"
      (click)="theme.toggle()"
      [attr.aria-label]="theme.theme() === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'"
      [attr.aria-pressed]="theme.theme() === 'dark'"
      [title]="theme.theme() === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'"
    >
      @if (theme.theme() === 'dark') {
        <svg lucideSun></svg>
      } @else {
        <svg lucideMoon></svg>
      }
      <span>{{ theme.theme() === 'dark' ? 'Light' : 'Dark' }}</span>
    </button>
  `,
  styles: [
    `
      :host {
        display: inline-flex;
      }
      .theme-toggle {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        min-height: var(--theme-toggle-size, 42px);
        padding: 9px 13px;
        border: 1px solid var(--line);
        border-radius: 8px;
        background: var(--surface);
        color: var(--text);
        font: 600 var(--theme-toggle-font-size, 12px) var(--font);
        cursor: pointer;
      }
      .theme-toggle:hover {
        background: var(--surface-soft);
      }
      svg {
        width: 17px;
        height: 17px;
      }
      @media (max-width: 480px) {
        span {
          display: none;
        }
      }
    `,
  ],
})
export class ThemeToggleComponent {
  readonly theme = inject(ThemeService);
}
