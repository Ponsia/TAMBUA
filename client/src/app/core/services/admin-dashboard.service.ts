import { Injectable, inject } from '@angular/core';
import { map } from 'rxjs';
import { AlertStats, CaseStats } from '../models/dashboard.model';
import { Graphql } from './graphql';
import { RecordsService } from './records.service';

@Injectable({ providedIn: 'root' })
export class AdminDashboardService {
  private readonly graphql = inject(Graphql);
  private readonly records = inject(RecordsService);

  getCaseStats(dateFrom = '1970-01-01T00:00:00.000Z', dateTo = new Date().toISOString()) {
    return this.graphql
      .request<{ caseStats: CaseStats }>(
        `
      query CaseStats($dateFrom: DateTime!, $dateTo: DateTime!) {
        caseStats(dateFrom: $dateFrom, dateTo: $dateTo) { open found closed }
      }
    `,
        { dateFrom, dateTo },
      )
      .pipe(map((data) => data.caseStats));
  }

  getAlertStats(dateFrom = '1970-01-01T00:00:00.000Z', dateTo = new Date().toISOString()) {
    return this.graphql
      .request<{ alertStats: AlertStats }>(
        `
      query AlertStats($dateFrom: DateTime!, $dateTo: DateTime!) {
        alertStats(dateFrom: $dateFrom, dateTo: $dateTo) { total pending confirmed rejected }
      }
    `,
        { dateFrom, dateTo },
      )
      .pipe(map((data) => data.alertStats));
  }

  getCameras() {
    return this.records.all('cameras');
  }
  getAlerts() {
    return this.records.all('alerts');
  }
  getSightings() {
    return this.records.all('sightings');
  }
}
