import { DatePipe } from '@angular/common';
import { TimelinePage } from '../../../core/pages/timeline-page';
import { EvidenceComponent } from '../../../shared/components/evidence/evidence';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { LucideActivity, LucideSearch, LucideUserSearch, LucideShieldAlert } from '@lucide/angular';

@Component({
  selector: 'app-movement-timeline',
  standalone: true,

  imports: [
    DatePipe,
    EvidenceComponent,
    FormsModule,
    LucideActivity,
    LucideSearch,
    LucideUserSearch,
    LucideShieldAlert,
  ],

  templateUrl: './movement-timeline.html',
  styleUrl: './movement-timeline.css',
})
export class MovementTimelineComponent extends TimelinePage {}
