// This file is responsible for all the HTTP communication between the frontend and the backend related to "Projects"

import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface Project {
  id?: number;
  name: string;
  spreadsheetLink?: string | null;
  header?: string;
  content?: string;
  status?: 'PENDING' | 'SENT' | 'FAILED';
  toField?: string;
  ccField?: string;
  bccField?: string;
  spreadsheetFileContentType?: string | null;
  sentAt?: string;
  user?: any;
}

@Injectable({ providedIn: 'root' })
export class ProjectService {
  private resourceUrl = '/api/projects';

  constructor(private http: HttpClient) {}

  // This are all the CRUD methods used by the mail-dashboard and projects page

  // Create a new project (auto-linked to logged-in user in backend)
  create(project: Project): Observable<Project> {
    return this.http.post<Project>(this.resourceUrl, project);
  }

  // Update an existing project
  update(project: Project): Observable<Project> {
    return this.http.put<Project>(`${this.resourceUrl}/${project.id}`, project);
  }

  // Find a project by ID
  find(id: number): Observable<Project> {
    return this.http.get<Project>(`${this.resourceUrl}/${id}`);
  }

  // Get all projects for current user
  findMy(): Observable<Project[]> {
    return this.http.get<Project[]>(`${this.resourceUrl}/my`);
  }

  // Delete a project
  delete(id: number): Observable<void> {
    // eslint-disable-next-line @typescript-eslint/no-invalid-void-type
    return this.http.delete<void>(`${this.resourceUrl}/${id}`);
  }

  // Update project status (SENT, FAILED, etc.) - no longer used but kept just as backup
  updateStatus(id: number, status: 'PENDING' | 'SENT' | 'FAILED', sentAt?: string): Observable<Project> {
    const body = { status, sentAt };
    return this.http.patch<Project>(`${this.resourceUrl}/${id}`, body);
  }

  // Upload and send mail merge for a project - called from mail-dashboard.component.ts
  // This then calls the MailMergeResource.java file
  sendMailMerge(file: File, subjectTemplate: string, bodyTemplate: string): Observable<any> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('subjectTemplate', subjectTemplate);
    formData.append('bodyTemplate', bodyTemplate);
    return this.http.post('/api/mail-merge/send', formData);
  }

  // Enhanced version: sends full metadata (To, CC, BCC, attachments, spreadsheet)
  sendMailMergeWithMeta(payload: {
    subjectTemplate: string;
    bodyTemplate: string;
    toTemplate: string;
    ccTemplate: string;
    bccTemplate: string;
    spreadsheet: string | null;
    spreadsheetFileContentType: string | null;
    attachments: { name: string; fileContentType: string; file: string }[];
  }): Observable<any> {
    return this.http.post('/api/mail-merge/send-advanced', payload);
  }
}
