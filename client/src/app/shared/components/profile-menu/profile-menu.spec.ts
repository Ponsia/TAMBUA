import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { AuthService } from '../../../core/services/auth.service';
import { ProfileMenuComponent } from './profile-menu';

describe('Profile menu account settings', () => {
  const user = { id: 'one', fullName: 'Original Name', email: 'user@example.test', role: 'WATCHLIST_MANAGER' };
  let auth: { getCurrentUser: () => typeof user; logout: ReturnType<typeof vi.fn>; updateProfile: ReturnType<typeof vi.fn>; changePassword: ReturnType<typeof vi.fn> };
  beforeEach(() => {
    auth = {
      getCurrentUser: () => user,
      logout: vi.fn(),
      updateProfile: vi.fn((fullName: string) => of({ ...user, fullName })),
      changePassword: vi.fn(() => of(true)),
    };
    TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: AuthService, useValue: auth }] });
  });

  it('saves the display name on the server', () => {
    const component = TestBed.createComponent(ProfileMenuComponent).componentInstance;
    component.edit(); component.draftName = '  New Name ';
    component.save();
    expect(auth.updateProfile).toHaveBeenCalledWith('New Name');
    expect(component.savedName()).toBe('New Name');
    expect(component.message()).toContain('updated');
  });

  it('validates and submits a password change', () => {
    const component = TestBed.createComponent(ProfileMenuComponent).componentInstance;
    component.showPassword();
    component.currentPassword = 'old-password'; component.newPassword = 'short'; component.confirmPassword = 'short';
    component.changePassword();
    expect(component.error()).toContain('at least 8');
    component.newPassword = 'a-better-pass'; component.confirmPassword = 'different-pass';
    component.changePassword();
    expect(component.error()).toContain('do not match');
    component.confirmPassword = 'a-better-pass';
    component.changePassword();
    expect(auth.changePassword).toHaveBeenCalledWith('old-password', 'a-better-pass');
    expect(component.message()).toContain('changed');
  });

  it('shows the server error when the current password is wrong', () => {
    auth.changePassword.mockReturnValue(throwError(() => new Error('Your current password is incorrect.')));
    const component = TestBed.createComponent(ProfileMenuComponent).componentInstance;
    component.showPassword();
    component.currentPassword = 'wrong'; component.newPassword = 'a-better-pass'; component.confirmPassword = 'a-better-pass';
    component.changePassword();
    expect(component.error()).toBe('Your current password is incorrect.');
  });
});
