import { DatePipe } from '@angular/common';
import { DashboardPage } from '../../../core/pages/dashboard-page';
import { ChangeDetectorRef, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { catchError, map, of, switchMap } from 'rxjs';
import { RecordItem, SearchResult } from '../../../core/models/records.model';
import { RecordsService } from '../../../core/services/records.service';
import { PhotoUploadService, photoProblem } from '../../../core/services/photo-upload.service';
import { apiError } from '../../../core/services/api-error';

import {
  LucideUsers,
  LucideUserCheck,
  LucideFileText,
  LucideShieldAlert,
  LucideCctv,
  LucideActivity,
  LucideSearch,
  LucideUpload,
  LucideImage,
  LucideChevronRight,
  LucideArrowRight,
  LucideInfo,
  LucideCalendarDays,
} from '@lucide/angular';

@Component({
  selector: 'app-dashboard',
  standalone: true,

  imports: [
    DatePipe,
    RouterLink,
    LucideUsers,
    LucideUserCheck,
    LucideFileText,
    LucideShieldAlert,
    LucideCctv,
    LucideActivity,
    LucideSearch,
    LucideUpload,
    LucideImage,
    LucideChevronRight,
    LucideArrowRight,
    LucideInfo,
    LucideCalendarDays,
  ],

  templateUrl: './dashboard.html',
  styleUrls: ['./dashboard.css', './dashboard-responsive.css', '../../../shared/styles/dashboard.css'],
})
export class DashboardComponent extends DashboardPage {
  private readonly previewChangeDetector = inject(ChangeDetectorRef);
  private readonly searchDestroyRef = inject(DestroyRef);
  private readonly photos = inject(PhotoUploadService);
  private readonly recordsApi = inject(RecordsService);
  previewError = '';
  selectedFile: File | null = null;
  imagePreview: string | null = null;
  searching = false;
  searchResult: SearchResult | null = null;
  matchedSubject: RecordItem | null = null;

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file || this.searching) return;
    this.clearImage();
    const problem = photoProblem(file);
    if (problem) {
      this.previewError = problem;
      return;
    }
    this.selectedFile = file;
    this.imagePreview = URL.createObjectURL(file);
  }

  clearImage(): void {
    if (this.searching) return;
    if (this.imagePreview) URL.revokeObjectURL(this.imagePreview);
    this.previewError = '';
    this.selectedFile = null;
    this.imagePreview = null;
    this.searchResult = null;
    this.matchedSubject = null;
  }

  search(): void {
    if (!this.selectedFile || this.searching) return;
    this.searching = true;
    this.previewError = '';
    this.searchResult = null;
    this.matchedSubject = null;
    this.photos
      .upload(this.selectedFile)
      .pipe(
        switchMap((url) => this.recordsApi.searchByPhoto(url)),
        switchMap((result) =>
          result.outcome === 'MATCH_FOUND' && result.subjectType && result.subjectId
            ? this.recordsApi.subject(result.subjectType, result.subjectId).pipe(
                map((subject) => ({ result, subject: subject as RecordItem | null })),
                catchError(() => of({ result, subject: null })),
              )
            : of({ result, subject: null }),
        ),
        takeUntilDestroyed(this.searchDestroyRef),
      )
      .subscribe({
        next: ({ result, subject }) => {
          this.searchResult = result;
          this.matchedSubject = subject;
          this.searching = false;
          this.previewChangeDetector.markForCheck();
        },
        error: (error) => {
          this.previewError = apiError(error);
          this.searching = false;
          this.previewChangeDetector.markForCheck();
        },
      });
  }

  confidencePercentage(score: number | null | undefined): string {
    return score == null ? '—' : `${Math.round(score * 100)}%`;
  }
}
