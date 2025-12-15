// one-drive.service.ts
import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface OneDriveFileDto {
  id: string;
  driveId: string;
  name: string;
  webUrl: string;
}

@Injectable({ providedIn: 'root' })
export class OneDriveService {
  constructor(private http: HttpClient) {}

  listSpreadsheets(): Observable<OneDriveFileDto[]> {
    return this.http.get<OneDriveFileDto[]>('/api/onedrive/spreadsheets');
  }

  getSpreadsheetContent(itemId: string, driveId?: string): Observable<ArrayBuffer> {
    const params = new HttpParams().set('itemId', itemId).set('driveId', driveId ?? '');

    return this.http.get<ArrayBuffer>('/api/onedrive/spreadsheets/content', {
      params,
      // Cast is only for TypeScript’s benefit; runtime still uses 'arraybuffer'
      responseType: 'arraybuffer' as 'json',
    });
  }
}
