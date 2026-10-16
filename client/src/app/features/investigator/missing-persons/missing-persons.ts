import { RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';

import { RecordsPage } from '../../../core/pages/records-page';
import { Component } from '@angular/core';

import { FormsModule } from '@angular/forms';

import {
  LucideSearch,
  LucideSlidersHorizontal,
  LucideUserSearch,
  LucideMapPin,
  LucideCalendarDays,
  LucidePhone,
  LucideX,
  LucideCircleCheck,
  LucideFolderCheck,
} from '@lucide/angular';

@Component({
  selector: 'app-missing-persons',
  standalone: true,

  imports: [
    RouterLink,
    DatePipe,
    LucideSearch,
    LucideSlidersHorizontal,
    LucideUserSearch,
    LucideMapPin,
    LucideCalendarDays,
    LucidePhone,
    LucideX,
    LucideCircleCheck,
    LucideFolderCheck,
    FormsModule,
  ],

  templateUrl: './missing-persons.html',
  styleUrl: './missing-persons.css',
})
export class MissingPersonsComponent extends RecordsPage {
  readonly resource = 'missingPersonCases' as const;
}
