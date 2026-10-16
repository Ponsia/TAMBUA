import { DatePipe } from '@angular/common';
import { EvidenceComponent } from '../../../shared/components/evidence/evidence';
import { RecordsPage } from '../../../core/pages/records-page';
import { FormsModule } from '@angular/forms';
import { Component } from '@angular/core';

import {
  LucideActivity,
  LucideClock3,
  LucideCircleCheck,
  LucideCircleX,
  LucideSearch,
  LucideSlidersHorizontal,
  LucideCamera,
} from '@lucide/angular';

@Component({
  selector: 'app-alerts',
  standalone: true,

  imports: [
    DatePipe,
    EvidenceComponent,
    FormsModule,
    LucideActivity,
    LucideClock3,
    LucideCircleCheck,
    LucideCircleX,
    LucideSearch,
    LucideSlidersHorizontal,
    LucideCamera,
  ],

  templateUrl: './alerts.html',
  styleUrl: './alerts.css',
})
export class AlertsComponent extends RecordsPage {
  readonly resource = 'alerts' as const;
}
