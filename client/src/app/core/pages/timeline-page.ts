import { ChangeDetectorRef, DestroyRef, Directive, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { Subject, catchError, forkJoin, map, of, switchMap } from 'rxjs';
import { RecordItem, SubjectType, TimelineEntry } from '../models/records.model';
import { RecordsService } from '../services/records.service';
import { apiError } from '../services/api-error';

@Directive()
export abstract class TimelinePage implements OnInit {
  private readonly api = inject(RecordsService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly changeDetector = inject(ChangeDetectorRef);
  private readonly route = inject(ActivatedRoute);
  readonly sightingsOnly = this.route.snapshot.data?.['sightingsOnly'] === true;
  private readonly selection = new Subject<{ type: SubjectType; id: string }>();
  subjectType: SubjectType = 'MISSING_PERSON';
  subjectId = '';
  cases: RecordItem[] = [];
  watchlist: RecordItem[] = [];
  entries: TimelineEntry[] = [];
  selectedEntry: TimelineEntry | null = null;
  loading = false;
  loaded = false;
  errorMessage = '';
  subjectsLoading = false;
  subjectsError = '';
  searchTerm = '';
  selectedSource = 'ALL';

  ngOnInit(): void {
    this.selection
      .pipe(
        switchMap(({ type, id }) =>
          id
            ? this.api.timeline(type, id).pipe(
                map((entries) => ({ entries, error: '' })),
                catchError((error) =>
                  of({ entries: [] as TimelineEntry[], error: apiError(error) }),
                ),
              )
            : of({ entries: [] as TimelineEntry[], error: '' }),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((result) => {
        this.entries = [...result.entries].sort(
          (a, b) => Date.parse(b.detectedAt) - Date.parse(a.detectedAt),
        );
        this.errorMessage = result.error;
        this.loading = false;
        this.loaded = !!this.subjectId && !result.error;
        this.changeDetector.markForCheck();
      });
    this.loadSubjects();
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      this.subjectType =
        !this.sightingsOnly && params.get('subjectType') === 'WATCHLIST'
          ? 'WATCHLIST'
          : 'MISSING_PERSON';
      this.selectedSource = this.sightingsOnly ? 'SIGHTING' : 'ALL';
      this.subjectId = params.get('subjectId') || '';
      this.loadTimeline();
    });
  }

  loadSubjects(): void {
    if (this.subjectsLoading) return;
    this.subjectsLoading = true;
    this.subjectsError = '';
    forkJoin({
      cases: this.api.all('missingPersonCases'),
      watchlist: this.sightingsOnly ? of([] as RecordItem[]) : this.api.all('watchlistPersons'),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          this.cases = result.cases;
          this.watchlist = result.watchlist;
          this.subjectsLoading = false;
          this.changeDetector.markForCheck();
        },
        error: (error) => {
          this.subjectsError = apiError(error);
          this.subjectsLoading = false;
          this.changeDetector.markForCheck();
        },
      });
  }

  get subjects(): RecordItem[] {
    return this.subjectType === 'WATCHLIST' ? this.watchlist : this.cases;
  }
  subjectTypeChanged(): void {
    this.subjectId = '';
    this.selectedSource = this.sightingsOnly ? 'SIGHTING' : 'ALL';
    this.searchTerm = '';
    this.loadTimeline();
  }
  loadTimeline(): void {
    this.loading = !!this.subjectId;
    this.loaded = false;
    this.errorMessage = '';
    this.selectedEntry = null;
    this.entries = [];
    this.selection.next({ type: this.subjectType, id: this.subjectId });
  }
  get filteredEntries(): TimelineEntry[] {
    return this.entries.filter(
      (entry) =>
        (this.selectedSource === 'ALL' || entry.source === this.selectedSource) &&
        entry.cameraName.toLowerCase().includes(this.searchTerm.trim().toLowerCase()),
    );
  }
  count(source?: string): number {
    return source
      ? this.entries.filter((entry) => entry.source === source).length
      : this.entries.length;
  }
  viewEntry(entry: TimelineEntry): void {
    this.selectedEntry = entry;
  }
  closeDetails(): void {
    this.selectedEntry = null;
  }
  confidencePercentage(score: number): string {
    return `${Math.round(score * 100)}%`;
  }
}
