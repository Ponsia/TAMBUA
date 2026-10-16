import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { API_CONFIG } from '../config/api.config';
import { provideRouter } from '@angular/router';
import { EMPTY, Subject } from 'rxjs';
import { MissingPersonsComponent as ManagerCases } from '../../features/watchlist-manager/missing-persons/missing-persons';
import { MissingPersonsComponent as InvestigatorCases } from '../../features/investigator/missing-persons/missing-persons';
import { WatchlistComponent } from '../../features/watchlist-manager/watchlist/watchlist';
import { AlertsComponent } from '../../features/watchlist-manager/alerts/alerts';
import { FaceSearchComponent } from '../../features/investigator/face-search/face-search';
import { AuthService } from '../services/auth.service';
import { LiveEventsService } from '../services/live-events.service';
import { RecordItem } from '../models/records.model';

const caseRecord = {
  id: 'case-1',
  fullName: 'Example Person',
  category: 'CHILD',
  lastSeenLocation: 'Central',
  lastSeenDate: null,
  reportingContact: 'Contact',
  status: 'OPEN',
  caseOfficerId: null,
  createdAt: '2026-09-01T12:00:00Z',
};

describe('Record screen workflows', () => {
  let http: HttpTestingController;
  let role = 'WATCHLIST_MANAGER';
  let events: Subject<RecordItem>;

  beforeEach(() => {
    role = 'WATCHLIST_MANAGER';
    events = new Subject<RecordItem>();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: AuthService, useValue: { getRole: () => role } },
        { provide: LiveEventsService, useValue: { events: () => events } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => {
    http.verify();
  });

  const gql = (operation: string) =>
    http.expectOne((req) => req.url === '/graphql/' && req.body.query.includes(operation));
  const flushOfficers = () =>
    gql('caseOfficers').flush({ data: { caseOfficers: [] } });

  for (const component of [ManagerCases, WatchlistComponent]) {
    it(`opens ${component.name} while the initial request is pending`, async () => {
      const fixture = TestBed.createComponent<ManagerCases | WatchlistComponent>(component);
      fixture.detectChanges();
      const request = gql('(limit:');
      if (component === ManagerCases) flushOfficers();
      fixture.nativeElement.querySelector('header .primary-button').click();
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('form')).not.toBeNull();
      expect(fixture.nativeElement.querySelector('input[type="file"]')).not.toBeNull();
      expect(fixture.nativeElement.querySelector('button[type="submit"]').disabled).toBe(true);
      request.error(new ProgressEvent('error'));
      await fixture.whenStable();
      expect(fixture.nativeElement.querySelector('form')).not.toBeNull();
    });
  }

  it('renders cases, filters loaded records, and saves a case through the existing form', async () => {
    const fixture = TestBed.createComponent(ManagerCases);
    fixture.detectChanges();
    gql('missingPersonCases(limit:').flush({ data: { missingPersonCases: { items: [caseRecord], totalCount: 1 } } });
    flushOfficers();
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('tbody').textContent).toContain('Example Person');
    const page = fixture.componentInstance;
    const search = fixture.nativeElement.querySelector('input[type="text"]') as HTMLInputElement;
    search.value = 'unknown';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('tbody tr')).toBeNull();
    search.value = '';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.nativeElement.querySelector('header .primary-button').click();
    await fixture.whenStable();
    const form = fixture.nativeElement.querySelector('form') as HTMLFormElement;
    const setInput = (name: string, value: string) => {
      const input = form.querySelector(`[name="${name}"]`) as HTMLInputElement;
      input.value = value;
      input.dispatchEvent(
        new Event(input.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }),
      );
    };
    await fixture.whenStable();
    setInput('fullName', 'New Person');
    setInput('category', 'ELDERLY');
    setInput('lastSeenLocation', 'Market');
    setInput('reportingContact', 'Contact 2');
    await fixture.whenStable();
    page.photoPreview = 'https://example.test/person.jpg';
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    const request = http.expectOne('/graphql/');
    expect(request.request.body.variables.input).toEqual({
      fullName: 'New Person',
      category: 'ELDERLY',
      lastSeenLocation: 'Market',
      reportingContact: 'Contact 2',
      lastSeenDate: null,
      caseOfficerId: null,
      photoUrl: 'https://example.test/person.jpg',
    });
    expect(page.saving).toBe(true);
    page.saveRecord();
    http.expectNone('/graphql/');
    request.flush({
      data: { createMissingPersonCase: { ...caseRecord, id: 'case-2', fullName: 'New Person' } },
    });
    http.expectOne('/graphql/').flush({
      data: { missingPersonCases: { items: [caseRecord, { ...caseRecord, id: 'case-2', fullName: 'New Person' }], totalCount: 2 } },
    });
    await fixture.whenStable();
    expect(page.showCaseForm).toBe(false);
    expect(fixture.nativeElement.querySelector('tbody').textContent).toContain('New Person');
  });

  it('allows only the next investigator status transition and preserves data on failure', () => {
    role = 'INVESTIGATOR';
    const fixture = TestBed.createComponent(InvestigatorCases);
    fixture.detectChanges();
    http
      .expectOne('/graphql/')
      .flush({ data: { missingPersonCases: { items: [caseRecord], totalCount: 1 } } });
    const page = fixture.componentInstance;
    page.viewCase(caseRecord);
    page.closeCase();
    http.expectNone('/graphql/');
    page.markAsFound();
    let request = http.expectOne('/graphql/');
    expect(request.request.body.variables).toEqual({ input: { id: 'case-1', newStatus: 'FOUND' } });
    request.flush({ errors: [{ message: 'Permission denied' }] });
    expect(page.selectedCase?.status).toBe('OPEN');
    expect(page.saving).toBe(false);
    expect(page.errorMessage).toBe('Permission denied');
    page.markAsFound();
    request = http.expectOne('/graphql/');
    request.flush({ data: { updateCaseStatus: { ...caseRecord, status: 'FOUND' } } });
    expect(page.selectedCase?.status).toBe('FOUND');
    page.closeCase();
    request = http.expectOne('/graphql/');
    expect(request.request.body.variables.input.newStatus).toBe('CLOSED');
    request.flush({ data: { updateCaseStatus: { ...caseRecord, status: 'CLOSED' } } });
    expect(page.records[0].status).toBe('CLOSED');
  });

  it('updates watchlist information and reloads the saved record', () => {
    const fixture = TestBed.createComponent(WatchlistComponent);
    fixture.detectChanges();
    const person = {
      id: 'p1',
      fullName: 'Person',
      reason: 'Original',
      riskLevel: 'HIGH',
      status: 'ACTIVE',
    };
    http
      .expectOne('/graphql/')
      .flush({ data: { watchlistPersons: { items: [person], totalCount: 1 } } });
    const page = fixture.componentInstance;
    page.openForm(page.records[0]);
    page.form['reason'] = 'Updated';
    page.saveRecord();
    const request = http.expectOne('/graphql/');
    expect(request.request.body.variables).toEqual({
      id: 'p1',
      input: { photoUrl: '', reason: 'Updated', riskLevel: 'HIGH' },
    });
    request.flush({ data: { updateWatchlistPerson: { ...person, reason: 'Updated' } } });
    http.expectOne('/graphql/').flush({
      data: { watchlistPersons: { items: [{ ...person, reason: 'Updated' }], totalCount: 1 } },
    });
    expect(page.records[0].reason).toBe('Updated');
  });

  it('joins detection names, reviews once, and applies live status updates', async () => {
    const fixture = TestBed.createComponent(AlertsComponent);
    fixture.detectChanges();
    const alert = {
      id: 'a1',
      cameraId: 'camera-1',
      watchlistPersonId: 'p1',
      confidenceScore: 0.91,
      status: 'PENDING',
      detectedAt: '2026-09-01T12:00:00Z',
    };
    http
      .expectOne((req) => req.body.query.includes('alerts(limit:'))
      .flush({ data: { alerts: { items: [alert], totalCount: 1 } } });
    http
      .expectOne((req) => req.body.query.includes('cameras(limit:'))
      .flush({
        data: { cameras: { items: [{ id: 'camera-1', name: 'Central Camera' }], totalCount: 1 } },
      });
    http
      .expectOne((req) => req.body.query.includes('watchlistPersons(limit:'))
      .flush({
        data: {
          watchlistPersons: {
            items: [{ id: 'p1', fullName: 'Person', riskLevel: 'HIGH' }],
            totalCount: 1,
          },
        },
      });
    await fixture.whenStable();
    const content = fixture.nativeElement.querySelector('tbody').textContent;
    expect(content).toContain('Central Camera');
    expect(content).toContain('91%');
    const page = fixture.componentInstance;
    page.viewRecord(alert);
    page.changeStatus(alert, 'CONFIRMED');
    const request = http.expectOne('/graphql/');
    expect(request.request.body.query).toContain('confirmAlert(id: $id)');
    request.flush({ data: { confirmAlert: { ...alert, status: 'CONFIRMED' } } });
    page.changeStatus(page.selectedRecord!, 'REJECTED');
    http.expectNone('/graphql/');
    events.next({ ...alert, status: 'REJECTED' });
    expect(page.selectedRecord?.status).toBe('REJECTED');
    expect(page.count('REJECTED')).toBe(1);
    fixture.destroy();
    expect(events.observed).toBe(false);
  });

  it('does not present failed requests as an empty dataset', async () => {
    const fixture = TestBed.createComponent(ManagerCases);
    fixture.detectChanges();
    gql('missingPersonCases(limit:').error(new ProgressEvent('error'));
    flushOfficers();
    await fixture.whenStable();
    expect(fixture.componentInstance.loaded).toBe(false);
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain(
      'Cannot reach the backend',
    );
    expect(fixture.nativeElement.querySelector('.empty-state')).toBeNull();
  });

  it('uploads the selected photo, searches it and shows the matched record', async () => {
    const fixture = TestBed.createComponent(FaceSearchComponent);
    const page = fixture.componentInstance;
    page.searchPhoto();
    http.expectNone(() => true);
    const createUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:photo');
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    page.onFileSelected({ target: { files: [new File(['x'], 'doc.pdf', { type: 'application/pdf' })], value: '' } } as unknown as Event);
    expect(page.errorMessage).toContain('JPEG, PNG or WebP');
    const file = new File(['photo'], 'probe.jpg', { type: 'image/jpeg' });
    page.onFileSelected({ target: { files: [file], value: 'probe.jpg' } } as unknown as Event);
    page.searchPhoto();
    const upload = http.expectOne(TestBed.inject(API_CONFIG).uploadUrl);
    expect(upload.request.body.get('file')).toMatchObject({ name: 'probe.jpg' });
    upload.flush({ url: 'http://localhost:9000/tambua-media/person_photos/probe.jpg' });
    const search = gql('searchByPhoto');
    expect(search.request.body.variables).toEqual({
      uploadedPhotoUrl: 'http://localhost:9000/tambua-media/person_photos/probe.jpg',
    });
    search.flush({
      data: {
        searchByPhoto: {
          searchLogId: 'search-1',
          outcome: 'MATCH_FOUND',
          matchedReference: 'MISSING_PERSON:case-1',
          subjectType: 'MISSING_PERSON',
          subjectId: 'case-1',
          confidenceScore: 0.83,
        },
      },
    });
    gql('missingPersonCase(id: $id)').flush({ data: { missingPersonCase: caseRecord } });
    await fixture.whenStable();
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Possible Match Found');
    expect(text).toContain('Example Person');
    expect(text).toContain('83%');
    // Searching again reuses the stored upload.
    page.searchPhoto();
    http.expectNone(TestBed.inject(API_CONFIG).uploadUrl);
    gql('searchByPhoto').flush({
      data: { searchByPhoto: { searchLogId: 'search-2', outcome: 'NO_MATCH', matchedReference: null, subjectType: null, subjectId: null, confidenceScore: null } },
    });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No Match Found');
    createUrl.mockRestore();
    revoke.mockRestore();
  });
});
