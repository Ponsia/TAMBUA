import { DatePipe } from '@angular/common';
import { DashboardPage } from '../../../core/pages/dashboard-page';
import { Component } from '@angular/core';

import {
  LucideFolderOpen,
  LucideUserCheck,
  LucideCircleCheck,
  LucideActivity,
  LucideClock,
  LucideShieldCheck,
  LucideShieldX,
  LucideMapPin,
} from '@lucide/angular';

@Component({
  selector: 'app-dashboard',

  standalone: true,

  imports: [
    DatePipe,
    LucideFolderOpen,
    LucideUserCheck,
    LucideCircleCheck,
    LucideActivity,
    LucideClock,
    LucideShieldCheck,
    LucideShieldX,
    LucideMapPin,
  ],

  templateUrl: './dashboard.html',

  styleUrls: ['./dashboard.css', '../../../shared/styles/dashboard.css'],
})
export class DashboardComponent extends DashboardPage {}
