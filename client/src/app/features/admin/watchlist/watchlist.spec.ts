import { of, EMPTY } from 'rxjs';
import { RecordsService } from '../../../core/services/records.service';
import { LiveEventsService } from '../../../core/services/live-events.service';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { WatchlistComponent } from './watchlist';

describe('Watchlist', () => {
  let component: WatchlistComponent;
  let fixture: ComponentFixture<WatchlistComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      providers: [
        { provide: RecordsService, useValue: { all: () => of([]) } },
        { provide: LiveEventsService, useValue: { events: () => EMPTY } },
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
      imports: [WatchlistComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(WatchlistComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
