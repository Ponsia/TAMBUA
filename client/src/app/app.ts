import { NotificationsComponent } from './shared/components/notifications/notifications';
import { ThemeService } from './core/services/theme.service';
import { Component, inject, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, NotificationsComponent],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  private readonly theme = inject(ThemeService);
  protected readonly title = signal('e-TAMBUA');
}
