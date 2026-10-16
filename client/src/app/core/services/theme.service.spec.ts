import { TestBed } from '@angular/core/testing';
import { ThemeService } from './theme.service';

describe('ThemeService', () => {
  beforeEach(() => {
    localStorage.setItem('tambua_theme', 'light');
    TestBed.configureTestingModule({});
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    localStorage.removeItem('tambua_theme');
    delete document.documentElement.dataset['theme'];
    document.documentElement.style.colorScheme = '';
  });

  it('restores a saved preference and applies the browser color scheme', () => {
    localStorage.setItem('tambua_theme', 'dark');
    const service = TestBed.inject(ThemeService);
    expect(service.theme()).toBe('dark');
    expect(document.documentElement.dataset['theme']).toBe('dark');
    expect(document.documentElement.style.colorScheme).toBe('dark');
  });

  it('persists theme changes', () => {
    const service = TestBed.inject(ThemeService);
    service.toggle();
    expect(service.theme()).toBe('dark');
    expect(localStorage.getItem('tambua_theme')).toBe('dark');
    service.toggle();
    expect(document.documentElement.dataset['theme']).toBe('light');
    expect(localStorage.getItem('tambua_theme')).toBe('light');
  });

  it('synchronizes a preference changed in another tab', () => {
    const service = TestBed.inject(ThemeService);
    localStorage.setItem('tambua_theme', 'dark');
    window.dispatchEvent(new StorageEvent('storage', { key: 'tambua_theme' }));
    expect(service.theme()).toBe('dark');
    expect(document.documentElement.dataset['theme']).toBe('dark');
  });
});
