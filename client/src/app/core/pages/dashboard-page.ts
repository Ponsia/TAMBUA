import { RecordsService } from '../services/records.service';
import { ChangeDetectorRef, DestroyRef, Directive, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Observable, catchError, forkJoin, of } from 'rxjs';
import { AlertStats, CaseStats } from '../models/dashboard.model';
import { RecordItem } from '../models/records.model';
import { AuthService } from '../services/auth.service';
import { AdminDashboardService } from '../services/admin-dashboard.service';

@Directive()
export abstract class DashboardPage implements OnInit {
  private readonly records = inject(RecordsService);
  cases: RecordItem[] = [];
  watchlist: RecordItem[] = [];
  casesLoaded = false;
  private readonly auth = inject(AuthService);
  private readonly dashboardService = inject(AdminDashboardService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly changeDetector = inject(ChangeDetectorRef);

  caseStats: CaseStats | null = null;
  alertStats: AlertStats | null = null;
  cameras: RecordItem[] = [];
  alerts: RecordItem[] = [];
  sightings: RecordItem[] = [];
  loading = true;
  errors: string[] = [];
  camerasLoaded = false;
  alertsLoaded = false;
  sightingsLoaded = false;

  ngOnInit(): void {
    this.reload();
  }

  reload(): void {
    this.loading = true;
    this.errors = [];
    forkJoin({
      caseRecords: this.load(this.records.all('missingPersonCases'), 'case records'),
      watchlist: this.load(this.records.all('watchlistPersons'), 'watchlist'),
      cases: this.load(this.dashboardService.getCaseStats(), 'case statistics'),
      alertStats: this.load(this.dashboardService.getAlertStats(), 'alert statistics'),
      cameras: this.load(this.dashboardService.getCameras(), 'cameras'),
      alerts:
        this.auth.getRole() === 'INVESTIGATOR'
          ? of(null)
          : this.load(this.dashboardService.getAlerts(), 'alerts'),
      sightings:
        this.auth.getRole() === 'INVESTIGATOR'
          ? of(null)
          : this.load(this.dashboardService.getSightings(), 'sightings'),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((result) => {
        this.caseStats = result.cases;
        this.cases = result.caseRecords ?? [];
        this.watchlist = result.watchlist ?? [];
        this.casesLoaded = result.caseRecords !== null;
        this.alertStats = result.alertStats;
        this.cameras = result.cameras ?? [];
        this.alerts = result.alerts ?? [];
        this.sightings = result.sightings ?? [];
        this.camerasLoaded = result.cameras !== null;
        this.alertsLoaded = result.alerts !== null;
        this.sightingsLoaded = result.sightings !== null;
        this.loading = false;
        this.changeDetector.markForCheck();
      });
  }

  get activeCases(): RecordItem[] {
    return this.cases.filter((record) => record.status === 'OPEN').slice(0, 5);
  }
  get recentCases(): RecordItem[] {
    return [...this.cases]
      .sort((a, b) => Date.parse(b.createdAt || '') - Date.parse(a.createdAt || ''))
      .slice(0, 5);
  }
  get pendingSightings(): number {
    return this.sightings.filter((record) => record.status === 'PENDING').length;
  }
  get confirmedMovements(): RecordItem[] {
    return [...this.alerts, ...this.sightings]
      .filter((record) => record.status === 'CONFIRMED')
      .sort((a, b) => Date.parse(b.detectedAt || '') - Date.parse(a.detectedAt || ''));
  }
  get recentAlerts(): RecordItem[] {
    return this.recent(this.alerts);
  }
  get recentSightings(): RecordItem[] {
    return this.recent(this.sightings);
  }
  private recent(records: RecordItem[]): RecordItem[] {
    return [...records]
      .sort((a, b) => Date.parse(b.detectedAt || '') - Date.parse(a.detectedAt || ''))
      .slice(0, 5);
  }

  /** Person name for an alert (watchlist) or sighting (case), falling back to its ID. */
  subjectName(record: RecordItem): string {
    const id = record.watchlistPersonId || record.caseId;
    const pool = record.watchlistPersonId ? this.watchlist : this.cases;
    return pool.find((item) => item.id === id)?.fullName || id || '—';
  }
  cameraName(id?: string): string {
    return this.cameras.find((camera) => camera.id === id)?.name || id || '—';
  }

  cameraCount(status: string): number {
    return this.cameras.filter((camera) => camera.status === status).length;
  }

  private load<T>(request: Observable<T>, label: string): Observable<T | null> {
    return request.pipe(
      catchError(() => {
        this.errors.push(`Unable to load ${label}.`);
        return of(null);
      }),
    );
  }
}
