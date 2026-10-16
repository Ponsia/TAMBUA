export type Resource =
  'missingPersonCases' | 'watchlistPersons' | 'cameras' | 'alerts' | 'sightings' | 'auditLogs';
export type SubjectType = 'WATCHLIST' | 'MISSING_PERSON';

export interface RecordItem {
  id: string;
  fullName?: string;
  photoUrl?: string;
  category?: string;
  lastSeenLocation?: string;
  lastSeenDate?: string | null;
  reportingContact?: string;
  status?: string;
  caseOfficerId?: string | null;
  createdAt?: string;
  reason?: string;
  riskLevel?: string;
  addedById?: string;
  name?: string;
  location?: string;
  zone?: string;
  streamSource?: string;
  connectionType?: string;
  ipAddress?: string | null;
  port?: number | null;
  cameraId?: string;
  watchlistPersonId?: string;
  caseId?: string;
  confidenceScore?: number;
  frameSnapshotUrl?: string;
  clipUrl?: string | null;
  clipDurationSeconds?: number | null;
  detectedAt?: string;
  reviewedById?: string | null;
  reviewedAt?: string | null;
  actorId?: string | null;
  action?: string;
  entity?: string;
  entityId?: string;
  ip?: string;
  oldPayload?: unknown;
  newPayload?: unknown;
}

export interface RecordPage {
  items: RecordItem[];
  totalCount: number;
}

export interface TimelineEntry {
  id: string;
  source: 'ALERT' | 'SIGHTING';
  cameraId: string;
  cameraName: string;
  confidenceScore: number;
  frameSnapshotUrl: string;
  clipUrl: string | null;
  clipDurationSeconds: number | null;
  detectedAt: string;
}

export interface SearchResult {
  searchLogId: string;
  outcome: 'MATCH_FOUND' | 'NO_MATCH';
  matchedReference: string | null;
  subjectType: SubjectType | null;
  subjectId: string | null;
  confidenceScore: number | null;
}

export interface FaceEmbedding {
  id: string;
  subjectType: SubjectType;
  subjectId: string;
  sourceImageUrl: string;
  qualityScore: number;
  createdAt: string;
}
