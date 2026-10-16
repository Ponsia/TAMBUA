import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController, TestRequest } from '@angular/common/http/testing';
import { WatchlistComponent } from './watchlist';
import { MissingPersonsComponent } from '../missing-persons/missing-persons';
import { API_CONFIG } from '../../../core/config/api.config';
import { AuthService } from '../../../core/services/auth.service';

describe('Manager photo and person workflow', () => {
  let http: HttpTestingController;
  let uploadUrl: string;
  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: { getRole: () => 'WATCHLIST_MANAGER' } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    uploadUrl = TestBed.inject(API_CONFIG).uploadUrl;
  });
  afterEach(() => {
    http.verify();
    vi.useRealTimers();
  });

  const gql = (operation: string): TestRequest =>
    http.expectOne((req) => req.url === '/graphql/' && req.body.query.includes(operation));
  const image = (name = 'person.jpg') => new File(['photo'], name, { type: 'image/jpeg' });

  function create(resource: 'watchlistPersons' | 'missingPersonCases') {
    const fixture =
      resource === 'watchlistPersons'
        ? TestBed.createComponent(WatchlistComponent)
        : TestBed.createComponent(MissingPersonsComponent);
    const page = fixture.componentInstance;
    fixture.detectChanges();
    gql(`${resource}(limit:`).flush({ data: { [resource]: { items: [], totalCount: 0 } } });
    if (resource === 'missingPersonCases') {
      gql('caseOfficers').flush({ data: { caseOfficers: [{ id: 'inv-1', fullName: 'Officer', station: '' }] } });
    }
    return { fixture, page };
  }

  for (const resource of ['watchlistPersons', 'missingPersonCases'] as const) {
    it(`removes and allows reselection of the same photo in ${resource}`, () => {
      const { fixture, page } = create(resource);
      page.openAddCase();
      const createUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:photo');
      const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
      const file = image('photo.jpg');
      const input = { files: [file], value: 'photo.jpg' };
      page.onPhotoSelected({ target: input } as unknown as Event);
      expect(input.value).toBe('');
      fixture.detectChanges();
      fixture.nativeElement.querySelector('.photo-clear-button').click();
      expect(page.photoPreview).toBeNull();
      expect(page.photoFile).toBeNull();
      expect(revoke).toHaveBeenCalledWith('blob:photo');
      page.onPhotoSelected({ target: input } as unknown as Event);
      expect(page.photoFile).toBe(file);
      page.onPhotoSelected({ target: { files: [], value: '' } } as unknown as Event);
      expect(page.photoFile).toBe(file);
      page.onPhotoSelected({ target: { files: [new File(['x'], 'x.gif', { type: 'image/gif' })], value: '' } } as unknown as Event);
      expect(page.errorMessage).toContain('JPEG, PNG or WebP');
      expect(page.photoFile).toBe(file);
      createUrl.mockRestore();
      revoke.mockRestore();
      fixture.destroy();
    });

    it(`uploads, saves ${resource} with the returned URL, enrolls the face and reloads`, () => {
      const { page } = create(resource);
      page.openAddCase();
      Object.assign(page.form, {
        fullName: 'Test Person', category: 'CHILD', reportingContact: 'Contact',
        lastSeenLocation: 'Market', lastSeenDate: '2026-09-21', caseOfficerId: 'inv-1',
        reason: 'Test reason', riskLevel: 'HIGH',
      });
      const file = image();
      page.photoFile = file;
      page.saveRecord();
      const upload = http.expectOne(uploadUrl);
      expect(upload.request.method).toBe('POST');
      expect(upload.request.body.get('file')).toMatchObject({ name: file.name, size: file.size, type: file.type });
      http.expectNone('/graphql/');
      upload.flush({ url: 'http://localhost:9000/tambua-media/person_photos/p.jpg' });
      const field = resource === 'watchlistPersons' ? 'createWatchlistPerson' : 'createMissingPersonCase';
      const save = gql(field);
      const input = save.request.body.variables.input;
      expect(input.photoUrl).toBe('http://localhost:9000/tambua-media/person_photos/p.jpg');
      expect(input.fullName).toBe('Test Person');
      if (resource === 'watchlistPersons') {
        expect(input.reason).toBe('Test reason');
        expect(input.riskLevel).toBe('HIGH');
        expect(input.category).toBeUndefined();
      } else {
        expect(input.category).toBe('CHILD');
        expect(input.reportingContact).toBe('Contact');
        expect(input.caseOfficerId).toBe('inv-1');
      }
      const person = { id: 'person-uuid', ...input, status: resource === 'watchlistPersons' ? 'ACTIVE' : 'OPEN' };
      save.flush({ data: { [field]: person } });
      const enroll = gql('enrollFace');
      expect(enroll.request.body.variables).toEqual({
        subjectType: resource === 'watchlistPersons' ? 'WATCHLIST' : 'MISSING_PERSON',
        subjectId: 'person-uuid',
        photoUrl: input.photoUrl,
      });
      enroll.flush({ data: { enrollFace: { id: 'emb-1', qualityScore: 0.9 } } });
      gql(`${resource}(limit:`).flush({ data: { [resource]: { items: [person], totalCount: 1 } } });
      expect(page.showCaseForm).toBe(false);
      expect(page.records[0].photo_url).toBe(input.photoUrl);
      expect(page.records[0].id).toBe('person-uuid');
    });
  }

  it('edits a watchlist entry without sending its name, which the API cannot change', () => {
    const page = create('watchlistPersons').page as WatchlistComponent;
    page.openForm({
      id: 'p1', full_name: 'Existing', reason: 'Old', risk_level: 'LOW', status: 'ACTIVE',
      photo_url: 'http://localhost:9000/tambua-media/person_photos/old.jpg',
    } as never);
    page.form.reason = 'New reason';
    page.saveRecord();
    const save = gql('updateWatchlistPerson');
    expect(save.request.body.variables.input).toEqual({
      photoUrl: 'http://localhost:9000/tambua-media/person_photos/old.jpg',
      reason: 'New reason',
      riskLevel: 'LOW',
    });
    save.flush({ data: { updateWatchlistPerson: { id: 'p1', fullName: 'Existing' } } });
    http.expectNone((req) => req.body?.query?.includes('enrollFace'));
    gql('watchlistPersons(limit:').flush({ data: { watchlistPersons: { items: [], totalCount: 0 } } });
  });

  it('keeps the form open after upload failure and does not create a record', () => {
    const { page } = create('missingPersonCases');
    page.openAddCase();
    Object.assign(page.form, { fullName: 'Person', category: 'CHILD', reportingContact: 'Contact' });
    page.photoFile = image();
    page.saveRecord();
    http.expectOne(uploadUrl).flush('Authentication required.', { status: 403, statusText: 'Forbidden' });
    http.expectNone('/graphql/');
    expect(page.showCaseForm).toBe(true);
    expect(page.saving).toBe(false);
    expect(page.errorMessage).toBe('Authentication required.');
  });

  it('reuses the uploaded photo when retrying a failed save and still enrolls it', () => {
    const { page } = create('missingPersonCases');
    page.openAddCase();
    Object.assign(page.form, { fullName: 'Person', category: 'CHILD', reportingContact: 'Contact' });
    page.photoFile = image();
    page.saveRecord();
    http.expectOne(uploadUrl).flush({ url: 'http://localhost:9000/tambua-media/person_photos/p.jpg' });
    gql('createMissingPersonCase').flush({ errors: [{ message: 'Please retry' }] });
    expect(page.saving).toBe(false);
    page.saveRecord();
    http.expectNone(uploadUrl);
    const retry = gql('createMissingPersonCase');
    expect(retry.request.body.variables.input.photoUrl).toBe('http://localhost:9000/tambua-media/person_photos/p.jpg');
    retry.flush({ data: { createMissingPersonCase: { id: 'c1', fullName: 'Person' } } });
    gql('enrollFace').flush({ data: { enrollFace: { id: 'emb-1' } } });
    gql('missingPersonCases(limit:').flush({ data: { missingPersonCases: { items: [], totalCount: 0 } } });
  });
});
