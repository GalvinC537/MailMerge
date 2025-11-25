import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface AiRewriteResponse {
  rewrittenText: string;
}

@Injectable({ providedIn: 'root' })
export class AiRewriteService {
  constructor(private http: HttpClient) {}

  rewrite(originalText: string, tone: string): Observable<AiRewriteResponse> {
    return this.http.post<AiRewriteResponse>('/api/ai/rewrite', {
      originalText,
      tone,
    });
  }
}
