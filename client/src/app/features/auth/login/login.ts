import { NotificationService } from '../../../core/services/notification.service';
import { SiteFooterComponent } from '../../../shared/components/site-footer/site-footer';
import { BrandLogoComponent } from '../../../shared/components/brand-logo/brand-logo';
import { ChangeDetectorRef, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { apiError } from '../../../core/services/api-error';
import { Component } from '@angular/core';

import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';

import { ThemeToggleComponent } from '../../../shared/components/theme-toggle/theme-toggle';
import { RouterLink } from '@angular/router';
import {
  LucideArrowLeft,
  LucideArrowUpRight,
  LucideUsers,
  LucideShieldCheck,
  LucideCircleAlert,
} from '@lucide/angular';
import { Router } from '@angular/router';

import { LucideEye, LucideEyeOff, LucideLockKeyhole, LucideMail } from '@lucide/angular';

import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,

  imports: [
    SiteFooterComponent,
    BrandLogoComponent,
    ThemeToggleComponent,
    RouterLink,
    LucideArrowLeft,
    LucideArrowUpRight,
    LucideUsers,
    LucideShieldCheck,
    LucideCircleAlert,
    ReactiveFormsModule,
    LucideEye,
    LucideEyeOff,
    LucideLockKeyhole,
    LucideMail,
  ],

  templateUrl: './login.html',
  styleUrls: ['./login.css', './login-details.css'],
})
export class LoginComponent {
  private readonly feedback = inject(NotificationService);
  private readonly changeDetector = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);

  readonly year = new Date().getFullYear();
  readonly greeting =
    new Date().getHours() < 12
      ? 'Good morning.'
      : new Date().getHours() < 18
        ? 'Good afternoon.'
        : 'Good evening.';
  capsLock = false;
  helpOpen = false;

  checkCapsLock(event: KeyboardEvent): void {
    this.capsLock = event.getModifierState?.('CapsLock') ?? false;
  }

  loginForm: FormGroup;

  loading = false;

  errorMessage = '';

  showPassword = false;

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private router: Router,
  ) {
    this.loginForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],

      password: ['', Validators.required],
    });
  }

  togglePassword(): void {
    this.showPassword = !this.showPassword;
  }

  login(): void {
    if (this.loading) return;
    this.errorMessage = '';

    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();

      return;
    }

    const email = this.loginForm.value.email;

    const password = this.loginForm.value.password;

    this.loading = true;

    this.authService
      .login(email, password)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (authPayload) => {
          this.loading = false;

          const destination = this.authService.getRoleRoute(authPayload.user.role);

          this.feedback.success('Successfully logged in.');
          this.router.navigateByUrl(destination);
        },

        error: (error) => {
          this.loading = false;

          this.errorMessage = apiError(error);
          this.feedback.error(this.errorMessage);
          this.changeDetector.markForCheck();
        },
      });
  }

  get email() {
    return this.loginForm.get('email');
  }

  get password() {
    return this.loginForm.get('password');
  }
}
