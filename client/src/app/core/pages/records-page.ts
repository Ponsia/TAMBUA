import { LiveEventsService } from '../services/live-events.service';
import { ChangeDetectorRef, DestroyRef, Directive, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { Observable, catchError, forkJoin, of } from 'rxjs';
import { RecordItem, Resource } from '../models/records.model';
import { AuthService } from '../services/auth.service';
import { RecordsService } from '../services/records.service';
import { apiError } from '../services/api-error';

@Directive()
export abstract class RecordsPage implements OnInit {
  private readonly live = inject(LiveEventsService);
  liveError = '';
  private readonly liveUpdates = new Map<string, RecordItem>();
  private reloadVersion = 0;
  protected readonly api = inject(RecordsService);
  protected readonly destroyRef = inject(DestroyRef);
  protected readonly changeDetector = inject(ChangeDetectorRef);
  protected readonly route = inject(ActivatedRoute);
  readonly auth = inject(AuthService);
  abstract readonly resource: Resource;
  records: RecordItem[] = [];
  cameras: RecordItem[] = [];
  subjects: RecordItem[] = [];
  loading = true;
  loaded = false;
  saving = false;
  errorMessage = '';
  relatedError = '';
  searchTerm = '';
  selectedStatus = 'ALL';
  selectedCategory = 'ALL';
  selectedRisk = 'ALL';
  selectedDate = '';
  pageIndex = 0;
  readonly pageSize = 20;
  selectedRecord: RecordItem | null = null;
  showCaseForm = false;
  showPersonForm = false;
  showCameraForm = false;
  editingId: string | undefined;
  form: Record<string, string> = {};

  ngOnInit(): void {
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      this.selectedStatus = params.get('status') || 'ALL';
      this.selectedCategory = params.get('category') || 'ALL';
      this.pageIndex = 0;
    });
    this.reload();
    if (this.resource === 'alerts' || this.resource === 'sightings') {
      this.live
        .events(this.resource)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (record) => {
            if (this.loading) this.liveUpdates.set(record.id, record);
            this.records = this.records.some((item) => item.id === record.id)
              ? this.records.map((item) => (item.id === record.id ? record : item))
              : [record, ...this.records];
            if (this.selectedRecord?.id === record.id) this.selectedRecord = record;
            this.pageIndex = Math.min(this.pageIndex, Math.max(0, this.pageCount - 1));
            this.changeDetector.markForCheck();
          },
          error: () => {
            this.liveError = 'Live updates disconnected. Refresh to load the latest records.';
            this.changeDetector.markForCheck();
          },
        });
    }
  }

  reload(): void {
    if (this.saving) return;
    const version = ++this.reloadVersion;
    this.liveUpdates.clear();
    this.loading = true;
    this.errorMessage = '';
    const detection = this.resource === 'alerts' || this.resource === 'sightings';
    const related = (resource: Resource) =>
      this.api.all(resource).pipe(
        catchError(() => {
          this.relatedError = 'Some names could not be loaded. Record IDs are shown instead.';
          return of([] as RecordItem[]);
        }),
      );
    this.relatedError = '';
    forkJoin({
      records: this.api.all(this.resource),
      cameras: detection ? related('cameras') : of([] as RecordItem[]),
      subjects: detection
        ? related(this.resource === 'alerts' ? 'watchlistPersons' : 'missingPersonCases')
        : of([] as RecordItem[]),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          if (version !== this.reloadVersion) return;
          const records = new Map(result.records.map((record) => [record.id, record]));
          this.liveUpdates.forEach((record, id) => records.set(id, record));
          this.liveUpdates.clear();
          this.records = [...records.values()];
          if (this.selectedRecord)
            this.selectedRecord = records.get(this.selectedRecord.id) || null;
          this.cameras = result.cameras;
          this.subjects = result.subjects;
          this.loading = false;
          this.loaded = true;
          this.pageIndex = Math.min(this.pageIndex, Math.max(0, this.pageCount - 1));
          this.changeDetector.markForCheck();
        },
        error: (error) => {
          if (version !== this.reloadVersion) return;
          this.loading = false;
          this.errorMessage = apiError(error);
          this.changeDetector.markForCheck();
        },
      });
  }

  get filteredRecords(): RecordItem[] {
    const search = this.searchTerm.trim().toLowerCase();
    return this.records.filter((record) => {
      const subject = this.subjects.find(
        (item) => item.id === (record.watchlistPersonId || record.caseId),
      );
      const camera = this.cameras.find((item) => item.id === record.cameraId);
      return (
        (!this.selectedStatus ||
          this.selectedStatus === 'ALL' ||
          record.status === this.selectedStatus) &&
        (!this.selectedCategory ||
          this.selectedCategory === 'ALL' ||
          record.category === this.selectedCategory) &&
        (!this.selectedRisk ||
          this.selectedRisk === 'ALL' ||
          (record.riskLevel || subject?.riskLevel) === this.selectedRisk) &&
        (!this.selectedDate ||
          (record.createdAt || record.detectedAt || '').startsWith(this.selectedDate)) &&
        (!search ||
          [
            record.id,
            record.fullName,
            record.name,
            record.reason,
            record.location,
            record.lastSeenLocation,
            record.reportingContact,
            record.actorId,
            record.action,
            record.entity,
            record.entityId,
            record.ip,
            record.cameraId,
            record.caseId,
            record.watchlistPersonId,
            subject?.fullName,
            camera?.name,
          ].some((value) => value?.toLowerCase().includes(search)))
      );
    });
  }

  get displayedRecords(): RecordItem[] {
    return this.filteredRecords.slice(
      this.pageIndex * this.pageSize,
      (this.pageIndex + 1) * this.pageSize,
    );
  }

  get pageCount(): number {
    return Math.ceil(this.filteredRecords.length / this.pageSize);
  }
  filtersChanged(): void {
    this.pageIndex = 0;
  }
  onStatusChange(): void {
    this.filtersChanged();
  }
  onCategoryChange(): void {
    this.filtersChanged();
  }
  count(status?: string): number {
    return status
      ? this.records.filter((record) => record.status === status).length
      : this.records.length;
  }
  riskCount(): number {
    return this.records.filter((record) => record.riskLevel === 'HIGH').length;
  }
  uniqueCount(field: 'actorId' | 'entity'): number {
    return new Set(this.records.map((record) => record[field]).filter(Boolean)).size;
  }
  recentCount(): number {
    return this.records.filter(
      (record) => Date.parse(record.createdAt || '') >= Date.now() - 86400000,
    ).length;
  }
  confidencePercentage(score: number | null | undefined): string {
    return score == null ? '—' : `${Math.round(score * 100)}%`;
  }
  cameraName(id?: string): string {
    return this.cameras.find((camera) => camera.id === id)?.name || id || '—';
  }
  cameraLocation(id?: string): string {
    return this.cameras.find((camera) => camera.id === id)?.location || '—';
  }
  subjectName(record: RecordItem | null): string {
    const id = record?.watchlistPersonId || record?.caseId;
    return this.subjects.find((subject) => subject.id === id)?.fullName || id || '—';
  }
  subjectRisk(record: RecordItem | null): string {
    return (
      this.subjects.find((subject) => subject.id === record?.watchlistPersonId)?.riskLevel || '—'
    );
  }

  viewRecord(record: RecordItem): void {
    this.selectedRecord = record;
    if (this.resource === 'auditLogs') {
      this.api
        .detail(this.resource, record.id)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (detail) => {
            if (this.selectedRecord?.id === detail.id) this.selectedRecord = detail;
            this.changeDetector.markForCheck();
          },
          error: (error) => {
            this.errorMessage = apiError(error);
            this.changeDetector.markForCheck();
          },
        });
    }
  }
  viewCase(record: RecordItem): void {
    this.viewRecord(record);
  }
  get selectedCase(): RecordItem | null {
    return this.selectedRecord;
  }
  get showAlertDetails(): boolean {
    return this.selectedRecord !== null;
  }
  get showSightingDetails(): boolean {
    return this.selectedRecord !== null;
  }
  closeCaseDetails(): void {
    this.selectedRecord = null;
  }
  closeAlertDetails(): void {
    if (!this.saving) this.selectedRecord = null;
  }
  closeSightingDetails(): void {
    if (!this.saving) this.selectedRecord = null;
  }

  openAddCase(): void {
    this.openForm();
  }
  openAddPerson(): void {
    this.openForm();
  }
  openForm(record?: RecordItem): void {
    if (!this.canManage || this.saving) return;
    this.editingId = record?.id;
    this.errorMessage = '';
    this.form = {};
    if (record)
      Object.entries(record).forEach(([key, value]) => {
        if (typeof value === 'string') this.form[key] = value;
      });
    this.showCaseForm = this.resource === 'missingPersonCases';
    this.showPersonForm = this.resource === 'watchlistPersons';
    this.showCameraForm = this.resource === 'cameras';
  }
  closeCaseForm(): void {
    this.closeForm();
  }
  closePersonForm(): void {
    this.closeForm();
  }
  closeForm(): void {
    if (this.saving) return;
    this.showCaseForm = this.showPersonForm = this.showCameraForm = false;
    this.editingId = undefined;
    this.form = {};
  }
  get canManage(): boolean {
    return this.resource === 'cameras'
      ? this.auth.getRole() === 'SYSTEM_OWNER_ADMIN'
      : ['missingPersonCases', 'watchlistPersons'].includes(this.resource) &&
          this.auth.getRole() === 'WATCHLIST_MANAGER';
  }
  get canReview(): boolean {
    return this.auth.getRole() === 'WATCHLIST_MANAGER';
  }
  saveRecord(): void {
    if (!this.canManage || this.saving || this.loading) return;
    const resource = this.resource as 'cameras' | 'watchlistPersons' | 'missingPersonCases';
    const fields =
      resource === 'cameras'
        ? ['name', 'location', 'zone', 'connectionType', 'streamSource', 'ipAddress', 'port', 'status']
        : resource === 'watchlistPersons'
          ? this.editingId
            ? ['reason', 'riskLevel']
            : ['fullName', 'reason', 'riskLevel']
          : [
              'fullName',
              'category',
              'lastSeenLocation',
              'lastSeenDate',
              'reportingContact',
              'caseOfficerId',
            ];
    const required =
      resource === 'cameras'
        ? ['name', 'location', 'connectionType', 'streamSource']
        : resource === 'watchlistPersons'
          ? this.editingId
            ? ['reason', 'riskLevel']
            : ['fullName', 'reason', 'riskLevel']
          : ['fullName', 'category', 'lastSeenLocation', 'reportingContact'];
    if (required.some((field) => !this.form[field]?.trim())) {
      this.errorMessage = 'Complete all required fields.';
      return;
    }
    const input: Record<string, unknown> = {};
    fields.forEach((field) => {
      const value = this.form[field]?.trim();
      if (value) input[field] = resource === 'cameras' && field === 'port' ? Number(value) : value;
      else if (['lastSeenDate', 'caseOfficerId', 'ipAddress', 'port', 'status'].includes(field))
        input[field] = null;
      else if (field === 'zone') input[field] = '';
    });
    this.runMutation(this.api.save(resource, input, this.editingId), true);
  }

  changeStatus(record: RecordItem, status: string): void {
    if (this.saving || this.loading) return;
    record = this.records.find((item) => item.id === record.id) || record;
    const role = this.auth.getRole();
    const allowed =
      this.resource === 'missingPersonCases'
        ? role === 'INVESTIGATOR' &&
          ((record.status === 'OPEN' && status === 'FOUND') ||
            (record.status === 'FOUND' && status === 'CLOSED'))
        : this.resource === 'cameras'
          ? role === 'SYSTEM_OWNER_ADMIN' && record.status !== 'DISABLED' && status === 'DISABLED'
          : this.resource === 'watchlistPersons'
            ? role === 'WATCHLIST_MANAGER' && record.status === 'ACTIVE' && status === 'REMOVED'
            : ['alerts', 'sightings'].includes(this.resource) &&
              role === 'WATCHLIST_MANAGER' &&
              record.status === 'PENDING' &&
              ['CONFIRMED', 'REJECTED'].includes(status);
    if (allowed) this.runMutation(this.api.changeStatus(this.resource, record.id, status));
  }
  markAsFound(): void {
    if (this.selectedRecord) this.changeStatus(this.selectedRecord, 'FOUND');
  }
  closeCase(): void {
    if (this.selectedRecord) this.changeStatus(this.selectedRecord, 'CLOSED');
  }

  private runMutation(request: Observable<RecordItem>, closeForm = false): void {
    this.saving = true;
    this.errorMessage = '';
    request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (record) => {
        this.saving = false;
        const exists = this.records.some((item) => item.id === record.id);
        this.records = exists
          ? this.records.map((item) => (item.id === record.id ? record : item))
          : [record, ...this.records];
        if (this.selectedRecord?.id === record.id) this.selectedRecord = record;
        this.pageIndex = Math.min(this.pageIndex, Math.max(0, this.pageCount - 1));
        if (closeForm) this.closeForm();
        this.changeDetector.markForCheck();
      },
      error: (error) => {
        this.saving = false;
        this.errorMessage = apiError(error);
        this.changeDetector.markForCheck();
      },
    });
  }
}
