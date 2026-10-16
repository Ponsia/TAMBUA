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
  LucideMapPin,
  LucideCalendarDays,
  LucidePhone,
  LucideX,
  LucideUpload,
  LucideImage,
} from '@lucide/angular';

export interface PersonOut {
  id: string;
  full_name: string;
  category: string;
  status: string;
  last_seen_date: string | null;
  last_seen_location: string | null;
  reporting_contact: string;
  case_officer_id: string | null;
  /** Absolute MinIO URL, e.g. http://localhost:9000/tambua-persons/persons/... */
  photo_url: string | null;
  created_at: string;
  updated_at: string;
}

interface PersonForm {
  fullName: string;
  category: string;
  reportingContact: string;
  caseOfficerId: string;
  lastSeenDate: string;
  lastSeenLocation: string;
}

@Component({
  selector: 'app-missing-persons',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    LucidePlus,
    LucideSearch,
    LucideSlidersHorizontal,
    LucideUserSearch,
    LucideMapPin,
    LucideCalendarDays,
    LucidePhone,
    LucideX,
    LucideUpload,
    LucideImage,
  ],
  templateUrl: './missing-persons.html',
  styleUrl: './missing-persons.css',
})
export class MissingPersonsComponent implements OnInit {
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
  caseOfficers: { id: string; fullName: string; station: string }[] = [];

  // Filters
  searchTerm = '';
  selectedStatus: 'ALL' | 'OPEN' | 'FOUND' | 'CLOSED' = 'ALL';
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

  // Toast
  successMessage = '';
  private toastTimer: ReturnType<typeof setTimeout> | null = null;

  ngOnInit(): void {
    this.reload();
    this.api.caseOfficers().subscribe({
      next: (officers) => {
        this.caseOfficers = officers;
        this.cdr.markForCheck();
      },
      error: () => {
        this.relatedError = 'Case officers could not be loaded; cases can still be saved unassigned.';
        this.cdr.markForCheck();
      },
    });
  }

  officerName(id: string | null): string {
    return this.caseOfficers.find((officer) => officer.id === id)?.fullName || '—';
  }

  private blankForm(): PersonForm {
    return {
      fullName: '',
      category: '',
      reportingContact: '',
      caseOfficerId: '',
      lastSeenDate: '',
      lastSeenLocation: '',
    };
  }

  reload(): void {
    this.loading = true;
    this.errorMessage = '';

    this.api.all('missingPersonCases').pipe(
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
      if (this.selectedCategory !== 'ALL' && r.category !== this.selectedCategory) return false;
      if (q) {
        const hay = `${r.full_name} ${r.last_seen_location ?? ''}`.toLowerCase();
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

  count(status?: 'OPEN' | 'FOUND' | 'CLOSED'): number {
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
      fullName: record.full_name,
      category: record.category,
      reportingContact: record.reporting_contact,
      caseOfficerId: record.case_officer_id ?? '',
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

  /** Falls back to a placeholder if the remote image 404s or is blocked. */
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
    if (!this.form.category) {
      this.errorMessage = 'Category is required.';
      return;
    }
    if (!this.form.reportingContact.trim()) {
      this.errorMessage = 'Reporting contact is required.';
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
        fullName: this.form.fullName.trim(),
        photoUrl: photoUrl || '',
        category: this.form.category,
        reportingContact: this.form.reportingContact.trim(),
        caseOfficerId: this.form.caseOfficerId || null,
        lastSeenLocation: this.form.lastSeenLocation.trim(),
        lastSeenDate: this.form.lastSeenDate || null,
      };
      return this.api.save('missingPersonCases', input, this.editingId ?? undefined).pipe(
        switchMap((record) =>
          photoUrl && photoUrl === this.unenrolledPhotoUrl
            ? this.api.enrollFace('MISSING_PERSON', record.id, photoUrl).pipe(
                map(() => ({ record, enrollError: '' })),
                catchError((error) => of({ record, enrollError: apiError(error) })),
              )
            : of({ record, enrollError: '' }),
        ),
        map(({ record, enrollError }) => {
          if (enrollError) {
            this.notices.error(`The case was saved, but its face could not be enrolled: ${enrollError}`);
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
        this.errorMessage = this.extractError(err, 'Failed to save case');
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
      case_officer_id: record.caseOfficerId || null,
      created_at: record.createdAt || '',
      updated_at: '',
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