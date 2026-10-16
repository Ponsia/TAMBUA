import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-site-footer',
  imports: [RouterLink],
  template: `<footer class="shared-footer">
    <span>© {{ year }} e-TAMBUA. All rights reserved.</span>
    <span class="footer-purpose">Thoughtful technology. A human purpose.</span>
    <a routerLink="/" fragment="questions">Help &amp; access</a>
  </footer>`,
  styles: [`:host { display: block; margin-top: auto; }
    .shared-footer { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px 24px; padding: 24px clamp(20px, 3vw, 40px); border-top: 1px solid var(--line); color: var(--muted); background: var(--surface); font-size: var(--font-small); line-height: 1.6; }
    a { color: var(--accent-ink); font-weight: 600; text-underline-offset: 4px; }
    @media(max-width: 680px) { .shared-footer { justify-content: center; text-align: center; } .footer-purpose { width: 100%; order: 3; } }
  `],
})
export class SiteFooterComponent { readonly year = new Date().getFullYear(); }
