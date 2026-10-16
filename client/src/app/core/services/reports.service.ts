import { API_CONFIG } from '../config/api.config';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';

export type ReportType = 'audit_logs' | 'alert_stats' | 'case_stats';
export type ReportFormat = 'csv' | 'pdf';

@Injectable({ providedIn: 'root' })
export class ReportsService {
  private readonly config = inject(API_CONFIG);
  private readonly http = inject(HttpClient);

  download(report: ReportType, format: ReportFormat, dateFrom: string, dateTo: string) {
    let params = new HttpParams().set('report', report);
    if (dateFrom) params = params.set('date_from', dateFrom);
    if (dateTo) params = params.set('date_to', dateTo);
    return this.http.get(`${this.config.exportsUrl}${format}/`, {
      params,
      responseType: 'blob',
      observe: 'response',
    });
  }
}
