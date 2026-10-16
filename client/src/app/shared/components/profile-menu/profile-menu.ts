import { NotificationService } from '../../../core/services/notification.service';
import { Component, DestroyRef, ElementRef, HostListener, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { apiError } from '../../../core/services/api-error';

@Component({
  selector: 'app-profile-menu',
  imports: [FormsModule],
  templateUrl: './profile-menu.html',
  styleUrl: './profile-menu.css',
})
export class ProfileMenuComponent {
  private readonly feedback = inject(NotificationService);
  readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly element: ElementRef<HTMLElement> = inject(ElementRef);
  readonly open = signal(false);
  readonly panel = signal<'menu' | 'profile' | 'password'>('menu');
  readonly user = this.auth.getCurrentUser();
  readonly roleName = this.user?.role === 'SYSTEM_OWNER_ADMIN' ? 'System administrator'
    : this.user?.role === 'WATCHLIST_MANAGER' ? 'Watchlist manager' : 'Investigator';
  readonly savedName = signal(this.user?.fullName || 'My account');
  readonly message = signal('');
  readonly error = signal('');
  readonly busy = signal(false);
  draftName = this.savedName();
  currentPassword = '';
  newPassword = '';
  confirmPassword = '';

  toggle(): void { this.open() ? this.close() : this.open.set(true); }
  close(restoreFocus = false): void {
    if (this.busy()) return;
    this.open.set(false);
    this.panel.set('menu');
    this.resetMessages();
    this.currentPassword = this.newPassword = this.confirmPassword = '';
    if (restoreFocus) this.element.nativeElement.querySelector<HTMLButtonElement>('.profile-trigger')?.focus();
  }
  edit(): void {
    this.draftName = this.savedName();
    this.resetMessages();
    this.panel.set('profile');
  }
  showPassword(): void {
    this.currentPassword = this.newPassword = this.confirmPassword = '';
    this.resetMessages();
    this.panel.set('password');
  }

  save(): void {
    this.resetMessages();
    if (!this.user) { this.error.set('Sign in to update your profile.'); return; }
    const name = this.draftName.trim();
    if (!name) { this.error.set('Enter your display name.'); return; }
    this.busy.set(true);
    this.auth.updateProfile(name).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (user) => {
        this.busy.set(false);
        this.savedName.set(user.fullName);
        this.message.set('Your name has been updated.');
        this.feedback.success('Profile saved.');
      },
      error: (error) => { this.busy.set(false); this.error.set(apiError(error)); },
    });
  }

  changePassword(): void {
    this.resetMessages();
    if (!this.currentPassword || !this.newPassword) { this.error.set('Enter your current and new password.'); return; }
    if (this.newPassword.length < 8) { this.error.set('Use a new password of at least 8 characters.'); return; }
    if (this.newPassword !== this.confirmPassword) { this.error.set('The new passwords do not match.'); return; }
    this.busy.set(true);
    this.auth.changePassword(this.currentPassword, this.newPassword).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.busy.set(false);
        this.currentPassword = this.newPassword = this.confirmPassword = '';
        this.message.set('Your password has been changed.');
        this.feedback.success('Password changed.');
      },
      error: (error) => { this.busy.set(false); this.error.set(apiError(error)); },
    });
  }

  logout(): void { this.feedback.success('Successfully logged out.'); this.close(); this.auth.logout(); void this.router.navigateByUrl('/login'); }
  private resetMessages(): void { this.message.set(''); this.error.set(''); }
  @HostListener('document:click', ['$event']) outside(event: MouseEvent): void {
    if (this.open() && !this.element.nativeElement.contains(event.target as Node)) this.close();
  }
  @HostListener('keydown.escape') escape(): void { this.close(true); }
}
