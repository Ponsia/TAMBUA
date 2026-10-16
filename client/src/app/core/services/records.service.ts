import { NotificationService } from './notification.service';
import { Injectable, inject } from '@angular/core';
import { EMPTY, Observable, expand, map, reduce } from 'rxjs';
import {
  FaceEmbedding,
  RecordItem,
  RecordPage,
  Resource,
  SearchResult,
  SubjectType,
  TimelineEntry,
} from '../models/records.model';
import { Graphql } from './graphql';

const FIELDS: Record<Resource, string> = {
  missingPersonCases:
    'id fullName photoUrl category lastSeenLocation lastSeenDate reportingContact status caseOfficerId createdAt',
  watchlistPersons: 'id fullName photoUrl reason riskLevel status addedById createdAt',
  cameras:
    'id name location zone ipAddress port connectionType streamSource status addedById createdAt',
  alerts:
    'id cameraId watchlistPersonId confidenceScore frameSnapshotUrl clipUrl clipDurationSeconds detectedAt status reviewedById reviewedAt',
  sightings:
    'id cameraId caseId confidenceScore frameSnapshotUrl clipUrl clipDurationSeconds detectedAt status reviewedById reviewedAt',
  auditLogs: 'id actorId action entity entityId ip createdAt',
};

const DETAIL: Record<Resource, string> = {
  missingPersonCases: 'missingPersonCase',
  watchlistPersons: 'watchlistPerson',
  cameras: 'camera',
  alerts: 'alert',
  sightings: 'sighting',
  auditLogs: 'auditLog',
};

@Injectable({ providedIn: 'root' })
export class RecordsService {
  private readonly feedback = inject(NotificationService);
  private readonly graphql = inject(Graphql);

  page(resource: Resource, offset = 0, limit = 100): Observable<RecordPage> {
    return this.graphql
      .request<Record<string, RecordPage>>(
        `
      query Records($limit: Int!, $offset: Int!) {
        ${resource}(limit: $limit, offset: $offset) { items { ${FIELDS[resource]} } totalCount }
      }
    `,
        { limit, offset },
      )
      .pipe(
        map((data) => {
          const page = data[resource];
          if (!page || !Array.isArray(page.items) || typeof page.totalCount !== 'number') {
            throw new Error('The server returned an invalid records page.');
          }
          return page;
        }),
      );
  }

  all(resource: Resource): Observable<RecordItem[]> {
    return this.page(resource).pipe(
      map((page) => ({ ...page, nextOffset: page.items.length })),
      expand((page) => {
        if (page.nextOffset >= page.totalCount) return EMPTY;
        if (!page.items.length) throw new Error('The server returned an incomplete records page.');
        return this.page(resource, page.nextOffset).pipe(
          map((next) => ({ ...next, nextOffset: page.nextOffset + next.items.length })),
        );
      }),
      reduce((items, page) => [...items, ...page.items], [] as RecordItem[]),
    );
  }

  detail(resource: Resource, id: string): Observable<RecordItem> {
    const field = DETAIL[resource];
    const fields = FIELDS[resource] + (resource === 'auditLogs' ? ' oldPayload newPayload' : '');
    return this.graphql
      .request<Record<string, RecordItem>>(
        `
      query RecordDetail($id: ID!) { ${field}(id: $id) { ${fields} } }
    `,
        { id },
      )
      .pipe(map((data) => data[field]));
  }

  save(
    resource: 'cameras' | 'watchlistPersons' | 'missingPersonCases',
    input: Record<string, unknown>,
    id?: string,
  ): Observable<RecordItem> {
    const type = {
      cameras: 'Camera',
      watchlistPersons: 'WatchlistPerson',
      missingPersonCases: 'MissingPersonCase',
    }[resource];
    const action = id ? 'update' : 'create';
    const field = `${action}${type}`;
    const inputType = `${id ? 'Update' : 'Create'}${type}Input!`;
    return this.graphql
      .request<Record<string, RecordItem>>(
        `
      mutation SaveRecord($input: ${inputType}${id ? ', $id: ID!' : ''}) {
        ${field}(${id ? 'id: $id, ' : ''}input: $input) { ${FIELDS[resource]} }
      }
    `,
        { input, ...(id ? { id } : {}) },
      )
      .pipe(
        map((data) => {
          const record = data[field];
          if (!record?.id) throw new Error('The server did not confirm the saved record.');
          return record;
        }),
        this.feedback.feedback(`${resource === 'missingPersonCases' ? 'Missing person' : resource === 'watchlistPersons' ? 'Watchlist person' : 'Camera'} ${id ? 'updated' : 'added'} successfully.`),
      );
  }

  changeStatus(resource: Resource, id: string, status: string): Observable<RecordItem> {
    if (resource === 'missingPersonCases') {
      return this.graphql
        .request<{ updateCaseStatus: RecordItem }>(
          `
        mutation UpdateCaseStatus($input: UpdateCaseStatusInput!) {
          updateCaseStatus(input: $input) { ${FIELDS.missingPersonCases} }
        }
      `,
          { input: { id, newStatus: status } },
        )
        .pipe(map((data) => { if (!data.updateCaseStatus?.id) throw new Error('The server did not confirm the status change.'); return data.updateCaseStatus; }), this.feedback.feedback(`Case marked as ${status.toLowerCase()} successfully.`));
    }
    const field =
      resource === 'cameras'
        ? 'disableCamera'
        : resource === 'watchlistPersons'
          ? 'removeWatchlistPerson'
          : `${status === 'CONFIRMED' ? 'confirm' : 'reject'}${resource === 'alerts' ? 'Alert' : 'Sighting'}`;
    return this.graphql
      .request<Record<string, RecordItem>>(
        `
      mutation ChangeStatus($id: ID!) { ${field}(id: $id) { ${FIELDS[resource]} } }
    `,
        { id },
      )
      .pipe(map((data) => { if (!data[field]?.id) throw new Error('The server did not confirm the change.'); return data[field]; }), this.feedback.feedback(resource === 'watchlistPersons' ? 'Person removed from the watchlist.' : resource === 'cameras' ? 'Camera disabled successfully.' : `${resource === 'alerts' ? 'Alert' : 'Sighting'} ${status.toLowerCase()} successfully.`));
  }

  timeline(subjectType: SubjectType, subjectId: string): Observable<TimelineEntry[]> {
    return this.graphql
      .request<{ movementTimeline: TimelineEntry[] }>(
        `
      query MovementTimeline($subjectType: SubjectType!, $subjectId: ID!) {
        movementTimeline(subjectType: $subjectType, subjectId: $subjectId) {
          id source cameraId cameraName confidenceScore frameSnapshotUrl clipUrl clipDurationSeconds detectedAt
        }
      }
    `,
        { subjectType, subjectId },
      )
      .pipe(map((data) => data.movementTimeline));
  }

  searchByPhoto(uploadedPhotoUrl: string): Observable<SearchResult> {
    return this.graphql
      .request<{ searchByPhoto: SearchResult }>(
        `
      mutation SearchByPhoto($uploadedPhotoUrl: String!) {
        searchByPhoto(uploadedPhotoUrl: $uploadedPhotoUrl) {
          searchLogId outcome matchedReference subjectType subjectId confidenceScore
        }
      }
    `,
        { uploadedPhotoUrl },
      )
      .pipe(map((data) => data.searchByPhoto), this.feedback.feedback((result) => result.outcome === 'MATCH_FOUND' ? 'Photo search completed. A possible match was found.' : 'Photo search completed. No match was found.'));
  }

  /** Registers the photo's face with the AI engine for the given person. */
  enrollFace(subjectType: SubjectType, subjectId: string, photoUrl: string): Observable<FaceEmbedding> {
    return this.graphql
      .request<{ enrollFace: FaceEmbedding }>(
        `
      mutation EnrollFace($subjectType: SubjectType!, $subjectId: ID!, $photoUrl: String!) {
        enrollFace(subjectType: $subjectType, subjectId: $subjectId, photoUrl: $photoUrl) {
          id subjectType subjectId sourceImageUrl qualityScore createdAt
        }
      }
    `,
        { subjectType, subjectId, photoUrl },
      )
      .pipe(map((data) => data.enrollFace));
  }

  /** The watchlist person or missing-person case a search result points to. */
  subject(subjectType: SubjectType, id: string): Observable<RecordItem> {
    return this.detail(subjectType === 'WATCHLIST' ? 'watchlistPersons' : 'missingPersonCases', id);
  }

  /** Active investigators a missing-person case can be assigned to. */
  caseOfficers(): Observable<{ id: string; fullName: string; station: string }[]> {
    return this.graphql
      .request<{ caseOfficers: { id: string; fullName: string; station: string }[] }>(
        'query CaseOfficers { caseOfficers { id fullName station } }',
      )
      .pipe(map((data) => data.caseOfficers));
  }
}
