import { FormsModule } from '@angular/forms';
import { PhotoSearchPage } from '../../../core/pages/photo-search-page';
import { Component } from '@angular/core';

import {
  LucideSearch,
  LucideUpload,
  LucideImage,
  LucideX,
  LucideScanFace,
  LucideInfo,
  LucideShieldCheck,
  LucideCircleX,
  LucideUserSearch,
  LucideRefreshCw,
} from '@lucide/angular';

@Component({
  selector: 'app-face-search',
  standalone: true,

  imports: [
    FormsModule,
    LucideSearch,
    LucideUpload,
    LucideImage,
    LucideX,
    LucideScanFace,
    LucideInfo,
    LucideShieldCheck,
    LucideCircleX,
    LucideUserSearch,
    LucideRefreshCw,
  ],

  templateUrl: './face-search.html',
  styleUrls: ['./face-search.css', './face-search-responsive.css'],
})
export class FaceSearchComponent extends PhotoSearchPage {}
