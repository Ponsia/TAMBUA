import { authGuard } from './core/guards/auth-guard';
//import { roleGuard } from './core/guards/role-guard';
//import { guestGuard } from './core/guards/guest-guard';
import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: 'login',
    //canActivate: [guestGuard],

    loadComponent: () => import('./features/auth/login/login').then((m) => m.LoginComponent),
  },

  {
    path: 'admin',
    //canActivate: [authGuard, roleGuard('SYSTEM_OWNER_ADMIN')],
    //canActivateChild: [authGuard, roleGuard('SYSTEM_OWNER_ADMIN')],

    loadComponent: () =>
      import('./shared/layouts/admin-layout/admin-layout').then((m) => m.AdminLayout),

    children: [
      {
        path: '',

        loadComponent: () =>
          import('./features/admin/dashboard/dashboard').then((m) => m.DashboardComponent),
      },

      {
        path: 'missing-persons',

        loadComponent: () =>
          import('./features/admin/missing-persons/missing-persons').then(
            (m) => m.MissingPersonsComponent,
          ),
      },

      {
        path: 'watchlist',

        loadComponent: () =>
          import('./features/admin/watchlist/watchlist').then((m) => m.WatchlistComponent),
      },

      {
        path: 'users',

        loadComponent: () => import('./features/admin/users/users').then((m) => m.UsersComponent),
      },

      {
        path: 'alerts',

        loadComponent: () => import('./features/admin/alerts/alerts').then((m) => m.AlertsComponent),
      },

      {
        path: 'sightings',

        loadComponent: () =>
          import('./features/admin/sightings/sightings').then((m) => m.SightingsComponent),
      },

      {
        path: 'cameras',

        loadComponent: () => import('./features/admin/cameras/cameras').then((m) => m.CamerasComponent),
      },

      {
        path: 'reports',

        loadComponent: () => import('./features/admin/reports/reports').then((m) => m.ReportsComponent),
      },

      {
        path: 'audit-logs',

        loadComponent: () =>
          import('./features/admin/audit-logs/audit-logs/audit-logs').then((m) => m.AuditLogsComponent),
      },
    ],
  },

  {
    path: 'watchlist-manager',
    // canActivate: [authGuard, roleGuard('WATCHLIST_MANAGER')],
    //canActivateChild: [authGuard, roleGuard('WATCHLIST_MANAGER')],

    loadComponent: () =>
      import('./shared/layouts/watchlist-manager-layout/watchlist-manager-layout').then(
        (m) => m.WatchlistManagerLayout,
      ),

    children: [
      {
        path: '',

        loadComponent: () =>
          import('./features/watchlist-manager/dashboard/dashboard').then(
            (m) => m.DashboardComponent,
          ),
      },

      {
        path: 'missing-persons',

        loadComponent: () =>
          import('./features/watchlist-manager/missing-persons/missing-persons').then(
            (m) => m.MissingPersonsComponent,
          ),
      },

      {
        path: 'watchlist',

        loadComponent: () =>
          import('./features/watchlist-manager/watchlist/watchlist').then(
            (m) => m.WatchlistComponent,
          ),
      },

      {
        path: 'alerts',

        loadComponent: () =>
          import('./features/watchlist-manager/alerts/alerts').then((m) => m.AlertsComponent),
      },

      {
        path: 'sightings',

        loadComponent: () =>
          import('./features/watchlist-manager/sightings/sightings').then(
            (m) => m.SightingsComponent,
          ),
      },

      {
        path: 'timeline',

        loadComponent: () =>
          import('./features/watchlist-manager/movement-timeline/movement-timeline').then(
            (m) => m.MovementTimelineComponent,
          ),
      },

      {
        path: 'face-search',

        loadComponent: () =>
          import('./features/watchlist-manager/face-search/face-search').then(
            (m) => m.FaceSearchComponent,
          ),
      },
    ],
  },

  {
    path: 'investigator',
    //canActivate: [authGuard, roleGuard('INVESTIGATOR')],

    //canActivateChild: [authGuard, roleGuard('INVESTIGATOR')],

    loadComponent: () =>
      import('./shared/layouts/investigator-layout/investigator-layout').then(
        (m) => m.InvestigatorLayout,
      ),

    children: [
      {
        path: 'sightings',
        data: { sightingsOnly: true },
        loadComponent: () =>
          import('./features/investigator/movement-timeline/movement-timeline').then(
            (m) => m.MovementTimelineComponent,
          ),
      },
      {
        path: '',

        loadComponent: () =>
          import('./features/investigator/dashboard/dashboard').then((m) => m.DashboardComponent),
      },

      {
        path: 'missing-persons',

        loadComponent: () =>
          import('./features/investigator/missing-persons/missing-persons').then(
            (m) => m.MissingPersonsComponent,
          ),
      },

      {
        path: 'watchlist',

        loadComponent: () =>
          import('./features/investigator/watchlist/watchlist').then((m) => m.WatchlistComponent),
      },

      {
        path: 'camera-preview',

        loadComponent: () =>
          import('./features/investigator/camera-preview/camera-preview').then(
            (m) => m.CameraPreviewComponent,
          ),
      },

      {
        path: 'timeline',

        loadComponent: () =>
          import('./features/investigator/movement-timeline/movement-timeline').then(
            (m) => m.MovementTimelineComponent,
          ),
      },

      {
        path: 'face-search',

        loadComponent: () =>
          import('./features/investigator/face-search/face-search').then(
            (m) => m.FaceSearchComponent,
          ),
      },
    ],
  },

  {
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('./features/landing/landing').then((m) => m.LandingComponent),
  },

  {
    path: '**',
    redirectTo: '',
  },
];
