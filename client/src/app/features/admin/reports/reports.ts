import { NotificationService } from '../../../core/services/notification.service';
import { ChangeDetectorRef, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ReportsService, ReportFormat, ReportType } from '../../../core/services/reports.service';
import { apiError } from '../../../core/services/api-error';
import { Component } from '@angular/core';

import {
  LucideFileText,
  LucideShieldCheck,
  LucideActivity,
  LucideFolderOpen,
  LucideCalendarDays,
  LucideFileSpreadsheet,
  LucideFileDown,
} from '@lucide/angular';

@Component({
  selector: 'app-reports',
  standalone: true,

  imports: [
    FormsModule,
    LucideFileText,
    LucideShieldCheck,
    LucideActivity,
    LucideFolderOpen,
    LucideCalendarDays,
    LucideFileSpreadsheet,
    LucideFileDown,
  ],

  templateUrl: './reports.html',
  styleUrl: './reports.css',
})
export class ReportsComponent {
  private readonly feedback = inject(NotificationService);
  private readonly reports = inject(ReportsService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly changeDetector = inject(ChangeDetectorRef);
  reportType: ReportType | '' = '';
  format: ReportFormat = 'csv';
  dateFrom = '';
  dateTo = '';
  downloading = false;
  errorMessage = '';

  generateReport(): void {
    if (this.downloading) return;
    this.errorMessage = '';
    if (!this.reportType) {
      this.errorMessage = 'Select a report type.';
      return;
    }
    if (this.dateFrom && this.dateTo && this.dateFrom > this.dateTo) {
      this.errorMessage = 'The start date must be on or before the end date.';
      return;
    }
    this.downloading = true;
    const report = this.reportType;
    const format = this.format;
    this.reports
      .download(report, format, this.dateFrom, this.dateTo)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.downloading = false;
          if (!response.body?.size) {
            this.errorMessage = 'The server returned an empty report.';
            this.feedback.error(this.errorMessage);
          } else {
            const url = URL.createObjectURL(response.body);
            const link = document.createElement('a');
            link.href = url;
            link.download = `${report}.${format}`;
            document.body.appendChild(link);
            link.click();
            this.feedback.success('Report prepared. Download started.');
            link.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
          }
          this.changeDetector.markForCheck();
        },
        error: (error) => {
          this.downloading = false;
          this.errorMessage = apiError(error);
          this.feedback.error(this.errorMessage);
          this.changeDetector.markForCheck();
        },
      });
  }
}
