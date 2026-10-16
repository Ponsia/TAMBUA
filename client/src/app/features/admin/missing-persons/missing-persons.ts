import { DatePipe } from '@angular/common';

import { RecordsPage } from '../../../core/pages/records-page';
import { FormsModule } from '@angular/forms';
import { Component } from '@angular/core';

import {
  LucideUserSearch,
  LucideFolderOpen,
  LucideUserCheck,
  LucideCircleCheck,
  LucideSearch,
  LucideSlidersHorizontal,
} from '@lucide/angular';

@Component({
  selector: 'app-missing-persons',
  standalone: true,

  imports: [
    DatePipe,
    FormsModule,
    LucideUserSearch,
    LucideFolderOpen,
    LucideUserCheck,
    LucideCircleCheck,
    LucideSearch,
    LucideSlidersHorizontal,
  ],

  templateUrl: './missing-persons.html',
  styleUrl: './missing-persons.css',
})
export class MissingPersonsComponent extends RecordsPage {
  readonly resource = 'missingPersonCases' as const;
}
