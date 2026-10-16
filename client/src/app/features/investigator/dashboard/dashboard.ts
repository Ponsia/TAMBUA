import { DatePipe } from '@angular/common';
import { DashboardPage } from '../../../core/pages/dashboard-page';
import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

import {
  LucideFolderOpen,
  LucideCircleCheck,
  LucideArchive,
  LucideActivity,
  LucideCctv,
  LucideSearch,
  LucideArrowRight,
  LucideUserSearch,
  LucideCamera,
  LucideClock3,
} from '@lucide/angular';

@Component({
  selector: 'app-dashboard',
  standalone: true,

  imports: [
    DatePipe,
    RouterLink,
    LucideFolderOpen,
    LucideCircleCheck,
    LucideArchive,
    LucideActivity,
    LucideCctv,
    LucideSearch,
    LucideArrowRight,
    LucideUserSearch,
    LucideCamera,
    LucideClock3,
  ],

  templateUrl: './dashboard.html',
  styleUrls: ['./dashboard.css', '../../../shared/styles/dashboard.css'],
})
export class DashboardComponent extends DashboardPage {}
