import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { API_CONFIG } from '../config/api.config';
import { AuthService } from './auth.service';
import { LiveEventsService } from './live-events.service';
import { RecordsService } from './records.service';

describe('Live review-queue updates', () => {
  let page: ReturnType<typeof vi.fn>;
  let role: string;

  beforeEach(() => {
    vi.useFakeTimers();
    role = 'WATCHLIST_MANAGER';
    page = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        { provide: API_CONFIG, useValue: { livePollMs: 1000 } },
        { provide: AuthService, useValue: { isAuthenticated: () => true, getRole: () => role } },
        { provide: RecordsService, useValue: { page } },
      ],
    });
  });
  afterEach(() => vi.useRealTimers());

  it('polls the newest page and emits only new or changed detections', async () => {
    page.mockReturnValueOnce(of({ items: [{ id: 'a1', status: 'PENDING' }], totalCount: 1 }));
    page.mockReturnValueOnce(
      of({ items: [{ id: 'a2', status: 'PENDING' }, { id: 'a1', status: 'PENDING' }], totalCount: 2 }),
    );
    page.mockReturnValueOnce(
      of({ items: [{ id: 'a2', status: 'PENDING' }, { id: 'a1', status: 'CONFIRMED' }], totalCount: 2 }),
    );
    const next = vi.fn();
    const subscription = TestBed.inject(LiveEventsService).events('alerts').subscribe(next);
    await vi.advanceTimersByTimeAsync(3000);
    expect(page).toHaveBeenCalledWith('alerts', 0, 50);
    expect(next.mock.calls.map(([record]) => `${record.id}:${record.status}`)).toEqual([
      'a1:PENDING',
      'a2:PENDING',
      'a1:CONFIRMED',
    ]);
    subscription.unsubscribe();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('tolerates transient failures and reports a lost connection after three in a row', async () => {
    page.mockReturnValue(throwError(() => new Error('offline')));
    const error = vi.fn();
    TestBed.inject(LiveEventsService).events('sightings').subscribe({ error });
    await vi.advanceTimersByTimeAsync(2000);
    expect(error).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000);
    expect(error).toHaveBeenCalledOnce();
  });

  it('does not poll for investigators, who cannot read the review queues', async () => {
    role = 'INVESTIGATOR';
    const complete = vi.fn();
    TestBed.inject(LiveEventsService).events('alerts').subscribe({ complete });
    await vi.advanceTimersByTimeAsync(5000);
    expect(complete).toHaveBeenCalledOnce();
    expect(page).not.toHaveBeenCalled();
  });
});
