import { DatePipe } from '@angular/common';

import { RecordsPage } from '../../../core/pages/records-page';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';

import {
  LucideSearch,
  LucideShieldAlert,
  LucideEye,
  LucideX,
  LucideCalendarDays,
  LucideUserRound,
} from '@lucide/angular';

@Component({
  selector: 'app-watchlist',
  standalone: true,

  imports: [
    DatePipe,
    LucideSearch,
    LucideShieldAlert,
    LucideEye,
    LucideX,
    LucideCalendarDays,
    LucideUserRound,
    FormsModule,
  ],

  templateUrl: './watchlist.html',
  styleUrl: './watchlist.css',
})
export class WatchlistComponent extends RecordsPage {
  readonly resource = 'watchlistPersons' as const;
}
