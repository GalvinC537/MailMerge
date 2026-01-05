import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class SignatureService {
  constructor(private http: HttpClient) {}

  get(): Observable<string> {
    return this.http.get('/api/account/signature', { responseType: 'text' });
  }

  update(signature: string): Observable<void> {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition,@typescript-eslint/no-invalid-void-type
    return this.http.put<void>('/api/account/signature', signature ?? '', {
      headers: { 'Content-Type': 'text/plain' },
    });
  }
}
