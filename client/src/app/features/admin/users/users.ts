import { ChangeDetectorRef, Component, DestroyRef, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Observable } from 'rxjs';
import { UserRole } from '../../../core/models/auth.model';
import { AuthService } from '../../../core/services/auth.service';
import { ManagedUser, UsersService } from '../../../core/services/users.service';
import { NotificationService } from '../../../core/services/notification.service';
import { apiError } from '../../../core/services/api-error';

import {
  LucideUsers,
  LucideUserCheck,
  LucideShieldCheck,
  LucideUserPlus,
  LucideSearch,
  LucidePlus,
} from '@lucide/angular';

type FormMode = 'create' | 'edit' | 'password';

export const ROLE_LABELS: Record<UserRole, string> = {
  SYSTEM_OWNER_ADMIN: 'System owner admin',
  WATCHLIST_MANAGER: 'Watchlist manager',
  INVESTIGATOR: 'Investigator',
};

@Component({
  selector: 'app-users',
  standalone: true,

  imports: [
    DatePipe,
    FormsModule,
    LucideUsers,
    LucideUserCheck,
    LucideShieldCheck,
    LucideUserPlus,
    LucideSearch,
    LucidePlus,
  ],

  templateUrl: './users.html',
  styleUrl: './users.css',
})
export class UsersComponent implements OnInit {
  private readonly api = inject(UsersService);
  private readonly auth = inject(AuthService);
  private readonly notices = inject(NotificationService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly changeDetector = inject(ChangeDetectorRef);

  readonly roles = Object.keys(ROLE_LABELS) as UserRole[];
  readonly roleLabels = ROLE_LABELS;
  readonly currentUserId = this.auth.getCurrentUser()?.id;

  users: ManagedUser[] = [];
  loading = true;
  loaded = false;
  saving = false;
  errorMessage = '';
  formError = '';
  searchTerm = '';
  selectedRole: UserRole | 'ALL' = 'ALL';

  mode: FormMode | null = null;
  editing: ManagedUser | null = null;
  form = { email: '', fullName: '', role: '' as UserRole | '', station: '', password: '', confirm: '' };

  ngOnInit(): void {
    this.reload();
  }

  reload(): void {
    this.loading = true;
    this.errorMessage = '';
    this.api
      .all()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (users) => {
          this.users = users;
          this.loading = false;
          this.loaded = true;
          this.changeDetector.markForCheck();
        },
        error: (error) => {
          this.errorMessage = apiError(error);
          this.loading = false;
          this.changeDetector.markForCheck();
        },
      });
  }

  get filteredUsers(): ManagedUser[] {
    const search = this.searchTerm.trim().toLowerCase();
    return this.users.filter(
      (user) =>
        (this.selectedRole === 'ALL' || user.role === this.selectedRole) &&
        (!search || `${user.fullName} ${user.email} ${user.station}`.toLowerCase().includes(search)),
    );
  }
  get activeCount(): number {
    return this.users.filter((user) => user.isActive).length;
  }
  get adminCount(): number {
    return this.users.filter((user) => user.role === 'SYSTEM_OWNER_ADMIN').length;
  }
  get newCount(): number {
    const since = Date.now() - 30 * 86400000;
    return this.users.filter((user) => Date.parse(user.createdAt) >= since).length;
  }

  openCreate(): void {
    this.open('create', null);
  }
  openEdit(user: ManagedUser): void {
    this.open('edit', user);
  }
  openPassword(user: ManagedUser): void {
    this.open('password', user);
  }
  closeForm(): void {
    if (this.saving) return;
    this.mode = null;
    this.editing = null;
    this.formError = '';
  }

  private open(mode: FormMode, user: ManagedUser | null): void {
    if (this.saving) return;
    this.mode = mode;
    this.editing = user;
    this.formError = '';
    this.form = {
      email: user?.email ?? '',
      fullName: user?.fullName ?? '',
      role: user?.role ?? '',
      station: user?.station ?? '',
      password: '',
      confirm: '',
    };
  }

  save(): void {
    if (this.saving || !this.mode) return;
    const f = this.form;
    if (this.mode !== 'edit' && (f.password.length < 8 || f.password !== f.confirm)) {
      this.formError =
        f.password !== f.confirm ? 'The passwords do not match.' : 'Use a password of at least 8 characters.';
      return;
    }
    if (this.mode !== 'password' && (!f.fullName.trim() || !f.role || (this.mode === 'create' && !f.email.trim()))) {
      this.formError = 'Complete all required fields.';
      return;
    }

    let request: Observable<ManagedUser>;
    let message: string;
    if (this.mode === 'create') {
      request = this.api.create({
        email: f.email.trim(),
        fullName: f.fullName.trim(),
        role: f.role as UserRole,
        password: f.password,
        station: f.station.trim() || null,
      });
      message = 'User account created.';
    } else if (this.mode === 'edit' && this.editing) {
      request = this.api.update(this.editing.id, {
        fullName: f.fullName.trim(),
        role: f.role as UserRole,
        station: f.station.trim(),
      });
      message = 'User account updated.';
    } else if (this.editing) {
      request = this.api.resetPassword(this.editing.id, f.password);
      message = `Password reset for ${this.editing.fullName}.`;
    } else {
      return;
    }

    this.saving = true;
    this.formError = '';
    request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (user) => {
        this.upsert(user);
        this.saving = false;
        this.closeForm();
        this.notices.success(message);
        this.changeDetector.markForCheck();
      },
      error: (error) => {
        this.saving = false;
        this.formError = apiError(error);
        this.changeDetector.markForCheck();
      },
    });
  }

  toggleActive(user: ManagedUser): void {
    if (this.saving || user.id === this.currentUserId) return;
    this.saving = true;
    this.api
      .setActive(user.id, !user.isActive)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => {
          this.upsert(updated);
          this.saving = false;
          this.notices.success(`${updated.fullName} ${updated.isActive ? 'reactivated' : 'deactivated'}.`);
          this.changeDetector.markForCheck();
        },
        error: (error) => {
          this.saving = false;
          this.notices.error(apiError(error));
          this.changeDetector.markForCheck();
        },
      });
  }

  private upsert(user: ManagedUser): void {
    this.users = this.users.some((item) => item.id === user.id)
      ? this.users.map((item) => (item.id === user.id ? user : item))
      : [user, ...this.users];
  }
}
