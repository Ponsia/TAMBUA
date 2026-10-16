import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';
import { MovementTimelineComponent } from '../../features/investigator/movement-timeline/movement-timeline';

const entry = {
  id: 's1',
  source: 'SIGHTING',
  cameraId: 'camera1',
  cameraName: 'Main entrance',
  confidenceScore: 0.93,
  frameSnapshotUrl: '/frames/one.jpg',
  clipUrl: null,
  clipDurationSeconds: null,
  detectedAt: '2026-09-16T08:00:00Z',
};

describe('Investigator confirmed sightings', () => {
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { data: { sightingsOnly: true } },
            queryParamMap: of(convertToParamMap({ subjectId: 'case1', subjectType: 'WATCHLIST' })),
          },
        },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('loads case sightings through the permitted timeline query and opens evidence', async () => {
    const fixture = TestBed.createComponent(MovementTimelineComponent);
    fixture.detectChanges();
    http
      .expectOne((req) => req.body.query.includes('missingPersonCases('))
      .flush({
        data: {
          missingPersonCases: {
            items: [{ id: 'case1', fullName: 'Example Person' }],
            totalCount: 1,
          },
        },
      });
    const request = http.expectOne((req) => req.body.query.includes('movementTimeline('));
    expect(request.request.body.variables).toEqual({
      subjectType: 'MISSING_PERSON',
      subjectId: 'case1',
    });
    request.flush({ data: { movementTimeline: [entry] } });
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('Confirmed Sightings');
    expect(fixture.nativeElement.textContent).toContain('93%');
    expect(fixture.nativeElement.querySelector('app-evidence img')).toBeTruthy();
    fixture.nativeElement.querySelector('.entry-details button').click();
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('[role="dialog"]')).toBeTruthy();
    http.expectNone((req) => /\bsightings\(|\bwatchlistPersons\(/.test(req.body.query));
  });

  it('keeps case-loading failures visible when the timeline succeeds and allows retry', async () => {
    const fixture = TestBed.createComponent(MovementTimelineComponent);
    fixture.detectChanges();
    http
      .expectOne((req) => req.body.query.includes('missingPersonCases('))
      .flush({ errors: [{ message: 'Case list unavailable' }] });
    http
      .expectOne((req) => req.body.query.includes('movementTimeline('))
      .flush({ data: { movementTimeline: [] } });
    await fixture.whenStable();
    expect(fixture.componentInstance.subjectsError).toContain('Case list unavailable');
    expect(fixture.nativeElement.textContent).toContain('Retry loading people');
    fixture.componentInstance.loadSubjects();
    http
      .expectOne((req) => req.body.query.includes('missingPersonCases('))
      .flush({ data: { missingPersonCases: { items: [], totalCount: 0 } } });
    expect(fixture.componentInstance.subjectsError).toBe('');
  });

  it('cancels stale case requests and distinguishes filtering from an empty timeline', async () => {
    const fixture = TestBed.createComponent(MovementTimelineComponent);
    fixture.detectChanges();
    http
      .expectOne((req) => req.body.query.includes('missingPersonCases('))
      .flush({ data: { missingPersonCases: { items: [], totalCount: 0 } } });
    const first = http.expectOne((req) => req.body.query.includes('movementTimeline('));
    fixture.componentInstance.subjectId = 'case2';
    fixture.componentInstance.loadTimeline();
    expect(first.cancelled).toBe(true);
    const second = http.expectOne((req) => req.body.query.includes('movementTimeline('));
    expect(second.request.body.variables.subjectId).toBe('case2');
    second.flush({ data: { movementTimeline: [entry] } });
    fixture.componentInstance.searchTerm = 'other camera';
    fixture.changeDetectorRef.markForCheck();
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('No records match your filters');
  });
});
