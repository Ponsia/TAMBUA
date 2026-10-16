import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { authInterceptor } from '../interceptors/auth.interceptor';
import { AuthService } from './auth.service';
import { Graphql } from './graphql';
import { RecordsService } from './records.service';
import { AdminDashboardService } from './admin-dashboard.service';
import { API_CONFIG } from '../config/api.config';
import { PhotoUploadService } from './photo-upload.service';
import { ReportsService } from './reports.service';

const user = {
  id: 'u1',
  email: 'user@example.com',
  fullName: 'Test User',
  role: 'INVESTIGATOR',
  station: 'Central',
};
const token = (expires = Date.now() / 1000 + 900) =>
  `header.${btoa(JSON.stringify({ exp: expires }))}.signature`;

describe('API integration', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    sessionStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    sessionStorage.clear();
    vi.useRealTimers();
  });

  function seedSession() {
    const jwt = token();
    sessionStorage.setItem('tambua_token', jwt);
    sessionStorage.setItem('tambua_user', JSON.stringify(user));
    return jwt;
  }

  it('sends the documented login mutation without a stale Authorization header', () => {
    seedSession();
    const auth = TestBed.inject(AuthService);
    const jwt = token();
    const success = vi.fn();
    auth.login(' user@example.com ', 'password').subscribe(success);
    const request = http.expectOne('/graphql/');
    expect(request.request.method).toBe('POST');
    expect(request.request.headers.has('Authorization')).toBe(false);
    expect(request.request.body.variables).toEqual({
      email: 'user@example.com',
      password: 'password',
    });
    expect(request.request.body.query.replace(/\s+/g, ' ').trim()).toBe(
      'mutation Login($email: String!, $password: String!) { login(email: $email, password: $password) { token user { id email fullName role station } } }',
    );
    request.flush({ data: { login: { token: jwt, user } } });
    expect(success).toHaveBeenCalledOnce();
    expect(auth.getToken()).toBe(jwt);
    expect(auth.getCurrentUser()).toEqual(user);
  });

  it('does not store a rejected or malformed session', () => {
    const auth = TestBed.inject(AuthService);
    const error = vi.fn();
    auth.login('user@example.com', 'wrong').subscribe({ error });
    http.expectOne('/graphql/').flush({ errors: [{ message: 'Invalid credentials' }] });
    expect(error.mock.calls[0][0].message).toBe('Invalid credentials');
    expect(auth.getToken()).toBeNull();
    auth.login('user@example.com', 'password').subscribe({ error });
    http
      .expectOne('/graphql/')
      .flush({ data: { login: { token: token(), user: { ...user, role: 'UNKNOWN' } } } });
    expect(auth.getToken()).toBeNull();
  });

  it('ignores corrupt stored user data and expired tokens', () => {
    sessionStorage.setItem('tambua_token', token(Date.now() / 1000 - 1));
    sessionStorage.setItem('tambua_user', '{bad-json');
    const auth = TestBed.inject(AuthService);
    expect(auth.isAuthenticated()).toBe(false);
    expect(auth.getCurrentUser()).toBeNull();
    expect(auth.getToken()).toBeNull();
  });

  it('automatically signs out at the JWT expiry without a refresh request', async () => {
    vi.useFakeTimers();
    sessionStorage.setItem('tambua_token', token(Date.now() / 1000 + 1));
    sessionStorage.setItem('tambua_user', JSON.stringify(user));
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    const auth = TestBed.inject(AuthService);
    expect(auth.isAuthenticated()).toBe(true);
    await vi.advanceTimersByTimeAsync(1001);
    expect(auth.getToken()).toBeNull();
    expect(navigate).toHaveBeenCalledWith('/login');
    http.expectNone('/graphql/');
  });

  it('only attaches tokens to the configured backend routes', () => {
    const jwt = seedSession();
    const client = TestBed.inject(HttpClient);
    client.get('/graphql/').subscribe();
    const authenticated = http.expectOne('/graphql/');
    expect(authenticated.request.headers.get('Authorization')).toBe(`Bearer ${jwt}`);
    authenticated.flush({});
    client.get('https://other.example/graphql/').subscribe();
    const external = http.expectOne('https://other.example/graphql/');
    expect(external.request.headers.has('Authorization')).toBe(false);
    external.flush({});
    client.get('/exports-elsewhere/file').subscribe();
    const unrelated = http.expectOne('/exports-elsewhere/file');
    expect(unrelated.request.headers.has('Authorization')).toBe(false);
    unrelated.flush({});
  });

  it('uploads an authenticated multipart file and returns its hosted URL', () => {
    const jwt = seedSession();
    const file = new File(['image'], 'person.png', { type: 'image/png' });
    const next = vi.fn();
    TestBed.inject(PhotoUploadService).upload(file).subscribe(next);
    const request = http.expectOne(TestBed.inject(API_CONFIG).uploadUrl);
    expect(request.request.method).toBe('POST');
    expect(request.request.headers.get('Authorization')).toBe(`Bearer ${jwt}`);
    expect(request.request.headers.has('Content-Type')).toBe(false);
    expect(request.request.body.get('file')).toMatchObject({ name: file.name, size: file.size, type: file.type });
    expect(request.request.body.has('photo')).toBe(false);
    request.flush({ url: 'https://storage.example/person.png' });
    expect(next).toHaveBeenCalledWith('https://storage.example/person.png');
  });

  it('does not send upload credentials to other origins or neighbouring paths', () => {
    seedSession();
    const client = TestBed.inject(HttpClient);
    const upload = TestBed.inject(API_CONFIG).uploadUrl;
    for (const url of ['https://other.example/uploads/photo/', `${upload}other`]) {
      client.post(url, new FormData()).subscribe();
      const request = http.expectOne(url);
      expect(request.request.headers.has('Authorization')).toBe(false);
      request.flush({});
    }
  });

  it('clears the session on HTTP 401 and GraphQL UNAUTHENTICATED', () => {
    seedSession();
    const router = TestBed.inject(Router);
    vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    const auth = TestBed.inject(AuthService);
    const graphql = TestBed.inject(Graphql);
    graphql.request('{ cameras { totalCount } }').subscribe({ error: () => {} });
    http.expectOne('/graphql/').flush({}, { status: 401, statusText: 'Unauthorized' });
    expect(auth.getToken()).toBeNull();
    expect(router.navigateByUrl).toHaveBeenCalledWith('/login');
    auth.login(user.email, 'password').subscribe();
    http.expectOne('/graphql/').flush({ data: { login: { token: token(), user } } });
    graphql.request('{ cameras { totalCount } }').subscribe({ error: () => {} });
    http
      .expectOne('/graphql/')
      .flush({ errors: [{ message: 'Expired', extensions: { code: 'UNAUTHENTICATED' } }] });
    expect(auth.getToken()).toBeNull();
  });

  it('keeps the session on a permissions error and rejects partial GraphQL data', () => {
    seedSession();
    const graphql = TestBed.inject(Graphql);
    const error = vi.fn();
    graphql.request('{ cameras { totalCount } }').subscribe({ error });
    http.expectOne('/graphql/').flush({
      data: { cameras: null },
      errors: [{ message: 'Not allowed', extensions: { code: 'FORBIDDEN' } }],
    });
    expect(error.mock.calls[0][0].message).toBe('Not allowed');
    expect(TestBed.inject(AuthService).getToken()).not.toBeNull();
  });

  it('loads every page using returned item counts, including server-capped pages', () => {
    const next = vi.fn();
    TestBed.inject(RecordsService).all('missingPersonCases').subscribe(next);
    let request = http.expectOne('/graphql/');
    expect(request.request.body.variables).toEqual({ limit: 100, offset: 0 });
    request.flush({ data: { missingPersonCases: { items: [{ id: '1' }], totalCount: 3 } } });
    request = http.expectOne('/graphql/');
    expect(request.request.body.variables.offset).toBe(1);
    request.flush({
      data: { missingPersonCases: { items: [{ id: '2' }, { id: '3' }], totalCount: 3 } },
    });
    expect(next).toHaveBeenCalledWith([{ id: '1' }, { id: '2' }, { id: '3' }]);
  });

  it('fails incomplete pagination instead of presenting a partial list as complete', () => {
    const error = vi.fn();
    TestBed.inject(RecordsService).all('cameras').subscribe({ error });
    http.expectOne('/graphql/').flush({ data: { cameras: { items: [], totalCount: 2 } } });
    expect(error.mock.calls[0][0].message).toContain('incomplete');
  });

  it('supplies required DateTime ranges to statistics queries', () => {
    const dashboard = TestBed.inject(AdminDashboardService);
    const from = '2026-01-01T00:00:00.000Z';
    const to = '2026-09-14T23:59:59.999Z';
    dashboard.getCaseStats(from, to).subscribe();
    let request = http.expectOne('/graphql/');
    expect(request.request.body.query).toContain('$dateFrom: DateTime!');
    expect(request.request.body.variables).toEqual({ dateFrom: from, dateTo: to });
    request.flush({ data: { caseStats: { open: 1, found: 2, closed: 3 } } });
    dashboard.getAlertStats(from, to).subscribe();
    request = http.expectOne('/graphql/');
    expect(request.request.body.query).toContain(
      'alertStats(dateFrom: $dateFrom, dateTo: $dateTo)',
    );
    request.flush({ data: { alertStats: { total: 3, pending: 1, confirmed: 1, rejected: 1 } } });
  });

  it('uses input objects for case transitions and the documented soft-removal mutations', () => {
    const api = TestBed.inject(RecordsService);
    api.changeStatus('missingPersonCases', 'case-1', 'FOUND').subscribe();
    let request = http.expectOne('/graphql/');
    expect(request.request.body.variables).toEqual({ input: { id: 'case-1', newStatus: 'FOUND' } });
    expect(request.request.body.query).toContain('UpdateCaseStatusInput!');
    request.flush({ data: { updateCaseStatus: { id: 'case-1', status: 'FOUND' } } });
    api.changeStatus('cameras', 'camera-1', 'DISABLED').subscribe();
    request = http.expectOne('/graphql/');
    expect(request.request.body.query).toContain('disableCamera(id: $id)');
    request.flush({ data: { disableCamera: { id: 'camera-1', status: 'DISABLED' } } });
    api.changeStatus('watchlistPersons', 'person-1', 'REMOVED').subscribe();
    request = http.expectOne('/graphql/');
    expect(request.request.body.query).toContain('removeWatchlistPerson(id: $id)');
    request.flush({ data: { removeWatchlistPerson: { id: 'person-1', status: 'REMOVED' } } });
  });

  it('uses documented create/update inputs and IDs', () => {
    const api = TestBed.inject(RecordsService);
    api
      .save('watchlistPersons', { fullName: 'Person', reason: 'Reason', riskLevel: 'HIGH' })
      .subscribe();
    let request = http.expectOne('/graphql/');
    expect(request.request.body.query).toContain('$input: CreateWatchlistPersonInput!');
    expect(request.request.body.query).toContain('createWatchlistPerson(input: $input)');
    request.flush({ data: { createWatchlistPerson: { id: 'p1' } } });
    api.save('watchlistPersons', { reason: 'Updated', riskLevel: 'LOW' }, 'p1').subscribe();
    request = http.expectOne('/graphql/');
    expect(request.request.body.variables).toEqual({
      input: { reason: 'Updated', riskLevel: 'LOW' },
      id: 'p1',
    });
    expect(request.request.body.query).toContain('updateWatchlistPerson(id: $id, input: $input)');
    request.flush({ data: { updateWatchlistPerson: { id: 'p1' } } });
  });

  it('passes the timeline subject and hosted photo URL without inventing upload data', () => {
    const api = TestBed.inject(RecordsService);
    api.timeline('MISSING_PERSON', 'c1').subscribe();
    let request = http.expectOne('/graphql/');
    expect(request.request.body.variables).toEqual({
      subjectType: 'MISSING_PERSON',
      subjectId: 'c1',
    });
    request.flush({ data: { movementTimeline: [] } });
    api.searchByPhoto('https://images.example/photo.jpg').subscribe();
    request = http.expectOne('/graphql/');
    expect(request.request.body.variables).toEqual({
      uploadedPhotoUrl: 'https://images.example/photo.jpg',
    });
    request.flush({ data: { searchByPhoto: { searchLogId: 's1', outcome: 'NO_MATCH' } } });
  });

  it('downloads reports with bearer authentication and snake_case REST parameters', () => {
    const jwt = seedSession();
    TestBed.inject(ReportsService)
      .download('case_stats', 'csv', '2026-01-01', '2026-09-14')
      .subscribe();
    const request = http.expectOne((req) => req.url === '/exports/csv/');
    expect(request.request.headers.get('Authorization')).toBe(`Bearer ${jwt}`);
    expect(request.request.params.get('report')).toBe('case_stats');
    expect(request.request.params.get('date_from')).toBe('2026-01-01');
    expect(request.request.params.get('date_to')).toBe('2026-09-14');
    expect(request.request.responseType).toBe('blob');
    request.flush(new Blob(['open,found,closed\n1,2,3'], { type: 'text/csv' }));
  });
});
