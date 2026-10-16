import { SiteFooterComponent } from '../../shared/components/site-footer/site-footer';
import { RevealDirective } from './reveal.directive';
import { BrandLogoComponent } from '../../shared/components/brand-logo/brand-logo';
import { LandingContentComponent } from './landing-content';
import { afterNextRender, DestroyRef, inject, Component, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  LucideArrowRight,
  LucideArrowUpRight,
  LucideMenu,
  LucideShieldCheck,
  LucideUsers,
  LucideX,
} from '@lucide/angular';
import { ThemeToggleComponent } from '../../shared/components/theme-toggle/theme-toggle';

@Component({
  selector: 'app-landing',
  imports: [
    SiteFooterComponent,
    RevealDirective,
    BrandLogoComponent,
    LandingContentComponent,
    RouterLink,
    ThemeToggleComponent,
    LucideArrowRight,
    LucideArrowUpRight,
      LucideMenu,

    LucideShieldCheck,
    LucideUsers,
    LucideX,
  ],
  templateUrl: './landing.html',
  styleUrls: ['./landing-shared.css', './landing.css', './landing-presentation.css', './landing-refinement.css'],
})
export class LandingComponent {
  readonly menuOpen = signal(false);
  readonly slide = signal(0);
  readonly playing = signal(false);
  readonly reducedMotion = signal(false);
  readonly headerHidden = signal(false);
  readonly slides = [
    {
      title: 'Closer to answers.',
      emphasis: 'Closer to home.',
      label: 'PEOPLE AT THE CENTRE',
      description:
        'Behind every case is a person who matters. Bring case information and investigation teams together, so the next step is a more informed one.',
    },
    {
      title: 'See the evidence.',
      emphasis: 'Understand the context.',
      label: 'EVIDENCE. THEN HUMAN REVIEW.',
      description:
        'Review camera information, detection frames and available clips together. Give every potential sighting the careful human review it deserves.',
    },
    {
      title: 'Connected teams.',
      emphasis: 'A shared purpose.',
      label: 'EVERY VERIFIED STEP MATTERS',
      description:
        'Keep records coordinated, follow confirmed movements and help authorized teams move an investigation forward together.',
    },
  ];
  private readonly destroyRef = inject(DestroyRef);
  private hovering = false;
  private focused = false;

  constructor() {
    afterNextRender(() => {
      const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
      this.reducedMotion.set(preference.matches);
      const onPreference = () => {
        this.reducedMotion.set(preference.matches);
        if (preference.matches) this.playing.set(false);
      };
      preference.addEventListener('change', onPreference);
      const timer = window.setInterval(() => {
        if (this.playing() && !this.hovering && !this.focused && !document.hidden)
          this.slide.update((value) => (value + 1) % this.slides.length);
      }, 5000);
      let previous = window.scrollY;
      const onScroll = () => {
        const current = window.scrollY;
        if (Math.abs(current - previous) < 10) return;
        this.headerHidden.set(current > previous && current > 250 && !this.menuOpen());
        previous = current;
      };
      window.addEventListener('scroll', onScroll, { passive: true });
      this.destroyRef.onDestroy(() => {
        clearInterval(timer);
        preference.removeEventListener('change', onPreference);
        window.removeEventListener('scroll', onScroll);
      });
    });
  }
  changeSlide(direction: number): void {
    this.playing.set(false);
    this.slide.update((value) => (value + direction + this.slides.length) % this.slides.length);
  }
  togglePlayback(): void {
    this.playing.update((value) => !value);
  }
  hoverHero(value: boolean): void {
    this.hovering = value;
  }
  focusHero(value: boolean): void {
    this.focused = value;
    if (value) this.playing.set(false);
  }
  readonly year = new Date().getFullYear();
}
