import { DatePipe, JsonPipe } from '@angular/common';

import { RecordsPage } from '../../../../core/pages/records-page';
import { FormsModule } from '@angular/forms';
import { Component } from '@angular/core';

import {
  LucideShieldCheck,
  LucideActivity,
  LucideSearch,
  LucideSlidersHorizontal,
  LucideUserRound,
  LucideClock3,
} from '@lucide/angular';

@Component({
  selector: 'app-audit-logs',
  standalone: true,

  imports: [
    DatePipe,
    JsonPipe,
    FormsModule,
    LucideShieldCheck,
    LucideActivity,
    LucideSearch,
    LucideSlidersHorizontal,
    LucideUserRound,
    LucideClock3,
  ],

  templateUrl: './audit-logs.html',
  styleUrl: './audit-logs.css',
})
export class AuditLogsComponent extends RecordsPage {
  readonly resource = 'auditLogs' as const;
}
