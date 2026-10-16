import { afterNextRender, DestroyRef, Directive, ElementRef, inject, input } from '@angular/core';

@Directive({ selector: '[appReveal]', host: { '[attr.data-reveal]': 'appReveal()' } })
export class RevealDirective {
  readonly appReveal = input('up');
  private readonly element = inject(ElementRef<HTMLElement>);
  private readonly destroyRef = inject(DestroyRef);

  constructor() {
    afterNextRender(() => {
      const element = this.element.nativeElement;
      const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
      if (preference.matches || !('IntersectionObserver' in window)) return;
      const observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) {
            element.classList.remove('reveal-pending');
            element.classList.add('reveal-enter');
            observer.disconnect();
          }
        },
        { threshold: 0.08 },
      );
      // Never hide a section that already contains keyboard focus.
      const show = () => {
        element.classList.remove('reveal-pending');
        observer.disconnect();
      };
      element.classList.add('reveal-pending');
      element.addEventListener('focusin', show);
      preference.addEventListener('change', show);
      observer.observe(element);
      this.destroyRef.onDestroy(() => {
        observer.disconnect();
        element.removeEventListener('focusin', show);
        preference.removeEventListener('change', show);
      });
    });
  }
}
