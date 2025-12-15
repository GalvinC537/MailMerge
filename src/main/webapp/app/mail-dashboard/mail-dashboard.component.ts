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
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { OneDriveService, OneDriveFileDto } from '../services/one-drive.service';
import { AttachmentService } from 'app/project/attachment.service';
import { forkJoin, of, switchMap, tap } from 'rxjs';
import { AiRewriteService } from '../services/ai-rewrite.service';

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

  tokenColors: Record<string, string> = {};

  spreadsheetBase64: string | null = null;
  spreadsheetFileContentType: string | null = null;
  spreadsheetVisible = false;
  spreadsheetTable: string[][] = [];
  spreadsheetPreviewVisible = false;

  // rows as objects for token replacement
  spreadsheetRows: Record<string, string>[] = [];

  isRewriting = false;
  customTone = ''; // user-defined style/tone
  aiVisible = false;
  aiRewrittenText = '';
  aiSelectedTone: 'professional' | 'friendly' | 'custom' | null = null;
  aiRewrittenPreview: SafeHtml | null = null;

  toField = '';
  ccField = '';
  bccField = '';

  // in component
  spreadsheetSource: 'LOCAL' | 'ONEDRIVE' = 'LOCAL';
  oneDriveSpreadsheetName: string | null = null;
  oneDriveLoading = false;

  oneDriveFiles: OneDriveFileDto[] = [];
  oneDrivePickerVisible = false;
  oneDriveError: string | null = null;

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
    body: SafeHtml;
    attachments: { id?: number; name: string; size: number; fileContentType: string; base64: string }[];
  }[] = [];
  previewVisible = true;
  howToVisible = false;

  // used to temporarily skip renderTokens while we manually tweak DOM
  private skipTokenRender = false;

  private readonly projectService = inject(ProjectService);
  private readonly accountService = inject(AccountService);
  private readonly loginService = inject(LoginService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly http = inject(HttpClient);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly attachmentService = inject(AttachmentService);
  private readonly aiRewriteService = inject(AiRewriteService);
  private readonly oneDriveService = inject(OneDriveService);

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

    // Backspace behaviour for tokens
    document.addEventListener('keydown', e => {
      if (e.key !== 'Backspace') return;

      const sel = window.getSelection();
      if (!sel?.anchorNode) return;

      const anchor = sel.anchorNode;
      const container = anchor instanceof Element ? anchor.closest('.merge-editor') : anchor.parentElement?.closest('.merge-editor');

      if (!container) return;

      const plain = (container as HTMLElement).innerText.trim();
      if (plain === '') {
        e.preventDefault();
        (container as HTMLElement).innerHTML = '';
        return;
      }

      const token = anchor instanceof Element ? anchor.closest('.merge-token') : anchor.parentElement?.closest('.merge-token');

      if (!token) return;

      e.preventDefault();
      token.remove();

      const fieldContainer = token.closest('[id]');
      if (!fieldContainer) return;

      const id = (fieldContainer as HTMLElement).id;

      let field: 'body' | 'subject' | 'to' | 'cc' | 'bcc' | null = null;
      if (id === 'mergeBody') field = 'body';
      else if (id === 'mergeSubject') field = 'subject';
      else if (id === 'toField') field = 'to';
      else if (id === 'ccField') field = 'cc';
      else if (id === 'bccField') field = 'bcc';

      if (field) {
        this.onEditorInput(field);
        setTimeout(() => this.renderTokens(field));
      }
    });

    // Avoid caret going inside tokens
    document.addEventListener('mouseup', () => {
      const sel = window.getSelection();
      if (!sel?.anchorNode) return;

      const token = sel.anchorNode.parentElement?.closest('.merge-token');
      if (token && sel.anchorNode === token.firstChild) {
        const range = document.createRange();
        range.setStartAfter(token);
        range.collapse(true);

        sel.removeAllRanges();
        sel.addRange(range);
      }
    });
  }

  goBack(): void {
    void this.router.navigate(['/project']);
  }

  login(): void {
    this.loginService.login();
  }

  // -----------------------
  // Spreadsheet + headers
  // -----------------------

  onDragStart(event: DragEvent, header: string): void {
    event.dataTransfer?.setData('text/plain', `{{${header}}}`);
  }

  allowDrop(event: DragEvent): void {
    event.preventDefault();
  }

  onDrop(event: DragEvent, field: 'to' | 'cc' | 'bcc' | 'subject' | 'body'): void {
    event.preventDefault();
    const text = event.dataTransfer?.getData('text/plain') ?? '';
    const el = document.getElementById(this.getElementId(field));
    if (!el) return;

    el.focus();

    const sel = window.getSelection();
    if (!sel?.rangeCount) return;

    const range = sel.getRangeAt(0);
    range.deleteContents();

    // Insert token text as plain text (e.g. {{name}})
    range.insertNode(document.createTextNode(text));

    // Add a space after it so the caret has somewhere to go
    const space = document.createTextNode(' ');
    range.insertNode(space);

    range.setStartAfter(space);
    range.collapse(true);

    sel.removeAllRanges();
    sel.addRange(range);

    this.onEditorInput(field);
    setTimeout(() => this.renderTokens(field));
  }

  onMergeFileChange(event: Event): void {
    // make sure we're in LOCAL mode when user uploads from device
    this.spreadsheetSource = 'LOCAL';
    this.oneDriveSpreadsheetName = null;

    const input = event.target as HTMLInputElement | null;
    const file = input?.files && input.files.length > 0 ? input.files[0] : null;
    if (!file) return;

    // clear previous spreadsheet state
    this.removeSpreadsheet();

    // shared loader used by LOCAL, OneDrive and loaded-from-DB
    this.loadSpreadsheetFile(file);
  }

  removeSpreadsheet(): void {
    this.mergeFile = null;
    this.spreadsheetBase64 = null;
    this.mergeFileName = null;
    this.oneDriveSpreadsheetName = null;
    this.spreadsheetFileContentType = null;
    this.spreadsheetHeaders = [];
    this.spreadsheetTable = [];
    this.spreadsheetRows = [];
    this.previewEmails = [];
  }

  // -----------------------
  // Attachments
  // -----------------------

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

  // -----------------------
  // Load project
  // -----------------------

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
          for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
          }
          const byteArray = new Uint8Array(byteNumbers);

          const file = new File([byteArray], 'uploaded_spreadsheet.xlsx', {
            type: this.spreadsheetFileContentType!,
          });

          // reuse shared loader (same as Local + OneDrive)
          this.loadSpreadsheetFile(file);
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
            setTimeout(() => {
              ['body', 'subject', 'to', 'cc', 'bcc'].forEach(f => this.renderTokens(f as any));
            });
          },
          error: err => {
            console.error('❌ Failed to load attachments', err);
            this.attachmentsLoading = false;
          },
        });

        this.previewMerge();
      },
      error: err => console.error('❌ Failed to load project', err),
    });
  }

  // -----------------------
  // Save & send
  // -----------------------

  saveProject(): void {
    if (!this.projectId) return;
    this.saving = true;

    const hasSpreadsheet = !!this.spreadsheetBase64;

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
      // 👇 IMPORTANT: use null, not undefined, when cleared
      spreadsheetLink: hasSpreadsheet ? this.spreadsheetBase64 : null,
      spreadsheetFileContentType: hasSpreadsheet ? this.spreadsheetFileContentType : null,
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
          // Optionally refresh this.project:
          this.project = updated;
        },
        error: err => {
          console.error('❌ Save failed', err);
          this.saving = false;
        },
      });
  }

  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  private saveProjectAndReturnObservable() {
    if (!this.projectId) return of(void 0);

    const hasSpreadsheet = !!this.spreadsheetBase64;

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
      spreadsheetLink: hasSpreadsheet ? this.spreadsheetBase64 : null,
      spreadsheetFileContentType: hasSpreadsheet ? this.spreadsheetFileContentType : null,
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
        this.project = updated;
      }),
      switchMap(() => of(void 0)),
    );
  }

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
          bodyTemplate: this.convertMarkdownToHtml(this.mergeBodyTemplate),
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
            if (this.projectId) {
              const updatedProject: Project = {
                ...(this.project ?? {}),
                id: this.projectId,
                // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
                name: this.projectName ?? '',
                // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
                header: this.mergeSubjectTemplate ?? '',
                // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
                content: this.mergeBodyTemplate ?? '',
                // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
                toField: this.toField ?? '',
                // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
                ccField: this.ccField ?? '',
                // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
                bccField: this.bccField ?? '',
                spreadsheetLink: this.spreadsheetBase64 ?? null,
                spreadsheetFileContentType: this.spreadsheetFileContentType ?? null,
                status: 'SENT',
                sentAt: new Date().toISOString(),
              };

              this.projectService.update(updatedProject).subscribe();
            }
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

  // -----------------------
  // Preview
  // -----------------------

  // now uses parsed rows instead of rereading the file
  // eslint-disable-next-line @typescript-eslint/member-ordering
  previewMerge(): void {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (!this.spreadsheetRows || this.spreadsheetRows.length === 0) {
      this.previewEmails = [];
      return;
    }

    const rows = this.spreadsheetRows;

    const replaceTokens = (template: string, row: Record<string, string>): string => {
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      let out = template ?? '';
      Object.entries(row).forEach(([key, value]) => {
        // escape regex special chars in header names just in case
        const safeKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`{{\\s*${safeKey}\\s*}}`, 'g');
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        out = out.replace(regex, String(value ?? ''));
      });
      return out;
    };

    this.previewEmails = rows.map(row => {
      const subjectAfterTokens = replaceTokens(this.mergeSubjectTemplate, row);
      const toAfterTokens = replaceTokens(this.toField, row);
      const ccAfterTokens = replaceTokens(this.ccField, row);
      const bccAfterTokens = replaceTokens(this.bccField, row);

      const bodyTokenReplaced = replaceTokens(this.mergeBodyTemplate, row);
      const bodyHtml = this.convertMarkdownToHtml(bodyTokenReplaced);

      return {
        to: toAfterTokens || '(missing To)',
        cc: ccAfterTokens,
        bcc: bccAfterTokens,
        subject: subjectAfterTokens,
        body: this.sanitizer.bypassSecurityTrustHtml(bodyHtml),
        attachments: this.attachments,
      };
    });
  }

  // eslint-disable-next-line @typescript-eslint/member-ordering
  togglePreview(): void {
    if (this.previewVisible) {
      this.previewMerge();
    } else {
      this.previewVisible = true;
      this.howToVisible = false;
      this.spreadsheetPreviewVisible = false;
      this.aiVisible = false;
      this.previewMerge();
    }
  }

  // eslint-disable-next-line @typescript-eslint/member-ordering
  toggleHowTo(): void {
    this.howToVisible = !this.howToVisible;
    this.spreadsheetPreviewVisible = false;
    this.aiVisible = false;
    if (this.howToVisible) this.previewVisible = false;
  }

  // old helper kept for compatibility (now just delegates)
  private parseSpreadsheetForHeaders(file: File): void {
    this.loadSpreadsheetFile(file);
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

  // -----------------------
  // Mail progress (SSE)
  // -----------------------

  // eslint-disable-next-line @typescript-eslint/member-ordering
  listenToMailProgress(): void {
    const eventSource = new EventSource('/api/mail-progress/stream');

    // eslint-disable-next-line @typescript-eslint/no-empty-function
    eventSource.onopen = () => {};

    eventSource.addEventListener('mail-progress', (event: MessageEvent) => {
      const data = JSON.parse(event.data);

      if (typeof data.totalCount === 'number' && data.totalCount >= 0) {
        this.sendingTotal = data.totalCount;
      }
      if (typeof data.sentCount === 'number' && data.sentCount >= 0) {
        this.sendingProgress = data.sentCount;
      }

      this.sendingInProgress = this.sendingTotal > 0 && this.sendingProgress < this.sendingTotal;

      if (data.email && data.message) {
        this.progressLogs.push(`${data.email} — ${data.message}`);
      }

      if (this.sendingTotal > 0 && this.sendingProgress >= this.sendingTotal) {
        this.sendingInProgress = false;
        this.sendingFinished = true;

        setTimeout(() => {
          this.sendingFinished = false;
        }, 5000);
      }
    });

    eventSource.onerror = err => {
      console.error('SSE error', err);
    };
  }

  // -----------------------
  // AI rewrite
  // -----------------------

  // eslint-disable-next-line @typescript-eslint/member-ordering
  rewriteEmailBody(tone: 'professional' | 'friendly' | 'custom'): void {
    if (!this.mergeBodyTemplate) return;

    const selectedTone = tone === 'custom' ? this.customTone : tone;
    if (!selectedTone.trim()) return;

    this.isRewriting = true;
    this.aiSelectedTone = tone;
    this.aiRewrittenText = '';
    this.aiRewrittenPreview = null;

    this.aiRewriteService.rewrite(this.mergeBodyTemplate, selectedTone).subscribe({
      next: res => {
        // markdown with ** / _ / ~ and {{placeholders}}
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        this.aiRewrittenText = res.rewrittenText ?? '';

        // Convert markdown formatting to HTML for preview
        const md = this.aiRewrittenText || '';
        const html = this.convertMarkdownToHtml(md);
        this.aiRewrittenPreview = this.sanitizer.bypassSecurityTrustHtml(html);

        this.isRewriting = false;
      },
      error: () => {
        alert('AI rewriting failed. Try again.');
        this.isRewriting = false;
      },
    });
  }

  // eslint-disable-next-line @typescript-eslint/member-ordering
  applyRewrittenEmail(): void {
    if (!this.aiRewrittenText) return;

    this.mergeBodyTemplate = this.aiRewrittenText;

    setTimeout(() => this.renderTokens('body'));
    this.previewMerge();

    this.previewVisible = true;
    this.howToVisible = false;
    this.aiVisible = false;
  }

  // eslint-disable-next-line @typescript-eslint/member-ordering
  toggleAI(): void {
    this.aiVisible = !this.aiVisible;
    this.previewVisible = false;
    this.howToVisible = false;
    this.spreadsheetPreviewVisible = false;
  }

  // eslint-disable-next-line @typescript-eslint/member-ordering
  toggleSpreadsheetPreview(): void {
    this.spreadsheetPreviewVisible = !this.spreadsheetPreviewVisible;
    this.previewVisible = false;
    this.howToVisible = false;
    this.aiVisible = false;
  }

  // -----------------------
  // Editor input + tokens
  // -----------------------

  // eslint-disable-next-line @typescript-eslint/member-ordering
  onEditorInput(field: 'body' | 'subject' | 'to' | 'cc' | 'bcc'): void {
    const el = document.getElementById(this.getElementId(field));
    if (!el) return;

    let html = el.innerHTML;

    // Convert tokens back to {{name}}
    html = html.replace(/<span[^>]*class="merge-token"[^>]*data-field="([^"]+)"[^>]*>.*?<\/span>/gi, '{{$1}}');

    // Convert HTML → Markdown
    const markdown = this.htmlToMarkdown(html);

    if (field === 'body') this.mergeBodyTemplate = markdown;
    else if (field === 'subject') this.mergeSubjectTemplate = markdown;
    else if (field === 'to') this.toField = markdown;
    else if (field === 'cc') this.ccField = markdown;
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    else if (field === 'bcc') this.bccField = markdown;

    this.previewMerge();
  }

  // eslint-disable-next-line @typescript-eslint/member-ordering
  renderTokens(field: 'body' | 'subject' | 'to' | 'cc' | 'bcc'): void {
    if (this.skipTokenRender) return;

    const el = document.getElementById(this.getElementId(field));
    if (!el) return;

    let md = '';
    if (field === 'body') md = this.mergeBodyTemplate;
    else if (field === 'subject') md = this.mergeSubjectTemplate;
    else if (field === 'to') md = this.toField;
    else if (field === 'cc') md = this.ccField;
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    else if (field === 'bcc') md = this.bccField;

    if (!md) md = '';

    // use the same markdown → HTML converter as preview
    let html = this.convertMarkdownToHtml(md);

    // ---- Token rendering ----
    html = html.replace(
      /{{\s*([^}]+)\s*}}/g,
      (_, key) =>
        `<span class="merge-token"
        data-field="${key}"
        contenteditable="false"
        style="background:${this.getColorForField(key)}">${key}</span>`,
    );

    el.innerHTML = html;
  }

  // eslint-disable-next-line @typescript-eslint/member-ordering
  getColorForField(key: string): string {
    key = key.trim();
    if (!this.tokenColors[key]) {
      this.tokenColors[key] = `hsl(${Math.floor(Math.random() * 360)}, 70%, 50%)`;
    }
    return this.tokenColors[key];
  }

  private getElementId(field: 'body' | 'subject' | 'to' | 'cc' | 'bcc'): string {
    return field === 'body'
      ? 'mergeBody'
      : field === 'subject'
        ? 'mergeSubject'
        : field === 'to'
          ? 'toField'
          : field === 'cc'
            ? 'ccField'
            : 'bccField';
  }

  private placeCaretAtEnd(el: HTMLElement): void {
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);

    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  }

  // -----------------------
  // Formatting toolbar
  // -----------------------

  // eslint-disable-next-line @typescript-eslint/member-ordering
  formatFromToolbar(event: MouseEvent, type: 'bold' | 'italic' | 'underline'): void {
    event.preventDefault(); // keeps current selection
    event.stopPropagation();
    this.applyFormatting(type);
  }

  // eslint-disable-next-line @typescript-eslint/member-ordering
  applyFormatting(type: 'bold' | 'italic' | 'underline'): void {
    const bodyEl = document.getElementById('mergeBody');
    if (!bodyEl) return;

    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !sel.toString().trim()) {
      return; // nothing selected
    }

    // Use the browser's built-in toggling
    const command = type === 'bold' ? 'bold' : type === 'italic' ? 'italic' : 'underline';

    // eslint-disable-next-line @typescript-eslint/no-deprecated
    document.execCommand(command, false);

    // Convert token spans back to {{field}} before htmlToMarkdown
    let html = bodyEl.innerHTML;
    html = html.replace(/<span[^>]*class="merge-token"[^>]*data-field="([^"]+)"[^>]*>.*?<\/span>/gi, '{{$1}}');

    // Sync markdown template from updated HTML
    this.mergeBodyTemplate = this.htmlToMarkdown(html);

    // Re-render editor (from markdown) so tokens/formatting are normalized
    this.renderTokens('body');

    // Rebuild email previews with spreadsheet values
    this.previewMerge();
  }

  private htmlToMarkdown(html: string): string {
    return (
      html
        // BOLD: <strong> or <b>, any attributes, any case
        .replace(/<strong[^>]*>(.*?)<\/strong>/gi, '**$1**')
        .replace(/<b[^>]*>(.*?)<\/b>/gi, '**$1**')

        // ITALIC: <i> or <em>, any attributes, any case
        .replace(/<i[^>]*>(.*?)<\/i>/gi, '_$1_')
        .replace(/<em[^>]*>(.*?)<\/em>/gi, '_$1_')

        // UNDERLINE: <u>, any attributes, any case
        .replace(/<u[^>]*>(.*?)<\/u>/gi, '~$1~')

        // line breaks + spaces
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/&nbsp;/g, ' ')
        .trim()
    );
  }

  private convertMarkdownToHtml(md: string): string {
    return (
      md
        // BOLD
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/__(.*?)__/g, '<strong>$1</strong>')

        // ITALIC
        .replace(/\*(.*?)\*/g, '<i>$1</i>')
        .replace(/_(.*?)_/g, '<i>$1</i>')

        // UNDERLINE
        .replace(/~(.*?)~/g, '<u>$1</u>')

        // Line breaks
        .replace(/\n/g, '<br>')
    );
  }

  // eslint-disable-next-line @typescript-eslint/member-ordering
  setSpreadsheetSource(source: 'LOCAL' | 'ONEDRIVE'): void {
    if (this.spreadsheetSource === source) return;

    this.spreadsheetSource = source;

    if (source === 'LOCAL') {
      // Clear any OneDrive selection and file state
      this.oneDriveSpreadsheetName = null;
      this.removeSpreadsheet();
    } else {
      // Clear any local upload
      this.removeSpreadsheet();
    }
  }

  // eslint-disable-next-line @typescript-eslint/member-ordering
  openOneDrivePicker(): void {
    this.spreadsheetSource = 'ONEDRIVE';
    this.oneDriveLoading = true;
    this.oneDriveError = null;
    this.oneDriveFiles = [];
    this.oneDrivePickerVisible = false;

    this.oneDriveService.listSpreadsheets().subscribe({
      next: items => {
        this.oneDriveLoading = false;

        if (!items.length) {
          this.oneDriveError = 'No spreadsheets found in your OneDrive root.';
          return;
        }

        // just store them and show picker – no auto-selection
        this.oneDriveFiles = items;
        this.oneDrivePickerVisible = true;
      },
      error: err => {
        this.oneDriveLoading = false;
        console.error('❌ Failed to list OneDrive spreadsheets', err);
        this.oneDriveError = 'Failed to load OneDrive spreadsheets. Please try again.';
      },
    });
  }

  // eslint-disable-next-line @typescript-eslint/member-ordering
  selectOneDriveFile(file: OneDriveFileDto): void {
    this.oneDriveLoading = true;
    this.oneDriveError = null;

    this.oneDriveService.getSpreadsheetContent(file.id, file.driveId).subscribe({
      next: arrayBuffer => {
        this.oneDriveLoading = false;
        this.oneDrivePickerVisible = false;

        console.warn('[OneDrive] typeof arrayBuffer:', typeof arrayBuffer);
        console.warn('[OneDrive] instanceOf ArrayBuffer:', arrayBuffer instanceof ArrayBuffer);
        console.warn('[OneDrive] byteLength:', arrayBuffer.byteLength);

        // Optional: check if backend is sending JSON/error HTML instead of Excel
        try {
          const firstBytes = new Uint8Array(arrayBuffer).slice(0, 200);
          const textPreview = new TextDecoder().decode(firstBytes);
          console.error('[OneDrive] first 200 bytes as text:', textPreview);
        } catch (e) {
          console.warn('[OneDrive] Could not decode preview', e);
        }

        this.handleOneDriveSelection(arrayBuffer, file.name);
      },
      error: err => {
        this.oneDriveLoading = false;
        console.error('❌ Failed to download OneDrive spreadsheet', err);
        this.oneDriveError = 'Failed to download OneDrive spreadsheet. Please try again.';
      },
    });
  }

  // eslint-disable-next-line @typescript-eslint/member-ordering
  closeOneDrivePicker(): void {
    this.oneDrivePickerVisible = false;
  }

  private loadSpreadsheetFile(file: File): void {
    // remember file on the component
    this.mergeFile = file;
    this.mergeFileName = file.name;
    this.spreadsheetFileContentType = file.type || 'application/octet-stream';

    const reader = new FileReader();

    reader.onload = e => {
      const result = (e.target as FileReader).result;
      if (!result) {
        console.warn('[Spreadsheet] FileReader returned empty result');
        this.spreadsheetHeaders = [];
        this.spreadsheetTable = [];
        this.spreadsheetRows = [];
        this.previewMerge();
        return;
      }

      const data = new Uint8Array(result as ArrayBuffer);

      let workbook: XLSX.WorkBook;
      try {
        workbook = XLSX.read(data, { type: 'array' });
      } catch (err) {
        console.error('[Spreadsheet] XLSX.read failed', err);
        this.spreadsheetHeaders = [];
        this.spreadsheetTable = [];
        this.spreadsheetRows = [];
        this.previewMerge();
        return;
      }

      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
        console.warn('[Spreadsheet] Workbook has no sheets');
        this.spreadsheetHeaders = [];
        this.spreadsheetTable = [];
        this.spreadsheetRows = [];
        this.previewMerge();
        return;
      }

      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];

      // 👉 Read as a 2D matrix: first row = headers, rest = data rows
      const matrix = XLSX.utils.sheet_to_json<(string | number | boolean | null)[]>(sheet, {
        header: 1,
        defval: '', // never null/undefined
      });

      if (!Array.isArray(matrix) || matrix.length === 0) {
        console.warn('[Spreadsheet] sheet_to_json(header:1) returned empty matrix');
        this.spreadsheetHeaders = [];
        this.spreadsheetTable = [];
        this.spreadsheetRows = [];
        this.previewMerge();
        return;
      }

      const headerRowRaw = matrix[0];
      const dataRows = matrix.slice(1);

      // Normalise header cells to clean strings
      const headerRow = headerRowRaw.map(cell => String(cell ?? '').trim());

      // Keep only non-empty header columns
      const headerIndexes: number[] = [];
      const headers: string[] = [];
      headerRow.forEach((h, idx) => {
        if (h !== '') {
          headerIndexes.push(idx);
          headers.push(h);
        }
      });

      this.spreadsheetHeaders = headers;

      // Build rows-as-objects for token replacement
      this.spreadsheetRows = dataRows.map(row => {
        const obj: Record<string, string> = {};
        headerIndexes.forEach((colIdx, i) => {
          const key = headers[i];
          const cell = row[colIdx];
          obj[key] = String(cell ?? '');
        });
        return obj;
      });

      // Build preview table: header row + data rows
      this.spreadsheetTable = [headers, ...dataRows.map(row => headerIndexes.map(colIdx => String(row[colIdx] ?? '')))];

      // Debug logs so you can see what's going on for local vs OneDrive
      console.error('[Spreadsheet] Headers:', this.spreadsheetHeaders);
      console.error('[Spreadsheet] First 3 rows of matrix:', matrix.slice(0, 3));
      console.error('[Spreadsheet] First row object:', this.spreadsheetRows[0]);

      // Build email previews using parsed rows
      this.previewMerge();
    };

    reader.readAsArrayBuffer(file);

    // 2) Base64 snapshot for saving to backend
    const dataUrlReader = new FileReader();
    dataUrlReader.onload = e => {
      const dataUrl = (e.target as FileReader).result as string;
      this.spreadsheetBase64 = dataUrl.split(',')[1] ?? '';
    };
    dataUrlReader.readAsDataURL(file);
  }

  // eslint-disable-next-line @typescript-eslint/member-ordering
  handleOneDriveSelection(fileBytes: ArrayBuffer, fileName: string): void {
    this.spreadsheetSource = 'ONEDRIVE';
    this.oneDriveSpreadsheetName = fileName;

    this.removeSpreadsheet();

    const blob = new Blob([fileBytes], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const file = new File([blob], fileName || 'onedrive.xlsx', { type: blob.type });

    this.loadSpreadsheetFile(file);
  }
}
