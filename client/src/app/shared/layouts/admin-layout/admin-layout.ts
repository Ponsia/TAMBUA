import { NotificationService } from '../../../core/services/notification.service';
import { SiteFooterComponent } from '../../components/site-footer/site-footer';
import { ProfileMenuComponent } from '../../components/profile-menu/profile-menu';
import { BrandLogoComponent } from '../../components/brand-logo/brand-logo';
import { ThemeToggleComponent } from '../../components/theme-toggle/theme-toggle';
import { inject, signal, DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AdminDashboardService } from '../../../core/services/admin-dashboard.service';
import { LucideUsers } from '@lucide/angular';
import { Component } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import {
  LucideLayoutDashboard,
  LucideUserSearch,
  LucideShieldAlert,
  LucideActivity,
  LucideMapPin,
  LucideCctv,
  LucideFileText,
  LucideShieldCheck,
  LucideLogOut,
  LucideBell,
} from '@lucide/angular';

import { AuthService } from '../../../core/services/auth.service';
import { User } from '../../../core/models/auth.model';

@Component({
  selector: 'app-admin-layout',
  standalone: true,

  imports: [
    SiteFooterComponent,
    ProfileMenuComponent,
    BrandLogoComponent,
    ThemeToggleComponent,
    LucideUsers,
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    LucideLayoutDashboard,
    LucideUserSearch,
    LucideShieldAlert,
    LucideActivity,
    LucideMapPin,
    LucideCctv,
    LucideFileText,
    LucideShieldCheck,
    LucideLogOut,
    LucideBell,
    ],

  templateUrl: './admin-layout.html',
  styleUrl: './admin-layout.css',
})
export class AdminLayout {
  private readonly feedback = inject(NotificationService);
  mobileMenuOpen = false;
  readonly pendingAlerts = signal<number | null>(null);
  private readonly dashboard = inject(AdminDashboardService);
  private readonly destroyRef = inject(DestroyRef);

  currentUser: User | null;

  constructor(
    private authService: AuthService,
    private router: Router,
  ) {
    this.currentUser = this.authService.getCurrentUser();
    this.dashboard
      .getAlertStats()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (stats) => this.pendingAlerts.set(stats.pending),
        error: () => this.pendingAlerts.set(null),
      });
  }

  logout(): void {
    this.feedback.success('Successfully logged out.');
    this.authService.logout();

    this.router.navigateByUrl('/login');
  }

  get displayName(): string {
    return this.currentUser?.fullName || 'System Administrator';
  }

  get roleLabel(): string {
    return 'System Owner Admin';
  }

  get avatarLetter(): string {
    const name = this.currentUser?.fullName?.trim();

    if (!name) {
      return 'A';
    }

    return name.charAt(0).toUpperCase();
  }
}
