import { DatePipe } from '@angular/common';

import { RecordsPage } from '../../../core/pages/records-page';
import { FormsModule } from '@angular/forms';
import { Component } from '@angular/core';

import {
  LucideShieldAlert,
  LucideUsers,
  LucideShieldCheck,
  LucideCircleX,
  LucideSearch,
  LucideSlidersHorizontal,
} from '@lucide/angular';

@Component({
  selector: 'app-watchlist',
  standalone: true,

  imports: [
    DatePipe,
    FormsModule,
    LucideShieldAlert,
    LucideUsers,
    LucideShieldCheck,
    LucideCircleX,
    LucideSearch,
    LucideSlidersHorizontal,
  ],

  templateUrl: './watchlist.html',
  styleUrl: './watchlist.css',
})
export class WatchlistComponent extends RecordsPage {
  readonly resource = 'watchlistPersons' as const;
}
