import { RevealDirective } from './reveal.directive';
import { BrandLogoComponent } from '../../shared/components/brand-logo/brand-logo';
import { Component, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  LucideArrowUpRight,
  LucideCheck,
  LucideCctv,
  LucideFileText,
  LucideRoute,
  LucideScanFace,
  LucideShieldCheck,
  LucideUsers,
} from '@lucide/angular';

@Component({
  selector: 'app-landing-content',
  imports: [
    RevealDirective,
    BrandLogoComponent,
    RouterLink,
    LucideArrowUpRight,
    LucideCheck,
    LucideCctv,
    LucideFileText,
    LucideRoute,
    LucideScanFace,
    LucideShieldCheck,
    LucideUsers,
  ],
  templateUrl: './landing-content.html',
  styleUrls: ['./landing-shared.css', './landing-content.css', './landing-content-refinement.css'],
})
export class LandingContentComponent {
  readonly activeStep = signal(0);
  readonly steps = [
    {
      title: 'Start with the person.',
      description:
        'Keep essential case details, last-seen information and reporting contacts together. Give every investigation a clear starting point.',
      label: 'CASE MANAGEMENT',
      status: 'OPEN',
      detail: 'A clear record. A shared starting point.',
      items: [
        'Person and case information',
        'Last-seen date and location',
        'Reporting contact and assigned officer',
      ],
    },
    {
      title: 'Connect the evidence.',
      description:
        'Review detection frames, camera locations and available clips. Confirm a sighting only after an authorized person has reviewed the evidence.',
      label: 'EVIDENCE REVIEW',
      status: 'PENDING REVIEW',
      detail: 'Context before conclusions.',
      items: [
        'Camera and detection information',
        'Snapshot and available video evidence',
        'Human confirmation or rejection',
      ],
    },
    {
      title: 'Move forward, together.',
      description:
        'Follow confirmed movements and keep case progress visible. Investigators advance a case from open to found, then close it when their work is complete.',
      label: 'INVESTIGATION PROGRESS',
      status: 'FOUND',
      detail: 'Every verified step matters.',
      items: [
        'Confirmed movement timeline',
        'Clear case status transitions',
        'Activity records and reports',
      ],
    },
  ];
}
