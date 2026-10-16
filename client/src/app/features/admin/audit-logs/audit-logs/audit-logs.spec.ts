import { of, EMPTY } from 'rxjs';
import { RecordsService } from '../../../../core/services/records.service';
import { LiveEventsService } from '../../../../core/services/live-events.service';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AuditLogsComponent } from './audit-logs';

describe('AuditLogs', () => {
  let component: AuditLogsComponent;
  let fixture: ComponentFixture<AuditLogsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      providers: [
        { provide: RecordsService, useValue: { all: () => of([]) } },
        { provide: LiveEventsService, useValue: { events: () => EMPTY } },
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
      imports: [AuditLogsComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(AuditLogsComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
