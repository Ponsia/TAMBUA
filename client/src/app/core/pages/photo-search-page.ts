import { ChangeDetectorRef, DestroyRef, Directive, OnDestroy, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, map, of, switchMap } from 'rxjs';
import { RecordItem, SearchResult } from '../models/records.model';
import { RecordsService } from '../services/records.service';
import { PhotoUploadService, photoProblem } from '../services/photo-upload.service';
import { apiError } from '../services/api-error';

/**
 * Search by photo: the image is stored through Django (MinIO), then the AI
 * engine compares it with every enrolled watchlist person and open case.
 */
@Directive()
export abstract class PhotoSearchPage implements OnDestroy {
  private readonly api = inject(RecordsService);
  private readonly photos = inject(PhotoUploadService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly changeDetector = inject(ChangeDetectorRef);
  selectedFile: File | null = null;
  previewUrl: string | null = null;
  /** Storage URL of the uploaded photo (reused if the search is retried). */
  uploadedPhotoUrl = '';
  isSearching = false;
  errorMessage = '';
  searchResult: SearchResult | null = null;
  /** The watchlist person or case the match points to. */
  matchedSubject: RecordItem | null = null;

  get imagePreview(): string | null {
    return this.previewUrl;
  }
  get searchPerformed(): boolean {
    return this.searchResult !== null;
  }
  get matchFound(): boolean {
    return this.searchResult?.outcome === 'MATCH_FOUND';
  }
  get subjectTypeLabel(): string {
    return this.searchResult?.subjectType === 'WATCHLIST' ? 'Watchlist person' : 'Missing person';
  }

  onFileSelected(event: Event): void {
    if (this.isSearching) return;
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.removeImage();
    const problem = photoProblem(file);
    if (problem) {
      this.errorMessage = problem;
      return;
    }
    this.selectedFile = file;
    this.previewUrl = URL.createObjectURL(file);
  }

  removeImage(): void {
    if (this.isSearching) return;
    this.releasePreview();
    this.selectedFile = null;
    this.previewUrl = null;
    this.searchResult = null;
    this.matchedSubject = null;
    this.uploadedPhotoUrl = '';
    this.errorMessage = '';
  }
  clearImage(): void {
    this.removeImage();
  }
  searchAgain(): void {
    this.removeImage();
  }

  searchPhoto(): void {
    if (this.isSearching || !this.selectedFile) return;
    this.isSearching = true;
    this.errorMessage = '';
    this.searchResult = null;
    this.matchedSubject = null;
    const file = this.selectedFile;
    const upload$ = this.uploadedPhotoUrl ? of(this.uploadedPhotoUrl) : this.photos.upload(file);
    upload$
      .pipe(
        switchMap((url) => {
          this.uploadedPhotoUrl = url;
          return this.api.searchByPhoto(url);
        }),
        switchMap((result) =>
          result.outcome === 'MATCH_FOUND' && result.subjectType && result.subjectId
            ? this.api.subject(result.subjectType, result.subjectId).pipe(
                map((subject) => ({ result, subject: subject as RecordItem | null })),
                catchError(() => of({ result, subject: null })),
              )
            : of({ result, subject: null }),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: ({ result, subject }) => {
          this.searchResult = result;
          this.matchedSubject = subject;
          this.isSearching = false;
          this.changeDetector.markForCheck();
        },
        error: (error) => {
          this.errorMessage = apiError(error);
          this.isSearching = false;
          this.changeDetector.markForCheck();
        },
      });
  }
  confidencePercentage(score: number | null | undefined): string {
    return score == null ? '—' : `${Math.round(score * 100)}%`;
  }
  ngOnDestroy(): void {
    this.releasePreview();
  }
  private releasePreview(): void {
    if (this.previewUrl) URL.revokeObjectURL(this.previewUrl);
  }
}
