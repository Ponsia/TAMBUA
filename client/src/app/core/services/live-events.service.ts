import { Injectable, inject } from '@angular/core';
import { EMPTY, Observable, Subscription, catchError, exhaustMap, timer } from 'rxjs';
import { API_CONFIG } from '../config/api.config';
import { RecordItem } from '../models/records.model';
import { AuthService } from './auth.service';
import { RecordsService } from './records.service';

/** Consecutive failed polls after which the stream reports a lost connection. */
const MAX_FAILURES = 3;

/**
 * Near-real-time review queue updates. The backend exposes alerts and
 * sightings through GraphQL queries (newest first), so the newest page is
 * polled and every new or changed detection is emitted.
 */
@Injectable({ providedIn: 'root' })
export class LiveEventsService {
  private readonly config = inject(API_CONFIG);
  private readonly auth = inject(AuthService);
  private readonly records = inject(RecordsService);

  events(resource: 'alerts' | 'sightings'): Observable<RecordItem> {
    return new Observable<RecordItem>((subscriber) => {
      // Investigators have no access to the review queues.
      if (!this.auth.isAuthenticated() || this.auth.getRole() === 'INVESTIGATOR') {
        subscriber.complete();
        return;
      }
      const seen = new Map<string, string>();
      let failures = 0;
      const polling: Subscription = timer(this.config.livePollMs, this.config.livePollMs)
        .pipe(
          exhaustMap(() =>
            this.records.page(resource, 0, 50).pipe(
              catchError((error) => {
                failures += 1;
                if (failures >= MAX_FAILURES) subscriber.error(error);
                return EMPTY;
              }),
            ),
          ),
        )
        .subscribe((page) => {
          failures = 0;
          for (const record of page.items) {
            const snapshot = JSON.stringify(record);
            if (seen.get(record.id) === snapshot) continue;
            seen.set(record.id, snapshot);
            subscriber.next(record);
          }
        });
      return () => polling.unsubscribe();
    });
  }
}
