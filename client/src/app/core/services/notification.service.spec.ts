import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { NotificationService } from './notification.service';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { RecordsService } from './records.service';

describe('Action feedback', () => {
  beforeEach(() => { vi.useFakeTimers(); TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] }); });
  afterEach(() => { TestBed.inject(HttpTestingController).verify(); vi.useRealTimers(); });
  it('shows success after the record is confirmed and reports GraphQL failures as errors', () => {
    const api = TestBed.inject(RecordsService);
    const messages = TestBed.inject(NotificationService);
    const http = TestBed.inject(HttpTestingController);
    api.save('watchlistPersons', { fullName: 'Test' }).subscribe();
    expect(messages.notices()).toEqual([]);
    http.expectOne('/graphql/').flush({ data: { createWatchlistPerson: { id: '1' } } });
    expect(messages.notices()[0].message).toBe('Watchlist person added successfully.');
    api.save('missingPersonCases', {}).subscribe({ error: () => {} });
    http.expectOne('/graphql/').flush({ errors: [{ message: 'Required fields are missing.' }] });
    expect(messages.notices()[1].kind).toBe('error');
    expect(messages.notices()[1].message).toContain('Required fields');
  });
  it('does not claim success for an empty mutation result', () => {
    TestBed.inject(RecordsService).save('missingPersonCases', {}).subscribe({ error: () => {} });
    TestBed.inject(HttpTestingController).expectOne('/graphql/').flush({ data: { createMissingPersonCase: null } });
    expect(TestBed.inject(NotificationService).notices()[0].kind).toBe('error');
  });
  it('pauses success dismissal while being read and keeps errors until dismissed', () => {
    const service = TestBed.inject(NotificationService);
    service.success('Successfully logged in.');
    const id = service.notices()[0].id;
    service.pause(id); vi.advanceTimersByTime(10000);
    expect(service.notices()).toHaveLength(1);
    service.resume(id); vi.advanceTimersByTime(6500);
    expect(service.notices()).toHaveLength(0);
    throwError(() => new Error('Failed')).pipe(service.feedback('Saved')).subscribe({ error: () => {} });
    vi.advanceTimersByTime(60000);
    expect(service.notices()[0].kind).toBe('error');
    service.dismiss(service.notices()[0].id);
    expect(service.notices()).toHaveLength(0);
  });
});
