import { HttpErrorResponse } from '@angular/common/http';

function serverMessage(body: unknown): string {
  if (typeof body === 'string') return body.trim().slice(0, 300);
  if (body && typeof body === 'object') {
    const detail = (body as { detail?: unknown; error?: unknown }).detail ?? (body as { error?: unknown }).error;
    if (typeof detail === 'string') return detail;
  }
  return '';
}

export function apiError(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 0)
      return 'Unable to reach the server. Check your connection and try again.';
    if (error.status === 401) return 'Your session has expired. Please sign in again.';
    if (error.status === 403) return 'You do not have permission to perform this action.';
    if (error.status === 429) return 'Too many requests. Please wait before trying again.';
    if (error.status === 400 || error.status === 413 || error.status === 422) {
      const message = serverMessage(error.error);
      if (message && !message.startsWith('<')) return message;
    }
    return 'The server could not complete the request. Please try again.';
  }
  return error instanceof Error
    ? error.message
    : 'Unable to complete the request. Please try again.';
}
