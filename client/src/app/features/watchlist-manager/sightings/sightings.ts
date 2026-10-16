import { DatePipe } from '@angular/common';
import { EvidenceComponent } from '../../../shared/components/evidence/evidence';
import { RecordsPage } from '../../../core/pages/records-page';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';

import {
  LucideSearch,
  LucideCctv,
  LucideClock3,
  LucideCircleCheck,
  LucideCircleX,
  LucideX,
  LucideCheck,
  LucideCamera,
  LucideCalendarDays,
} from '@lucide/angular';

@Component({
  selector: 'app-sightings',
  standalone: true,

  imports: [
    DatePipe,
    EvidenceComponent,
    LucideSearch,
    LucideCctv,
    LucideClock3,
    LucideCircleCheck,
    LucideCircleX,
    LucideX,
    LucideCheck,
    LucideCamera,
    LucideCalendarDays,
    FormsModule,
  ],

  templateUrl: './sightings.html',
  styleUrl: './sightings.css',
})
export class SightingsComponent extends RecordsPage {
  readonly resource = 'sightings' as const;
}
