import { NavigationError } from '@angular/router';
import { recoverRouteLoad } from './route-load-recovery';

describe('Lazy route recovery', () => {
  beforeEach(() => sessionStorage.clear());
  afterEach(() => sessionStorage.clear());
  it('opens the requested page once after a failed import without looping', () => {
    const navigate = vi.fn();
    const event = new NavigationError(1, '/watchlist-manager/watchlist', new TypeError('Failed to fetch dynamically imported module: chunk.js'));
    recoverRouteLoad(event, sessionStorage, navigate, 100_000);
    recoverRouteLoad(event, sessionStorage, navigate, 100_001);
    expect(navigate).toHaveBeenCalledExactlyOnceWith(new URL(event.url, document.baseURI).href);
  });
  it('does not reload for component errors or external destinations', () => {
    const navigate = vi.fn();
    recoverRouteLoad(new NavigationError(1, '/watchlist-manager/watchlist', new Error('Invalid data')), sessionStorage, navigate);
    recoverRouteLoad(new NavigationError(2, 'https://other.example/', new Error('Failed to fetch dynamically imported module')), sessionStorage, navigate);
    expect(navigate).not.toHaveBeenCalled();
  });
});
