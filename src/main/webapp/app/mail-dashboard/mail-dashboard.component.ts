import { Component, OnInit, inject, signal } from '@angular/core';
import { Router, ActivatedRoute, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import * as XLSX from 'xlsx';
import { HttpClient } from '@angular/common/http';

import SharedModule from 'app/shared/shared.module';
import { ProjectService, Project } from 'app/project/project.service';
import { AccountService } from 'app/core/auth/account.service';
import { LoginService } from 'app/login/login.service';
import { Account } from 'app/core/auth/account.model';
import { DomSanitizer } from '@angular/platform-browser';
import { AttachmentService } from 'app/project/attachment.service';
import { forkJoin, of, switchMap, tap } from 'rxjs';

@Component({
  standalone: true,
  selector: 'jhi-mail-dashboard',
  templateUrl: './mail-dashboard.component.html',
  styleUrls: ['./mail-dashboard.component.scss'],
  imports: [SharedModule, RouterModule, FormsModule],
})
export class MailDashboardComponent implements OnInit {
  account = signal<Account | null>(null);
  projectId: number | null = null;
  project: Project | null = null;

  projectName = '';
  mergeSubjectTemplate = '';
  mergeBodyTemplate = '';
  mergeFile: File | null = null;
  mergeFileName: string | null = null;

  spreadsheetBase64: string | null = null;
  spreadsheetFileContentType: string | null = null;

  toField = '';
  ccField = '';
  bccField = '';

  attachments: { id?: number; name: string; size: number; fileContentType: string; base64: string }[] = [];
  deletedAttachmentIds: number[] = [];

  mergeSending = signal(false);
  mergeOk = signal(false);
  mergeErr = signal(false);
  saving = false;
  saveSuccess = false;
  sendSuccess = false;
  attachmentsLoading = false;

  sendingProgress = 0;
  sendingTotal = 0;
  sendingInProgress = false;
  progressLogs: string[] = [];
  sendingFinished = false;

  spreadsheetHeaders: string[] = [];
  previewEmails: {
    to: string;
    cc: string;
    bcc: string;
    subject: string;
    body: string;
    attachments: { name: string; size: number; fileContentType: string; base64: string }[];
  }[] = [];
  previewVisible = true;
  howToVisible = false;

  private readonly projectService = inject(ProjectService);
  private readonly accountService = inject(AccountService);
  private readonly loginService = inject(LoginService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly http = inject(HttpClient);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly attachmentService = inject(AttachmentService);

  ngOnInit(): void {
    this.accountService.identity().subscribe(account => this.account.set(account));
    this.listenToMailProgress();

    this.route.params.subscribe(params => {
      const idParam = params['id'];
      if (idParam) {
        this.projectId = Number(idParam);
        this.loadProject(this.projectId);
      }
    });
  }

  goBack(): void {
    void this.router.navigate(['/project']);
  }

  login(): void {
    this.loginService.login();
  }

  onDragStart(event: DragEvent, header: string): void {
    event.dataTransfer?.setData('text/plain', `{{${header}}}`);
  }
  allowDrop(event: DragEvent): void {
    event.preventDefault();
  }
  onDrop(event: DragEvent, field: 'to' | 'cc' | 'bcc' | 'subject' | 'body'): void {
    event.preventDefault();
    const text = event.dataTransfer?.getData('text/plain') ?? '';
    const elementIdMap = {
      to: 'toField',
      cc: 'ccField',
      bcc: 'bccField',
      subject: 'mergeSubject',
      body: 'mergeBody',
    };
    const el = document.getElementById(elementIdMap[field]) as HTMLInputElement | HTMLTextAreaElement | null;
    if (!el) return;
    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? 0;
    const value = el.value;
    el.value = value.slice(0, start) + text + value.slice(end);

    switch (field) {
      case 'to':
        this.toField = el.value;
        break;
      case 'cc':
        this.ccField = el.value;
        break;
      case 'bcc':
        this.bccField = el.value;
        break;
      case 'subject':
        this.mergeSubjectTemplate = el.value;
        break;
      case 'body':
        this.mergeBodyTemplate = el.value;
        break;
    }

    this.previewMerge();
  }

  onMergeFileChange(event: Event): void {
    this.removeSpreadsheet();
    const input = event.target as HTMLInputElement | null;
    this.mergeFile = input?.files && input.files.length > 0 ? input.files[0] : null;
    if (!this.mergeFile) return;

    this.mergeFileName = this.mergeFile.name;
    this.spreadsheetFileContentType = this.mergeFile.type || 'application/octet-stream';

    const reader = new FileReader();
    reader.onload = e => {
      const result = (e.target as FileReader).result;
      if (!result) return;

      const data = new Uint8Array(result as ArrayBuffer);
      const workbook = XLSX.read(data, { type: 'array' });
      const sheet = workbook.SheetNames[0];
      const sheetData = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheet], { header: 1 });
      if (Array.isArray(sheetData) && sheetData.length > 0) {
        this.spreadsheetHeaders = (sheetData[0] as unknown as string[]).filter(h => !!h && h.trim() !== '');
      }
      this.previewMerge();
    };
    reader.readAsArrayBuffer(this.mergeFile);

    const dataUrlReader = new FileReader();
    dataUrlReader.onload = e => {
      const dataUrl = (e.target as FileReader).result as string;
      this.spreadsheetBase64 = dataUrl.split(',')[1] ?? '';
    };
    dataUrlReader.readAsDataURL(this.mergeFile);
  }

  removeSpreadsheet(): void {
    this.mergeFile = null;
    this.spreadsheetBase64 = null;
    this.spreadsheetFileContentType = null;
    this.spreadsheetHeaders = [];
    this.previewEmails = [];
  }

  onAttachmentsChange(event: Event): void {
    const input = event.target as HTMLInputElement | null;
    if (!input?.files || input.files.length === 0) return;

    Array.from(input.files).forEach(file => {
      const fr = new FileReader();
      fr.onload = e => {
        const dataUrl = (e.target as FileReader).result as string;
        const base64 = dataUrl.split(',')[1] ?? '';
        this.attachments.push({
          name: file.name,
          size: file.size,
          fileContentType: file.type || 'application/octet-stream',
          base64,
        });
      };
      fr.readAsDataURL(file);
    });
  }

  removeAttachment(index: number): void {
    const removed = this.attachments.splice(index, 1)[0];
    if (removed.id) {
      this.deletedAttachmentIds.push(removed.id);
    }
  }

  loadProject(id: number): void {
    this.projectService.find(id).subscribe({
      next: p => {
        this.project = p;
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        this.projectName = p.name ?? '';
        this.mergeSubjectTemplate = p.header ?? '';
        this.mergeBodyTemplate = p.content ?? '';
        this.toField = (p as any).toField ?? '';
        this.ccField = (p as any).ccField ?? '';
        this.bccField = (p as any).bccField ?? '';

        if (p.spreadsheetLink) {
          this.spreadsheetBase64 = p.spreadsheetLink;
          this.spreadsheetFileContentType = (p as any).spreadsheetFileContentType ?? 'application/octet-stream';
          const byteCharacters = atob(p.spreadsheetLink);
          const byteNumbers = new Array(byteCharacters.length);
          for (let i = 0; i < byteCharacters.length; i++) byteNumbers[i] = byteCharacters.charCodeAt(i);
          const byteArray = new Uint8Array(byteNumbers);
          this.mergeFile = new File([byteArray], 'uploaded_spreadsheet.xlsx', {
            type: this.spreadsheetFileContentType!,
          });
          this.parseSpreadsheetForHeaders(this.mergeFile);
        }

        this.attachmentsLoading = true;
        this.attachmentService.findByProject(id).subscribe({
          next: attachments => {
            this.attachments = attachments.map(a => ({
              id: a.id,
              name: a.name,
              size: a.size,
              fileContentType: a.fileContentType,
              base64: a.file,
            }));
            this.attachmentsLoading = false;
            this.previewMerge();
          },
          error: err => {
            console.error('❌ Failed to load attachments', err);
            this.attachmentsLoading = false;
          },
        });
        this.attachmentsLoading = false;
        this.previewMerge();
      },
      error: err => console.error('❌ Failed to load project', err),
    });
  }

  /** Manual save (used by Save button) **/
  saveProject(): void {
    if (!this.projectId) return;
    this.saving = true;

    const updated: Project = {
      ...(this.project ?? {}),
      id: this.projectId,
      name: this.projectName,
      header: this.mergeSubjectTemplate,
      content: this.mergeBodyTemplate,
      status: 'PENDING',
      toField: this.toField,
      ccField: this.ccField,
      bccField: this.bccField,
      spreadsheetLink: this.spreadsheetBase64 ?? undefined,
      spreadsheetFileContentType: this.spreadsheetFileContentType ?? undefined,
    };

    const newAttachmentDTOs = this.attachments
      .filter(a => !a.id)
      .map(a => ({
        file: a.base64,
        fileContentType: a.fileContentType,
        name: a.name,
        size: a.size,
      }));

    this.projectService
      .update(updated)
      .pipe(
        switchMap(() => {
          if (this.deletedAttachmentIds.length > 0) {
            const deletes = this.deletedAttachmentIds.map(id => this.attachmentService.deleteById(id));
            return forkJoin(deletes);
          }
          return of(null);
        }),
        switchMap(() => {
          if (newAttachmentDTOs.length > 0) {
            return this.attachmentService.saveForProject(this.projectId!, newAttachmentDTOs);
          }
          return of(null);
        }),
      )
      .subscribe({
        next: () => {
          this.saving = false;
          this.saveSuccess = true;
          this.deletedAttachmentIds = [];
          setTimeout(() => (this.saveSuccess = false), 3000);
        },
        error: err => {
          console.error('❌ Save failed', err);
          this.saving = false;
        },
      });
  }

  /** Helper used internally to wait for save before sending **/
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  private saveProjectAndReturnObservable() {
    if (!this.projectId) return of(void 0);

    const updated: Project = {
      ...(this.project ?? {}),
      id: this.projectId,
      name: this.projectName,
      header: this.mergeSubjectTemplate,
      content: this.mergeBodyTemplate,
      status: 'PENDING',
      toField: this.toField,
      ccField: this.ccField,
      bccField: this.bccField,
      spreadsheetLink: this.spreadsheetBase64 ?? undefined,
      spreadsheetFileContentType: this.spreadsheetFileContentType ?? undefined,
    };

    const newAttachmentDTOs = this.attachments
      .filter(a => !a.id)
      .map(a => ({
        file: a.base64,
        fileContentType: a.fileContentType,
        name: a.name,
        size: a.size,
      }));

    return this.projectService.update(updated).pipe(
      switchMap(() => {
        if (this.deletedAttachmentIds.length > 0) {
          const deletes = this.deletedAttachmentIds.map(id => this.attachmentService.deleteById(id));
          return forkJoin(deletes);
        }
        return of(null);
      }),
      switchMap(() => {
        if (newAttachmentDTOs.length > 0) {
          return this.attachmentService.saveForProject(this.projectId!, newAttachmentDTOs);
        }
        return of(null);
      }),
      tap(() => {
        this.deletedAttachmentIds = [];
      }),
      switchMap(() => of(void 0)),
    );
  }

  /** Save first, then send **/
  // eslint-disable-next-line @typescript-eslint/member-ordering
  sendProject(): void {
    if (!this.projectId || !this.mergeFile) {
      this.mergeErr.set(true);
      return;
    }
    if (this.attachmentsLoading) {
      alert('Attachments are still loading, please wait a moment.');
      return;
    }

    this.mergeSending.set(true);
    this.mergeErr.set(false);

    this.sendingProgress = 0;
    this.sendingTotal = 0;
    this.sendingInProgress = true;
    this.progressLogs = [];
    this.sendingFinished = false;

    this.saveProjectAndReturnObservable().subscribe({
      next: () => {
        const payload = {
          subjectTemplate: this.mergeSubjectTemplate,
          bodyTemplate: this.mergeBodyTemplate,
          toTemplate: this.toField,
          ccTemplate: this.ccField,
          bccTemplate: this.bccField,
          spreadsheet: this.spreadsheetBase64,
          spreadsheetFileContentType: this.spreadsheetFileContentType,
          attachments: this.attachments.map(a => ({
            name: a.name,
            fileContentType: a.fileContentType,
            file: a.base64,
          })),
        };

        this.projectService.sendMailMergeWithMeta(payload).subscribe({
          next: () => {
            this.mergeSending.set(false);
            this.sendSuccess = true;
            setTimeout(() => (this.sendSuccess = false), 3000);
          },
          error: err => {
            console.error('❌ Send failed', err);
            this.mergeSending.set(false);
            this.mergeErr.set(true);
          },
        });
      },
      error: err => {
        console.error('❌ Save-before-send failed', err);
        this.mergeSending.set(false);
        this.mergeErr.set(true);
      },
    });
  }

  // eslint-disable-next-line @typescript-eslint/member-ordering
  previewMerge(): void {
    if (!this.mergeFile) {
      this.previewEmails = [];
      return;
    }

    const reader = new FileReader();
    reader.onload = e => {
      const result = (e.target as FileReader).result;
      if (!result) return;

      const data = new Uint8Array(result as ArrayBuffer);
      const workbook = XLSX.read(data, { type: 'array' });
      const sheet = workbook.SheetNames[0];
      const rows = XLSX.utils.sheet_to_json<Record<string, string>>(workbook.Sheets[sheet]);

      this.previewEmails = rows.map(row => {
        // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
        const replaceTokens = (template: string) => {
          // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
          let out = template ?? '';
          Object.entries(row).forEach(([key, value]) => {
            const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
            out = out.replace(regex, String(value ?? ''));
          });
          return out;
        };

        return {
          to: replaceTokens(this.toField) || '(missing To)',
          cc: replaceTokens(this.ccField),
          bcc: replaceTokens(this.bccField),
          subject: replaceTokens(this.mergeSubjectTemplate),
          body: replaceTokens(this.mergeBodyTemplate),
          attachments: this.attachments,
        };
      });
    };

    reader.readAsArrayBuffer(this.mergeFile);
  }

  // eslint-disable-next-line @typescript-eslint/member-ordering
  togglePreview(): void {
    if (this.previewVisible) this.previewMerge();
    else {
      this.previewVisible = true;
      this.howToVisible = false;
      this.previewMerge();
    }
  }

  // eslint-disable-next-line @typescript-eslint/member-ordering
  toggleHowTo(): void {
    this.howToVisible = !this.howToVisible;
    if (this.howToVisible) this.previewVisible = false;
  }

  private parseSpreadsheetForHeaders(file: File): void {
    const reader = new FileReader();
    reader.onload = e => {
      const result = (e.target as FileReader).result;
      if (!result) return;

      const data = new Uint8Array(result as ArrayBuffer);
      const workbook = XLSX.read(data, { type: 'array' });
      const sheet = workbook.SheetNames[0];
      const sheetData = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheet], { header: 1 });

      if (Array.isArray(sheetData) && sheetData.length > 0) {
        this.spreadsheetHeaders = (sheetData[0] as unknown as string[]).filter(h => !!h && h.trim() !== '');
      }

      this.previewMerge();
    };
    reader.readAsArrayBuffer(file);
  }

  // eslint-disable-next-line @typescript-eslint/member-ordering
  downloadSpreadsheet(event: Event): void {
    event.preventDefault();
    if (!this.spreadsheetBase64 || !this.mergeFile) return;

    const blob = this.base64ToBlob(this.spreadsheetBase64, this.spreadsheetFileContentType ?? 'application/octet-stream');
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = this.mergeFile.name;
    a.click();
    window.URL.revokeObjectURL(url);
  }

  private base64ToBlob(base64: string, contentType: string): Blob {
    const byteCharacters = atob(base64);
    const byteArrays = [];
    for (let offset = 0; offset < byteCharacters.length; offset += 512) {
      const slice = byteCharacters.slice(offset, offset + 512);
      const byteNumbers = new Array(slice.length);
      for (let i = 0; i < slice.length; i++) byteNumbers[i] = slice.charCodeAt(i);
      byteArrays.push(new Uint8Array(byteNumbers));
    }
    return new Blob(byteArrays, { type: contentType });
  }

  // eslint-disable-next-line @typescript-eslint/member-ordering
  downloadAttachment(a: { name: string; base64: string; fileContentType: string; size: number }, event: Event): void {
    event.preventDefault();
    const blob = this.base64ToBlob(a.base64, a.fileContentType || 'application/octet-stream');
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = a.name;
    anchor.click();
    window.URL.revokeObjectURL(url);
  }

  // eslint-disable-next-line @typescript-eslint/member-ordering
  listenToMailProgress(): void {
    const eventSource = new EventSource('/api/mail-progress/stream');

    // eslint-disable-next-line @typescript-eslint/no-empty-function
    eventSource.onopen = () => {};

    // Listen for our named event "mail-progress"
    eventSource.addEventListener('mail-progress', (event: MessageEvent) => {
      const data = JSON.parse(event.data);

      // Update counts if present
      if (typeof data.totalCount === 'number' && data.totalCount >= 0) {
        this.sendingTotal = data.totalCount;
      }
      if (typeof data.sentCount === 'number' && data.sentCount >= 0) {
        this.sendingProgress = data.sentCount;
      }

      this.sendingInProgress = this.sendingTotal > 0 && this.sendingProgress < this.sendingTotal;

      // Log lines for the list
      if (data.email && data.message) {
        this.progressLogs.push(`${data.email} — ${data.message}`);
      }

      // When finished
      // Detect completion
      if (this.sendingTotal > 0 && this.sendingProgress >= this.sendingTotal) {
        this.sendingInProgress = false;
        this.sendingFinished = true;

        // Hide after 5 seconds
        setTimeout(() => {
          this.sendingFinished = false;
        }, 5000);
      }
    });

    eventSource.onerror = err => {
      console.error('SSE error', err);
    };
  }
}
