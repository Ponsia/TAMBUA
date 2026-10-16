import { DatePipe } from '@angular/common';
import { EvidenceComponent } from '../../../shared/components/evidence/evidence';
import { RecordsPage } from '../../../core/pages/records-page';
import { FormsModule } from '@angular/forms';
import { Component } from '@angular/core';

import {
  LucideMapPin,
  LucideClock3,
  LucideCircleCheck,
  LucideCircleX,
  LucideSearch,
  LucideSlidersHorizontal,
  LucideCamera,
} from '@lucide/angular';

@Component({
  selector: 'app-sightings',
  standalone: true,

  imports: [
    DatePipe,
    EvidenceComponent,
    FormsModule,
    LucideMapPin,
    LucideClock3,
    LucideCircleCheck,
    LucideCircleX,
    LucideSearch,
    LucideSlidersHorizontal,
    LucideCamera,
  ],

  templateUrl: './sightings.html',
  styleUrl: './sightings.css',
})
export class SightingsComponent extends RecordsPage {
  readonly resource = 'sightings' as const;
}
