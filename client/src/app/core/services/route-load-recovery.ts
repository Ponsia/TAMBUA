import { NavigationError } from '@angular/router';

const KEY = 'tambua-route-load-recovery';
const COOLDOWN = 60_000;

/** Reload the requested route once when the browser has cached a failed lazy import. */
export function recoverRouteLoad(
  event: NavigationError,
  storage: Pick<Storage, 'getItem' | 'setItem'> = sessionStorage,
  navigate: (url: string) => void = (url) => window.location.assign(url),
  now = Date.now(),
): void {
  const message = event.error instanceof Error ? event.error.message : String(event.error);
  if (!/Failed to fetch dynamically imported module|Importing a module script failed|Loading chunk .+ failed/i.test(message)) return;
  const destination = new URL(event.url, document.baseURI);
  if (destination.origin !== window.location.origin) return;
  try {
    const previous = storage.getItem(KEY);
    if (previous && now - Number(previous) < COOLDOWN) return;
    storage.setItem(KEY, String(now));
  } catch {
    // Without storage we cannot prevent a refresh loop.
    return;
  }
  navigate(destination.href);
}
