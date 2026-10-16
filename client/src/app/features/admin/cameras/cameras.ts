import { DatePipe } from '@angular/common';

import { RecordItem } from '../../../core/models/records.model';
import { RecordsPage } from '../../../core/pages/records-page';
import { FormsModule } from '@angular/forms';
import { Component } from '@angular/core';

import {
  LucideCctv,
  LucideCircleCheck,
  LucideWifiOff,
  LucideCircleOff,
  LucidePlus,
  LucideSearch,
  LucideSlidersHorizontal,
} from '@lucide/angular';

@Component({
  selector: 'app-cameras',
  standalone: true,

  imports: [
    DatePipe,
    FormsModule,
    LucideCctv,
    LucideCircleCheck,
    LucideWifiOff,
    LucideCircleOff,
    LucidePlus,
    LucideSearch,
    LucideSlidersHorizontal,
  ],

  templateUrl: './cameras.html',
  styleUrl: './cameras.css',
})
export class CamerasComponent extends RecordsPage {
  readonly resource = 'cameras' as const;
  readonly ipPattern = '(?:(?:25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])\\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])';

  override openForm(record?: RecordItem): void {
    if (this.saving) return;
    this.editingId = record?.id;
    this.form = {
      name: record?.name || '',
      location: record?.location || '',
      zone: record?.zone || '',
      connectionType: record?.connectionType || '',
      streamSource: record?.streamSource || '',
      ipAddress: record?.ipAddress || '',
      port: record?.port == null ? '' : String(record.port),
      status: record?.status || 'ACTIVE',
    };
    this.showCameraForm = true;
    this.errorMessage = this.canManage ? '' : 'Sign in as a system owner admin to save cameras.';
  }

  override saveRecord(): void {
    if (this.saving) return;
    if (!this.canManage) {
      this.errorMessage = 'Sign in as a system owner admin to save cameras.';
      return;
    }
    if (this.loading) {
      this.errorMessage = 'Please wait for cameras to finish loading, then save again.';
      return;
    }
    if (!['WIRED', 'WIRELESS'].includes(this.form['connectionType'])) {
      this.errorMessage = 'Select Wired or Wireless as the connection.';
      return;
    }
    if (!this.form['streamSource']?.trim()) {
      this.errorMessage = 'Enter the stream source the AI engine should read.';
      return;
    }
    const ip = this.form['ipAddress']?.trim() || '';
    if (ip && !new RegExp(`^${this.ipPattern}$`).test(ip)) {
      this.errorMessage = 'Enter a valid IPv4 address, for example 192.168.1.10.';
      return;
    }
    const portText = this.form['port']?.trim() || '';
    const port = Number(portText);
    if (portText && (!Number.isInteger(port) || port < 1 || port > 65535)) {
      this.errorMessage = 'Enter a whole-number port between 1 and 65535.';
      return;
    }
    super.saveRecord();
  }
}
