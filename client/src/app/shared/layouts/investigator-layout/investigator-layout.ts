import { NotificationService } from '../../../core/services/notification.service';
import { SiteFooterComponent } from '../../components/site-footer/site-footer';
import { ProfileMenuComponent } from '../../components/profile-menu/profile-menu';
import { BrandLogoComponent } from '../../components/brand-logo/brand-logo';
import { ThemeToggleComponent } from '../../components/theme-toggle/theme-toggle';
import { Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import {
  LucideLayoutDashboard,
  LucideUserSearch,
  LucideShieldAlert,
  LucideCctv,
  LucideActivity,
  LucideSearch,
  LucideLogOut,
  LucideBell,
} from '@lucide/angular';

import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-investigator-layout',
  standalone: true,

  imports: [
    SiteFooterComponent,
    ProfileMenuComponent,
    BrandLogoComponent,
    ThemeToggleComponent,
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    LucideLayoutDashboard,
    LucideUserSearch,
    LucideShieldAlert,
    LucideCctv,
    LucideActivity,
    LucideSearch,
    LucideLogOut,
    LucideBell,
    ],

  templateUrl: './investigator-layout.html',
  styleUrl: './investigator-layout.css',
})
export class InvestigatorLayout {
  private readonly feedback = inject(NotificationService);
  mobileMenuOpen = false;
  private authService = inject(AuthService);
  private router = inject(Router);

  currentUser = this.authService.getCurrentUser();

  logout(): void {
    this.feedback.success('Successfully logged out.');
    this.authService.logout();
    this.router.navigateByUrl('/login');
  }
}
