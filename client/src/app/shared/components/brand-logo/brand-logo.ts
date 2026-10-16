import { Component } from '@angular/core';

@Component({
  selector: 'app-brand-logo',
  template: `<svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 650 120"
    role="img"
    aria-label="e-TAMBUA"
  >
    <g transform="translate(10 18)">
      <ellipse cx="24" cy="51" rx="20" ry="25" fill="var(--surface)" />
      <path
        fill="var(--accent)"
        d="M30 26C0 26 0 77 28 77Q38 77 45 68Q25 83 17 60C48 65 53 29 30 26ZM28 31Q41 45 17 56Q15 40 28 31Z"
      />
      <path d="M25 26C-4 27-4 76 25 77" fill="none" stroke="var(--accent)" />
    </g>
    <text
      x="63"
      y="91"
      fill="var(--accent-ink)"
      font-family="Georgia, 'Times New Roman', serif"
      font-size="89"
      font-weight="700"
      textLength="426"
      lengthAdjust="spacingAndGlyphs"
    >
      -TAMBUA
    </text>
    <g transform="translate(493 12)">
      <path fill="var(--accent)" d="M4 48Q76-23 152 43L141 52Q74-10 4 48Z" />
      <path
        fill="var(--accent-ink)"
        d="M4 48Q67 109 153 49Q80 126 0 53Z"
      />
      <path
        fill="var(--accent-ink)"
        d="M5 49Q33 25 65 30Q38 37 17 51L43 72Z"
      />
      <path
        fill="var(--accent-ink)"
        d="M57 35Q44 51 59 63Q39 53 49 38Z"
      />
      <ellipse
        cx="78"
        cy="49"
        rx="18"
        ry="14"
        fill="var(--accent-ink)"
      />
      <circle cx="82" cy="44" r="6" fill="white" />
      <path fill="var(--accent)" d="M99 34Q116 49 101 66L93 68Q108 49 99 34Z" />
    </g>
  </svg>`,
  styles: `
    :host {
      display: inline-flex;
      width: var(--brand-width, 215px);
      max-width: 100%;
      flex-shrink: 0;
    }
    svg {
      display: block;
      width: 100%;
      height: auto;
      border-radius: 6px;
    }
    @media (max-width: 480px) {
      :host {
        width: var(--brand-width, 175px);
      }
    }
  `,
})
export class BrandLogoComponent {

}
