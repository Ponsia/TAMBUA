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
  LucideCircleCheck,
  LucideTriangleAlert,
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
    LucideCircleCheck,
    LucideTriangleAlert,
    LucideRefreshCw,
  ],

  templateUrl: './face-search.html',
  styleUrl: './face-search.css',
})
export class FaceSearchComponent extends PhotoSearchPage {}
