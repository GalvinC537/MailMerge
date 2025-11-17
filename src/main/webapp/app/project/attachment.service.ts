import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface Attachment {
  id?: number;
  name: string;
  size: number;
  fileContentType: string;
  file: string; // base64
  projectId?: number;
}

@Injectable({ providedIn: 'root' })
export class AttachmentService {
  private resourceUrl = '/api/attachments';

  constructor(private http: HttpClient) {}

  /** Load all attachments for a given project */
  findByProject(projectId: number): Observable<Attachment[]> {
    return this.http.get<Attachment[]>(`${this.resourceUrl}/project/${projectId}`);
  }

  /** Save new attachments for a project (overwrite existing) */
  saveForProject(projectId: number, attachments: Attachment[]): Observable<void> {
    // eslint-disable-next-line @typescript-eslint/no-invalid-void-type
    return this.http.post<void>(`${this.resourceUrl}/project/${projectId}`, attachments);
  }

  /** Delete all attachments linked to a project */
  deleteForProject(projectId: number): Observable<void> {
    // eslint-disable-next-line @typescript-eslint/no-invalid-void-type
    return this.http.delete<void>(`${this.resourceUrl}/project/${projectId}`);
  }

  /** Delete a specific attachment by ID */
  deleteById(id: number): Observable<void> {
    // eslint-disable-next-line @typescript-eslint/no-invalid-void-type
    return this.http.delete<void>(`${this.resourceUrl}/${id}`);
  }
}
