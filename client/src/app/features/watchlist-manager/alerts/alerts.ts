import { DatePipe } from '@angular/common';
import { EvidenceComponent } from '../../../shared/components/evidence/evidence';
import { RecordsPage } from '../../../core/pages/records-page';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';

import {
  LucideSearch,
  LucideShieldAlert,
  LucideClock3,
  LucideCircleCheck,
  LucideCircleX,
  LucideCamera,
  LucideX,
  LucideCheck,
  LucideMapPin,
  LucideCalendarDays,
} from '@lucide/angular';

@Component({
  selector: 'app-alerts',
  standalone: true,

  imports: [
    DatePipe,
    EvidenceComponent,
    LucideSearch,
    LucideShieldAlert,
    LucideClock3,
    LucideCircleCheck,
    LucideCircleX,
    LucideCamera,
    LucideX,
    LucideCheck,
    LucideMapPin,
    LucideCalendarDays,
    FormsModule,
  ],

  templateUrl: './alerts.html',
  styleUrl: './alerts.css',
})
export class AlertsComponent extends RecordsPage {
  readonly resource = 'alerts' as const;
}
