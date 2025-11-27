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

  isRewriting = false;
  customTone = ''; // user-defined style/tone
  aiVisible = false;
  aiRewrittenText = '';
  aiSelectedTone: 'professional' | 'friendly' | 'custom' | null = null;

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
  private readonly aiRewriteService = inject(AiRewriteService);

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

    document.addEventListener('keydown', e => {
      if (e.key !== 'Backspace') return;

      const sel = window.getSelection();
      if (!sel?.anchorNode) return;

      const anchor = sel.anchorNode;

      // 🔹 Find the merge editor even when it's completely empty
      const container = anchor instanceof Element ? anchor.closest('.merge-editor') : anchor.parentElement?.closest('.merge-editor');

      if (!container) return;

      // 🔹 If the editor is visually empty, block backspace completely
      const plain = (container as HTMLElement).innerText.trim();

      if (plain === '') {
        e.preventDefault();
        container.innerHTML = ''; // keep it clean
        return;
      }

      // 🔹 Token delete behaviour (only if we're actually on a token)
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

    // ✅ only prevent cursor going INSIDE a token — not next to it
    document.addEventListener('mouseup', () => {
      const sel = window.getSelection();
      if (!sel?.anchorNode) return;

      const token = sel.anchorNode.parentElement?.closest('.merge-token');

      // Only fix if cursor is INSIDE the text of the token
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

  onDragStart(event: DragEvent, header: string): void {
    event.dataTransfer?.setData('text/plain', `{{${header}}}`);
  }
  allowDrop(event: DragEvent): void {
    event.preventDefault();
  }
  onDrop(event: DragEvent, field: 'to' | 'cc' | 'bcc' | 'subject' | 'body'): void {
    event.preventDefault();
    const text = event.dataTransfer?.getData('text/plain') ?? '';

    // ✅ If it's body or subject → contenteditable logic
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (field === 'body' || field === 'subject' || field === 'to' || field === 'cc' || field === 'bcc') {
      const el = document.getElementById(this.getElementId(field));
      if (!el) return;

      el.focus();

      const sel = window.getSelection();
      if (!sel?.rangeCount) return;

      const range = sel.getRangeAt(0);
      range.deleteContents();

      // Insert raw token text (we'll convert to blocks after)
      range.insertNode(document.createTextNode(text));

      // Move caret after insertion
      // ✅ create a space after token so cursor has somewhere to go
      const space = document.createTextNode(' ');
      range.insertNode(space);

      // ✅ move caret after the space
      range.setStartAfter(space);
      range.collapse(true);

      sel.removeAllRanges();
      sel.addRange(range);

      // Update model
      this.onEditorInput(field);

      // Convert into block visually
      setTimeout(() => this.renderTokens(field));

      return;
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

      const sheetName = workbook.SheetNames[0];
      const sheetData = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1 });

      if (Array.isArray(sheetData) && sheetData.length > 0) {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-expect-error
        this.spreadsheetHeaders = sheetData[0].filter(h => !!h && h.trim() !== '');
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-expect-error
        this.spreadsheetTable = sheetData; // ✅ store entire sheet for preview
      }

      this.previewMerge();
    };

    reader.readAsArrayBuffer(this.mergeFile);

    // Save base64 for backend
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
            setTimeout(() => {
              ['body', 'subject', 'to', 'cc', 'bcc'].forEach(f => this.renderTokens(f as any));
            });
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
          bodyTemplate: this.mergeBodyTemplate.replace(/\n/g, '<br>'),
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
                ...(this.project ?? {}), // keep all existing values
                id: this.projectId,
                // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
                name: this.projectName ?? '', // ensure not undefined
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
                sentAt: new Date().toISOString(), // ✅ timestamp of send
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

  // eslint-disable-next-line @typescript-eslint/member-ordering
  rewriteEmailBody(tone: 'professional' | 'friendly' | 'custom'): void {
    if (!this.mergeBodyTemplate) return;

    const selectedTone = tone === 'custom' ? this.customTone : tone;
    if (!selectedTone.trim()) return;

    this.isRewriting = true;
    this.aiSelectedTone = tone;
    this.aiRewrittenText = '';

    this.aiRewriteService.rewrite(this.mergeBodyTemplate, selectedTone).subscribe({
      next: res => {
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        this.aiRewrittenText = res.rewrittenText ?? '';
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

    // ✅ update the editor UI
    setTimeout(() => this.renderTokens('body'));

    // ✅ refresh preview
    this.previewMerge();

    // ✅ close UI panels
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

  // eslint-disable-next-line @typescript-eslint/member-ordering
  onEditorInput(field: 'body' | 'subject' | 'to' | 'cc' | 'bcc'): void {
    const el = document.getElementById(this.getElementId(field));
    if (!el) return;

    let html = el.innerHTML;

    // ✅ convert merge tokens back to {{field}}
    html = html.replace(/<span[^>]*class="merge-token"[^>]*data-field="([^"]+)"[^>]*>.*?<\/span>/gi, '{{$1}}');

    // ✅ convert <br> to newline
    html = html.replace(/<br\s*\/?>/gi, '\n');

    // ✅ convert block elements into newlines
    html = html.replace(/<\/div>|<\/p>/gi, '\n');

    // ✅ remove opening tags safely
    html = html.replace(/<div[^>]*>|<p[^>]*>/gi, '');

    // ✅ convert &nbsp; to spaces
    html = html.replace(/&nbsp;/g, ' ');

    // ✅ DO NOT remove all tags blindly (this was your problem before)

    const raw = html;

    if (field === 'body') this.mergeBodyTemplate = raw;
    if (field === 'subject') this.mergeSubjectTemplate = raw;
    if (field === 'to') this.toField = raw;
    if (field === 'cc') this.ccField = raw;
    if (field === 'bcc') this.bccField = raw;

    this.previewMerge();
  }

  // eslint-disable-next-line @typescript-eslint/member-ordering
  renderTokens(field: 'body' | 'subject' | 'to' | 'cc' | 'bcc'): void {
    const el = document.getElementById(this.getElementId(field));
    if (!el) return;

    let text = '';

    if (field === 'body') text = this.mergeBodyTemplate;
    else if (field === 'subject') text = this.mergeSubjectTemplate;
    else if (field === 'to') text = this.toField;
    else if (field === 'cc') text = this.ccField;
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    else if (field === 'bcc') text = this.bccField;

    // ✅ escape HTML
    let safe = text.replace(/</g, '&lt;').replace(/>/g, '&gt;');

    // ✅ restore visual line breaks in editor
    safe = safe.replace(/\n/g, '<br>');

    el.innerHTML = safe.replace(
      /{{\s*([^}]+)\s*}}/g,
      (_, key) =>
        `<span class="merge-token"
         data-field="${key}"
         contenteditable="false"
         style="background:${this.getColorForField(key)}">${key}</span>`,
    );

    // ✅ ensure there is always a text node after tokens
    // ✅ ensure there's a normal space to type after
    if (!el.lastChild || el.lastChild.nodeType !== Node.TEXT_NODE) {
      el.appendChild(document.createTextNode(' ')); // real space
    }

    // ✅ keep cursor position
    // ✅ keep caret ONLY if user is in this field
    if (document.activeElement === el) {
      this.placeCaretAtEnd(el);
    }
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
}
