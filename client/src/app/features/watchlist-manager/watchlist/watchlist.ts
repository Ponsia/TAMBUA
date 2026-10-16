import { Component, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { catchError, of, switchMap, map, tap } from 'rxjs';
import { RecordsService } from '../../../core/services/records.service';
import { PhotoUploadService } from '../../../core/services/photo-upload.service';
import { RecordItem } from '../../../core/models/records.model';
import { AuthService } from '../../../core/services/auth.service';
import { NotificationService } from '../../../core/services/notification.service';
import { photoProblem } from '../../../core/services/photo-upload.service';
import { apiError } from '../../../core/services/api-error';

import {
  LucidePlus,
  LucideSearch,
  LucideSlidersHorizontal,
  LucideUserSearch,
  LucideX,
  LucideUpload,
  LucideImage,
  LucideTrash,
} from '@lucide/angular';

export interface PersonOut {
  reason: string;
  risk_level: string;
  id: string;
  full_name: string;
  category: string;
  status: string;
  last_seen_date: string | null;
  last_seen_location: string | null;
  reporting_contact: string;
  /** Absolute MinIO URL, e.g. http://localhost:9000/tambua-persons/persons/... */
  photo_url: string | null;
  created_at: string;
  updated_at: string;
}

interface PersonForm {
  reason: string;
  riskLevel: string;
  fullName: string;
  category: string;
  reportingContact: string;
  lastSeenDate: string;
  lastSeenLocation: string;
}

@Component({
  selector: 'app-watchlist',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    LucidePlus,
    LucideSearch,
    LucideSlidersHorizontal,
    LucideUserSearch,
    LucideX,
    LucideUpload,
    LucideImage,
    LucideTrash,
  ],
  templateUrl: './watchlist.html',
  styleUrl: './watchlist.css',
})
export class watchlist implements OnInit {
  private readonly api = inject(RecordsService);
  private readonly photos = inject(PhotoUploadService);

  private readonly cdr = inject(ChangeDetectorRef);
  private readonly auth = inject(AuthService);
  private readonly notices = inject(NotificationService);

  loading = false;
  saving = false;
  loaded = false;
  errorMessage = '';
  relatedError = '';

  records: PersonOut[] = [];

  // Filters
  searchTerm = '';
  selectedStatus: 'ALL' | 'ACTIVE' | 'REMOVED' = 'ALL';
  selectedCategory = 'ALL';

  // Pagination
  pageIndex = 0;
  pageSize = 10;

  /** Only watchlist managers may create or edit records (enforced by the API too). */
  get canManage(): boolean {
    return this.auth.getRole() === 'WATCHLIST_MANAGER';
  }

  // Modal (create / edit)
  showCaseForm = false;
  editingId: string | null = null;

  form: PersonForm = this.blankForm();

  photoFile: File | null = null;
  /** Uploaded in this form but not yet enrolled (kept across a failed save). */
  private unenrolledPhotoUrl: string | null = null;
  /** Either a blob: URL (freshly picked file) or an absolute MinIO URL (edit mode). */
  photoPreview: string | null = null;

  // Delete confirmation
  pendingDelete: PersonOut | null = null;
  deletingId: string | null = null;

  // Toast
  successMessage = '';
  private toastTimer: ReturnType<typeof setTimeout> | null = null;

  ngOnInit(): void {
    this.reload();
  }

  private blankForm(): PersonForm {
    return {
      reason: '',
      riskLevel: '',
      fullName: '',
      category: '',
      reportingContact: '',
      lastSeenDate: '',
      lastSeenLocation: '',
    };
  }

  reload(): void {
    this.loading = true;
    this.errorMessage = '';

    this.api.all('watchlistPersons').pipe(
      map((rows) => rows.map((row) => this.toPerson(row))),
    ).subscribe({
      next: (rows) => {
        this.records = rows ?? [];
        this.loaded = true;
        this.loading = false;
        if (this.pageIndex >= this.pageCount) {
          this.pageIndex = Math.max(0, this.pageCount - 1);
        }
        this.cdr.markForCheck();
      },
      error: (err: HttpErrorResponse) => {
        this.errorMessage = this.extractError(err, 'Failed to load records');
        this.loading = false;
        this.cdr.markForCheck();
      },
    });
  }

  filtersChanged(): void {
    this.pageIndex = 0;
  }

  onStatusChange(): void {
    // no-op — (ngModelChange) already triggers filtersChanged()
  }

  get filteredRecords(): PersonOut[] {
    const q = this.searchTerm.trim().toLowerCase();
    return this.records.filter((r) => {
      if (this.selectedStatus !== 'ALL' && r.status !== this.selectedStatus) return false;
      if (this.selectedCategory !== 'ALL' && r.risk_level !== this.selectedCategory) return false;
      if (q) {
        const hay = `${r.full_name} ${r.reason}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }

  get pageCount(): number {
    return Math.max(1, Math.ceil(this.filteredRecords.length / this.pageSize));
  }

  get displayedRecords(): PersonOut[] {
    const start = this.pageIndex * this.pageSize;
    return this.filteredRecords.slice(start, start + this.pageSize);
  }

  get highRiskCount(): number {
    return this.records.filter((record) => record.risk_level === 'HIGH').length;
  }

  count(status?: 'ACTIVE' | 'REMOVED'): number {
    if (!status) return this.records.length;
    return this.records.filter((r) => r.status === status).length;
  }

  openAddCase(): void {
    if (!this.canManage || this.saving) return;
    this.editingId = null;
    this.form = this.blankForm();
    this.clearPhoto();
    this.unenrolledPhotoUrl = null;
    this.errorMessage = '';
    this.showCaseForm = true;
  }

  openForm(record: PersonOut): void {
    if (!this.canManage || this.saving) return;
    this.editingId = record.id;
    this.form = {
      reason: record.reason,
      riskLevel: record.risk_level,
      fullName: record.full_name,
      category: record.category,
      reportingContact: record.reporting_contact,
      lastSeenDate: record.last_seen_date ?? '',
      lastSeenLocation: record.last_seen_location ?? '',
    };
    this.clearPhoto();
    // photo_url is already an absolute MinIO URL — use it as-is.
    this.photoPreview = record.photo_url ?? null;
    this.errorMessage = '';
    this.showCaseForm = true;
  }

  closeCaseForm(): void {
    if (this.saving) return;
    this.showCaseForm = false;
    this.editingId = null;
    this.form = this.blankForm();
    this.clearPhoto();
    this.unenrolledPhotoUrl = null;
    this.errorMessage = '';
  }

  onPhotoSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    input.value = '';
    if (this.saving || !file) return;
    const problem = photoProblem(file);
    if (problem) {
      this.errorMessage = problem;
      return;
    }

    if (this.photoPreview?.startsWith('blob:')) {
      URL.revokeObjectURL(this.photoPreview);
    }

    this.photoFile = file;
    this.photoPreview = file ? URL.createObjectURL(file) : null;
  }

  clearPhoto(): void {
    if (this.photoPreview?.startsWith('blob:')) {
      URL.revokeObjectURL(this.photoPreview);
    }
    this.photoFile = null;
    this.photoPreview = null;
  }

  onPhotoError(event: Event): void {
    const img = event.target as HTMLImageElement;
    img.style.display = 'none';
  }

  saveRecord(): void {
    if (this.saving) return;

    if (!this.form.fullName.trim()) {
      this.errorMessage = 'Full name is required.';
      return;
    }
    if (!this.form.riskLevel) {
      this.errorMessage = 'Risk level is required.';
      return;
    }
    if (!this.form.reason.trim()) {
      this.errorMessage = 'Reason is required.';
      return;
    }
    if (this.editingId === null && !this.photoFile && !this.photoPreview) {
      this.errorMessage = 'Please upload a photo.';
      return;
    }

    this.saving = true;
    this.errorMessage = '';

    const isEdit = this.editingId !== null;
    const photo$ = this.photoFile
      ? this.photos.upload(this.photoFile).pipe(tap((url) => (this.unenrolledPhotoUrl = url)))
      : of(this.photoPreview);
    const req$ = photo$.pipe(switchMap((photoUrl) => {
      // Keep a successful upload if saving the record fails, so retry does not upload twice.
      this.clearPhoto();
      this.photoPreview = photoUrl;
      const input: Record<string, unknown> = {
        ...(isEdit ? {} : { fullName: this.form.fullName.trim() }),
        photoUrl: photoUrl || '',
        reason: this.form.reason.trim(),
        riskLevel: this.form.riskLevel,
      };
      return this.api.save('watchlistPersons', input, this.editingId ?? undefined).pipe(
        switchMap((record) =>
          photoUrl && photoUrl === this.unenrolledPhotoUrl
            ? this.api.enrollFace('WATCHLIST', record.id, photoUrl).pipe(
                map(() => ({ record, enrollError: '' })),
                catchError((error) => of({ record, enrollError: apiError(error) })),
              )
            : of({ record, enrollError: '' }),
        ),
        map(({ record, enrollError }) => {
          if (enrollError) {
            this.notices.error(`The watchlist person was saved, but its face could not be enrolled: ${enrollError}`);
          } else if (photoUrl && photoUrl === this.unenrolledPhotoUrl) {
            this.notices.success('Face enrolled for recognition.');
          }
          this.unenrolledPhotoUrl = null;
          return this.toPerson(record);
        }),
      );
    }));

    req$.subscribe({
      next: (saved) => {
        this.saving = false;
        this.showCaseForm = false;
        this.editingId = null;
        this.form = this.blankForm();
        this.clearPhoto();
        this.reload();
        this.showSuccess(
          isEdit ? `Updated "${saved.full_name}".` : `Registered "${saved.full_name}".`,
        );
        this.cdr.markForCheck();
      },
      error: (err: HttpErrorResponse) => {
        this.saving = false;
        this.errorMessage = this.extractError(err, 'Failed to save watchlist person');
        this.cdr.markForCheck();
      },
    });
  }

  askDelete(record: PersonOut): void {
    if (!this.canManage || this.saving || this.deletingId !== null) return;
    this.pendingDelete = record;
    this.errorMessage = '';
  }

  cancelDelete(): void {
    if (this.deletingId !== null) return;
    this.pendingDelete = null;
    this.errorMessage = '';
  }

  confirmDelete(): void {
    const record = this.pendingDelete;
    if (!record) return;

    this.deletingId = record.id;
    this.errorMessage = '';

    this.api.changeStatus('watchlistPersons', record.id, 'REMOVED').subscribe({
      next: () => {
        this.deletingId = null;
        this.pendingDelete = null;
        this.reload();
        this.showSuccess(`Removed "${record.full_name}".`);
        this.cdr.markForCheck();
      },
      error: (err: HttpErrorResponse) => {
        this.deletingId = null;
        this.errorMessage = this.extractError(err, 'Failed to delete watchlist person');
        this.cdr.markForCheck();
      },
    });
  }

  initials(name: string): string {
    if (!name) return '?';
    const parts = name.trim().split(/\s+/);
    const a = parts[0]?.[0] ?? '';
    const b = parts.length > 1 ? parts[parts.length - 1][0] : '';
    return (a + b).toUpperCase() || '?';
  }

  private toPerson(record: RecordItem): PersonOut {
    return {
      id: record.id,
      full_name: record.fullName || '',
      photo_url: record.photoUrl || null,
      category: record.category || '',
      status: record.status || '',
      last_seen_date: record.lastSeenDate || null,
      last_seen_location: record.lastSeenLocation || null,
      reporting_contact: record.reportingContact || '',
      created_at: record.createdAt || '',
      updated_at: '',
      reason: record.reason || '',
      risk_level: record.riskLevel || '',
    };
  }

  private showSuccess(msg: string): void {
    this.successMessage = msg;
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      this.successMessage = '';
      this.cdr.markForCheck();
    }, 3000);
  }

  private extractError(err: Error | HttpErrorResponse, fallback: string): string {
    if (!(err instanceof HttpErrorResponse)) return err.message || fallback;
    if (err.status === 0) {
      return 'Cannot reach the backend. Check your network connection.';
    }
    const body = err.error;
    if (typeof body === 'string') return body;
    if (body && typeof body === 'object') {
      if (typeof body.detail === 'string') return body.detail;
      if (Array.isArray(body.detail)) {
        return body.detail.map((d: any) => `${d.loc?.join('.')}: ${d.msg}`).join('; ');
      }
    }
    return `${fallback} (HTTP ${err.status})`;
  }
}

// Preserve the existing class name and the name expected by the route.
export { watchlist as WatchlistComponent };
