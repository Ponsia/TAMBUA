import { EMPTY } from 'rxjs';
import { LiveEventsService } from '../../../core/services/live-events.service';
import { AuthService } from '../../../core/services/auth.service';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CamerasComponent } from './cameras';

describe('Cameras', () => {
  let component: CamerasComponent;
  let fixture: ComponentFixture<CamerasComponent>;
  let http: HttpTestingController;
  let role: string | null;

  beforeEach(async () => {
    role = 'SYSTEM_OWNER_ADMIN';
    await TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: { getRole: () => role } },
        { provide: LiveEventsService, useValue: { events: () => EMPTY } },
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
      imports: [CamerasComponent],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(CamerasComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    http.expectOne(request => request.body.query.includes('query')).flush({
      data: { cameras: { items: [], totalCount: 0 } },
    });
    await fixture.whenStable();
  });

  afterEach(() => http.verify());

  function fillForm() {
    component.form = {
      name: ' Gate camera ', location: 'Main gate', zone: 'North',
      connectionType: 'WIRED', streamSource: ' rtsp://192.168.1.10:554/stream ',
      ipAddress: '192.168.1.10', port: '554', status: 'ACTIVE',
    };
  }

  it('opens the form from Add Camera and submits camera information', async () => {
    fixture.nativeElement.querySelector('.page-header button').click();
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('input[name="ipAddress"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('input[name="streamSource"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('select[name="connectionType"]').textContent)
      .toContain('Wireless');
    expect(component.form['status']).toBe('ACTIVE');
    fillForm();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.nativeElement.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    const request = http.expectOne(request => request.body.query.includes('createCamera'));
    expect(request.request.body.variables.input).toEqual({
      name: 'Gate camera', location: 'Main gate', zone: 'North', connectionType: 'WIRED',
      streamSource: 'rtsp://192.168.1.10:554/stream', ipAddress: '192.168.1.10', port: 554,
      status: 'ACTIVE',
    });
    expect(component.saving).toBe(true);
    request.flush({ data: { createCamera: { id: 'camera-1', ...request.request.body.variables.input } } });
    await fixture.whenStable();
    expect(component.showCameraForm).toBe(false);
    expect(fixture.nativeElement.querySelector('tbody').textContent).toContain('192.168.1.10');
    expect(component.count('ACTIVE')).toBe(1);
  });

  it('opens without a session and explains why saving is unavailable', () => {
    role = null;
    component.openForm();
    expect(component.showCameraForm).toBe(true);
    fillForm();
    component.saveRecord();
    expect(component.errorMessage).toContain('Sign in');
    http.expectNone(request => request.body.query.includes('mutation'));
  });

  it('rejects invalid network information before saving', () => {
    component.openForm();
    fillForm();
    component.form['ipAddress'] = '999.1.1.1';
    component.saveRecord();
    expect(component.errorMessage).toContain('IPv4');
    component.form['ipAddress'] = '192.168.1.10';
    component.form['streamSource'] = ' ';
    component.saveRecord();
    expect(component.errorMessage).toContain('stream source');
    component.form['streamSource'] = 'browser';
    for (const port of ['0', '65536', '1.5']) {
      component.form['port'] = port;
      component.saveRecord();
      expect(component.errorMessage).toContain('port');
    }
    http.expectNone(request => request.body.query.includes('mutation'));
  });

  it('sends optional network fields as null when they are left empty', () => {
    component.openForm();
    fillForm();
    component.form['ipAddress'] = '';
    component.form['port'] = '';
    component.saveRecord();
    const request = http.expectOne(request => request.body.query.includes('createCamera'));
    expect(request.request.body.variables.input.ipAddress).toBeNull();
    expect(request.request.body.variables.input.port).toBeNull();
    request.flush({ data: { createCamera: { id: 'camera-2' } } });
  });

  it('preserves numeric ports when editing and keeps inputs after a failed save', () => {
    component.openForm({ id: 'camera-1', name: 'Gate', location: 'Gate', ipAddress: '10.0.0.1', port: 8080, connectionType: 'WIRELESS', streamSource: 'rtsp://10.0.0.1:8080/live' });
    expect(component.form['port']).toBe('8080');
    component.saveRecord();
    component.saveRecord();
    const request = http.expectOne(request => request.body.query.includes('updateCamera'));
    expect(request.request.body.variables.id).toBe('camera-1');
    request.flush('Unavailable', { status: 503, statusText: 'Service Unavailable' });
    expect(component.saving).toBe(false);
    expect(component.showCameraForm).toBe(true);
    expect(component.form['port']).toBe('8080');
    expect(component.errorMessage).toBeTruthy();
  });
});
