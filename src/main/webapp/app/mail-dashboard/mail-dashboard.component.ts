import { Component, ElementRef, OnInit, ViewChild, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import * as XLSX from 'xlsx';

import SharedModule from 'app/shared/shared.module';
import { Project, ProjectService } from 'app/project/project.service';
import { AccountService } from 'app/core/auth/account.service';
import { LoginService } from 'app/login/login.service';
import { Account } from 'app/core/auth/account.model';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { OneDriveService, OneDriveFileDto } from 'app/services/one-drive.service';
import { AttachmentService } from 'app/project/attachment.service';
import { forkJoin, of, switchMap, tap } from 'rxjs';
import { AiRewriteService } from '../services/ai-rewrite.service';
import {
  faTrash,
  faPaperclip,
  faFileExcel,
  faCloud,
  faCircleQuestion,
  faTable,
  faWandMagicSparkles,
  faEye,
  faLink,
  faPenToSquare,
} from '@fortawesome/free-solid-svg-icons';
// (optional) if you use other icons, add them here too

type MergeField = 'to' | 'cc' | 'bcc' | 'subject' | 'body';
type RightPanel = 'compose' | 'howto' | 'sheet' | 'ai' | 'preview';

@Component({
  standalone: true,
  selector: 'jhi-mail-dashboard',
  templateUrl: './mail-dashboard.component.html',
  styleUrls: ['./mail-dashboard.component.scss'],
  imports: [SharedModule, RouterModule, FormsModule],
})
export class MailDashboardComponent implements OnInit {
  // Sidebar state
  projects: Project[] = [];
  sendMenuOpen = false;

  // Hidden inputs triggered by toolbar buttons
  @ViewChild('mergeFileInput') mergeFileInput?: ElementRef<HTMLInputElement>;
  @ViewChild('attachmentsInput') attachmentsInput?: ElementRef<HTMLInputElement>;

  account = signal<Account | null>(null);
  projectId: number | null = null;
  project: Project | null = null;
  sidebarCollapsed = false;

  projectName = '';
  mergeSubjectTemplate = '';
  mergeBodyTemplate = '';
  mergeFile: File | null = null;
  mergeFileName: string | null = null;

  faTrash = faTrash;
  faPaperclip = faPaperclip;
  faFileExcel = faFileExcel;
  faCloud = faCloud;
  faHowTo = faCircleQuestion;
  faSpreadsheet = faTable;
  faAi = faWandMagicSparkles;
  faPreview = faEye;
  faLink = faLink;
  faCompose = faPenToSquare;

  showBcc = false;

  tokenColors: Record<string, string> = {};

  spreadsheetBase64: string | null = null;
  spreadsheetFileContentType: string | null = null;
  spreadsheetTable: string[][] = [];
  spreadsheetPreviewVisible = false; // (legacy var; safe to remove once HTML stops referencing it)

  // rows as objects for token replacement
  spreadsheetRows: Record<string, string>[] = [];

  sendQueued = signal(false);
  sendQueuedSeconds = signal(0);

  isRewriting = false;
  customTone = '';
  aiVisible = false; // (legacy var; safe to remove once HTML stops referencing it)
  aiRewrittenText = '';
  aiSelectedTone: 'professional' | 'friendly' | 'custom' | null = null;
  aiRewrittenPreview: SafeHtml | null = null;

  toField = '';
  ccField = '';
  bccField = '';

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

  // ✅ NEW: Test state
  testSending = signal(false);
  testSuccess = false;
  testErr = signal(false);

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

  previewVisible = true; // (legacy var; safe to remove once HTML stops referencing it)
  howToVisible = false; // (legacy var; safe to remove once HTML stops referencing it)

  // ✅ Single source of truth for right side
  activePanel: RightPanel = 'compose';

  private skipTokenRender = false;

  private readonly projectService = inject(ProjectService);
  private readonly accountService = inject(AccountService);
  private readonly loginService = inject(LoginService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly attachmentService = inject(AttachmentService);
  private readonly aiRewriteService = inject(AiRewriteService);
  private readonly oneDriveService = inject(OneDriveService);
  private sendQueuedTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private sendQueuedIntervalId: ReturnType<typeof setInterval> | null = null;

  ngOnInit(): void {
    this.accountService.identity().subscribe(account => this.account.set(account));
    this.listenToMailProgress();
    this.loadProjects();
    const saved = localStorage.getItem('mm_sidebar_collapsed');
    if (saved != null) this.sidebarCollapsed = saved === 'true';

    this.route.params.subscribe(params => {
      const idParam = params['id'];
      if (idParam) {
        this.projectId = Number(idParam);
        this.loadProject(this.projectId);
      } else {
        this.projectId = null;
        // ✅ no project loaded -> default compose
        this.activePanel = 'compose';
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

      let field: MergeField | null = null;
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

  // -----------------------
  // Sidebar actions
  // -----------------------
  loadProjects(): void {
    this.projectService.findMy().subscribe({
      next: projects => (this.projects = projects),
      error: err => console.error('❌ Failed to load projects', err),
    });
  }

  trackByProjectId(_idx: number, p: Project): number | undefined {
    return p.id;
  }

  newProject(): void {
    const name = (window.prompt('Enter project name') ?? '').trim();
    if (!name) return;

    const project: Project = { name };
    this.projectService.create(project).subscribe({
      next: created => {
        this.loadProjects();
        // ✅ always start on compose
        this.activePanel = 'compose';
        void this.router.navigate(['/mail', created.id]);
      },
      error: err => console.error('❌ Failed to create project', err),
    });
  }

  deleteCurrentProject(): void {
    if (!this.projectId) return;

    const ok = window.confirm('Delete this project?');
    if (!ok) return;

    this.projectService.delete(this.projectId).subscribe({
      next: () => {
        this.loadProjects();
        this.clearEditorState();
        void this.router.navigate(['/mail']);
      },
      error: err => console.error('❌ Failed to delete project', err),
    });
  }

  private clearEditorState(): void {
    this.projectId = null;
    this.project = null;
    this.projectName = '';
    this.mergeSubjectTemplate = '';
    this.mergeBodyTemplate = '';
    this.toField = '';
    this.ccField = '';
    this.bccField = '';
    this.attachments = [];
    this.deletedAttachmentIds = [];
    this.removeSpreadsheet();
    this.previewEmails = [];

    // ✅ reset view
    this.activePanel = 'compose';
  }

  // -----------------------
  // Toolbar glue
  // -----------------------
  // eslint-disable-next-line @typescript-eslint/member-ordering
  toggleSendMenu(): void {
    this.sendMenuOpen = !this.sendMenuOpen;
  }

  // eslint-disable-next-line @typescript-eslint/member-ordering
  connectSpreadsheet(): void {
    if (this.spreadsheetSource === 'LOCAL') {
      this.mergeFileInput?.nativeElement.click();
      return;
    }
    this.openOneDrivePicker();
  }

  // eslint-disable-next-line @typescript-eslint/member-ordering
  openAttachmentsPicker(): void {
    this.attachmentsInput?.nativeElement.click();
  }

  // eslint-disable-next-line @typescript-eslint/member-ordering
  goBack(): void {
    void this.router.navigate(['/project']);
  }

  // eslint-disable-next-line @typescript-eslint/member-ordering
  login(): void {
    this.loginService.login();
  }

  // -----------------------
  // Right panel switching (single source of truth)
  // -----------------------
  // eslint-disable-next-line @typescript-eslint/member-ordering
  setPanel(panel: RightPanel): void {
    // clicking the same panel again returns to Compose (nice UX)
    this.activePanel = this.activePanel === panel ? 'compose' : panel;

    if (this.activePanel === 'preview') {
      this.previewMerge();
      return;
    }

    // Optional: when returning to compose, ensure editors show tokens
    if (this.activePanel === 'compose') {
      setTimeout(() => {
        (['body', 'subject', 'to', 'cc', 'bcc'] as MergeField[]).forEach(f => this.renderTokens(f));
      });
    }
  }

  // -----------------------
  // Spreadsheet + headers
  // -----------------------
  // eslint-disable-next-line @typescript-eslint/member-ordering
  onDragStart(event: DragEvent, header: string): void {
    event.dataTransfer?.setData('text/plain', `{{${header}}}`);
  }

  // eslint-disable-next-line @typescript-eslint/member-ordering
  allowDrop(event: DragEvent): void {
    event.preventDefault();
  }

  // eslint-disable-next-line @typescript-eslint/member-ordering
  onDrop(event: DragEvent, field: MergeField): void {
    event.preventDefault();
    const text = event.dataTransfer?.getData('text/plain') ?? '';
    const el = document.getElementById(this.getElementId(field));
    if (!el) return;

    el.focus();

    const sel = window.getSelection();
    if (!sel?.rangeCount) return;

    const range = sel.getRangeAt(0);
    range.deleteContents();

    range.insertNode(document.createTextNode(text));

    const space = document.createTextNode(' ');
    range.insertNode(space);

    range.setStartAfter(space);
    range.collapse(true);

    sel.removeAllRanges();
    sel.addRange(range);

    this.onEditorInput(field);
    setTimeout(() => this.renderTokens(field));
  }

  // eslint-disable-next-line @typescript-eslint/member-ordering
  onMergeFileChange(event: Event): void {
    this.spreadsheetSource = 'LOCAL';
    this.oneDriveSpreadsheetName = null;

    const input = event.target as HTMLInputElement | null;
    const file = input?.files && input.files.length > 0 ? input.files[0] : null;
    if (!file) return;

    this.removeSpreadsheet();
    this.loadSpreadsheetFile(file);
  }

  // eslint-disable-next-line @typescript-eslint/member-ordering
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

    this.showBcc = false;

    // ✅ also reset picker/errors + allow re-uploading same file
    this.oneDrivePickerVisible = false;
    this.oneDriveFiles = [];
    this.oneDriveLoading = false;
    this.oneDriveError = null;

    if (this.mergeFileInput?.nativeElement) {
      this.mergeFileInput.nativeElement.value = '';
    }
  }

  // -----------------------
  // Attachments
  // -----------------------
  // eslint-disable-next-line @typescript-eslint/member-ordering
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

    input.value = '';
  }

  // eslint-disable-next-line @typescript-eslint/member-ordering
  removeAttachment(index: number): void {
    const removed = this.attachments.splice(index, 1)[0];
    if (removed.id) {
      this.deletedAttachmentIds.push(removed.id);
    }
  }

  // -----------------------
  // Load project
  // -----------------------
  // eslint-disable-next-line @typescript-eslint/member-ordering
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
        this.showBcc = !!this.bccField.trim();

        // ✅ always land on compose when opening a project
        this.activePanel = 'compose';

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
              (['body', 'subject', 'to', 'cc', 'bcc'] as MergeField[]).forEach(f => this.renderTokens(f));
            });
          },
          error: err => {
            console.error('❌ Failed to load attachments', err);
            this.attachmentsLoading = false;
          },
        });

        this.previewMerge();
        this.loadProjects();
      },
      error: err => console.error('❌ Failed to load project', err),
    });
  }

  // -----------------------
  // Save & send
  // -----------------------
  // eslint-disable-next-line @typescript-eslint/member-ordering
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
          this.project = updated;
          this.loadProjects();
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
  testProject(): void {
    if (!this.projectId || !this.mergeFile) {
      this.testErr.set(true);
      return;
    }
    if (this.attachmentsLoading) {
      alert('Attachments are still loading, please wait a moment.');
      return;
    }

    this.testSending.set(true);
    this.testErr.set(false);
    this.testSuccess = false;

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

        this.projectService.sendMailMergeTestWithMeta(payload).subscribe({
          next: () => {
            this.testSending.set(false);
            this.testSuccess = true;
            setTimeout(() => (this.testSuccess = false), 3000);
          },
          error: err => {
            console.error('❌ Test send failed', err);
            this.testSending.set(false);
            this.testErr.set(true);
          },
        });
      },
      error: err => {
        console.error('❌ Save-before-test failed', err);
        this.testSending.set(false);
        this.testErr.set(true);
      },
    });
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

              this.projectService.update(updatedProject).subscribe(() => this.loadProjects());
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

  // -----------------------
  // Downloads
  // -----------------------
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

  private base64ToBlob(base64: string, contentType: string): Blob {
    const byteCharacters = atob(base64);
    const byteArrays: Uint8Array[] = [];
    for (let offset = 0; offset < byteCharacters.length; offset += 512) {
      const slice = byteCharacters.slice(offset, offset + 512);
      const byteNumbers = new Array(slice.length);
      for (let i = 0; i < slice.length; i++) byteNumbers[i] = slice.charCodeAt(i);
      byteArrays.push(new Uint8Array(byteNumbers));
    }
    return new Blob(byteArrays, { type: contentType });
  }

  // -----------------------
  // Mail progress (SSE)
  // -----------------------
  // eslint-disable-next-line @typescript-eslint/member-ordering
  listenToMailProgress(): void {
    const eventSource = new EventSource('/api/mail-progress/stream');

    eventSource.addEventListener('mail-progress', (event: MessageEvent) => {
      const data = JSON.parse(event.data);

      if (typeof data.totalCount === 'number' && data.totalCount >= 0) this.sendingTotal = data.totalCount;
      if (typeof data.sentCount === 'number' && data.sentCount >= 0) this.sendingProgress = data.sentCount;

      this.sendingInProgress = this.sendingTotal > 0 && this.sendingProgress < this.sendingTotal;

      if (data.email && data.message) this.progressLogs.push(`${data.email} — ${data.message}`);

      if (this.sendingTotal > 0 && this.sendingProgress >= this.sendingTotal) {
        this.sendingInProgress = false;
        this.sendingFinished = true;
        setTimeout(() => (this.sendingFinished = false), 5000);
      }
    });

    eventSource.onerror = err => console.error('SSE error', err);
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
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        this.aiRewrittenText = res.rewrittenText ?? '';
        const html = this.convertMarkdownToHtml(this.aiRewrittenText || '');
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

    // ✅ after applying, return user to compose view
    this.activePanel = 'compose';
  }

  // -----------------------
  // Editor input + tokens
  // -----------------------
  // eslint-disable-next-line @typescript-eslint/member-ordering
  onEditorInput(field: MergeField): void {
    const el = document.getElementById(this.getElementId(field));
    if (!el) return;

    let html = el.innerHTML;

    html = html.replace(/<span[^>]*class="merge-token"[^>]*data-field="([^"]+)"[^>]*>.*?<\/span>/gi, '{{$1}}');

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
  renderTokens(field: MergeField): void {
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

    let html = this.convertMarkdownToHtml(md);

    html = html.replace(
      /{{\s*([^}]+)\s*}}/g,
      (_, key: string) =>
        `<span class="merge-token" data-field="${key}" contenteditable="false" style="background:${this.getColorForField(
          key,
        )}">${key}</span>`,
    );

    el.innerHTML = html;
  }

  // eslint-disable-next-line @typescript-eslint/member-ordering
  getColorForField(key: string): string {
    const k = key.trim();
    if (!this.tokenColors[k]) {
      this.tokenColors[k] = `hsl(${Math.floor(Math.random() * 360)}, 70%, 50%)`;
    }
    return this.tokenColors[k];
  }

  private getElementId(field: MergeField): string {
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

  // eslint-disable-next-line @typescript-eslint/member-ordering
  formatFromToolbar(event: MouseEvent, type: 'bold' | 'italic' | 'underline'): void {
    event.preventDefault();
    event.stopPropagation();
    this.applyFormatting(type);
  }

  // eslint-disable-next-line @typescript-eslint/member-ordering
  applyFormatting(type: 'bold' | 'italic' | 'underline'): void {
    const bodyEl = document.getElementById('mergeBody');
    if (!bodyEl) return;

    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !sel.toString().trim()) return;

    const command = type === 'bold' ? 'bold' : type === 'italic' ? 'italic' : 'underline';

    // eslint-disable-next-line @typescript-eslint/no-deprecated
    document.execCommand(command, false);

    let html = bodyEl.innerHTML;
    html = html.replace(/<span[^>]*class="merge-token"[^>]*data-field="([^"]+)"[^>]*>.*?<\/span>/gi, '{{$1}}');

    this.mergeBodyTemplate = this.htmlToMarkdown(html);
    this.renderTokens('body');
    this.previewMerge();
  }

  private htmlToMarkdown(html: string): string {
    return html
      .replace(/<strong[^>]*>(.*?)<\/strong>/gi, '**$1**')
      .replace(/<b[^>]*>(.*?)<\/b>/gi, '**$1**')
      .replace(/<i[^>]*>(.*?)<\/i>/gi, '_$1_')
      .replace(/<em[^>]*>(.*?)<\/em>/gi, '_$1_')
      .replace(/<u[^>]*>(.*?)<\/u>/gi, '~$1~')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/&nbsp;/g, ' ')
      .trim();
  }

  private convertMarkdownToHtml(md: string): string {
    return md
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/__(.*?)__/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<i>$1</i>')
      .replace(/_(.*?)_/g, '<i>$1</i>')
      .replace(/~(.*?)~/g, '<u>$1</u>')
      .replace(/\n/g, '<br>');
  }

  // -----------------------
  // Spreadsheet source / OneDrive
  // -----------------------
  // eslint-disable-next-line @typescript-eslint/member-ordering
  setSpreadsheetSource(source: 'LOCAL' | 'ONEDRIVE'): void {
    if (this.spreadsheetSource === source) return;

    this.spreadsheetSource = source;
    if (source === 'LOCAL') {
      this.oneDriveSpreadsheetName = null;
      this.removeSpreadsheet();
    } else {
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

    // If OneDriveService return type is not ArrayBuffer, TS will complain.
    // This cast fixes it without suppressing all TS checks.
    (this.oneDriveService.getSpreadsheetContent(file.id, file.driveId) as unknown as import('rxjs').Observable<ArrayBuffer>).subscribe({
      next: (arrayBuffer: ArrayBuffer) => {
        this.oneDriveLoading = false;
        this.oneDrivePickerVisible = false;
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
    this.mergeFile = file;
    this.mergeFileName = file.name;
    this.spreadsheetFileContentType = file.type || 'application/octet-stream';

    const reader = new FileReader();
    reader.onload = e => {
      const result = (e.target as FileReader).result;
      if (!result) {
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
        this.spreadsheetHeaders = [];
        this.spreadsheetTable = [];
        this.spreadsheetRows = [];
        this.previewMerge();
        return;
      }

      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];

      const matrix = XLSX.utils.sheet_to_json<(string | number | boolean | null)[]>(sheet, {
        header: 1,
        defval: '',
      });

      if (!Array.isArray(matrix) || matrix.length === 0) {
        this.spreadsheetHeaders = [];
        this.spreadsheetTable = [];
        this.spreadsheetRows = [];
        this.previewMerge();
        return;
      }

      const headerRowRaw = matrix[0] ?? [];
      const dataRows = matrix.slice(1);

      const headerRow = headerRowRaw.map(cell => String(cell ?? '').trim());

      const headerIndexes: number[] = [];
      const headers: string[] = [];
      headerRow.forEach((h, idx) => {
        if (h !== '') {
          headerIndexes.push(idx);
          headers.push(h);
        }
      });

      this.spreadsheetHeaders = headers;

      this.spreadsheetRows = dataRows.map(row => {
        const obj: Record<string, string> = {};
        headerIndexes.forEach((colIdx, i) => {
          const key = headers[i];
          const cell = row[colIdx];
          obj[key] = String(cell ?? '');
        });
        return obj;
      });

      this.spreadsheetTable = [headers, ...dataRows.map(row => headerIndexes.map(colIdx => String(row[colIdx] ?? '')))];

      this.previewMerge();
    };

    reader.readAsArrayBuffer(file);

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

  // eslint-disable-next-line @typescript-eslint/member-ordering
  toggleSidebar(): void {
    this.sidebarCollapsed = !this.sidebarCollapsed;
    localStorage.setItem('mm_sidebar_collapsed', String(this.sidebarCollapsed));
  }

  // eslint-disable-next-line @typescript-eslint/member-ordering
  openProjectFromSidebar(p: Project): void {
    if (!p.id) return;

    // Optional nice UX: expand when user clicks a project while collapsed
    if (this.sidebarCollapsed) this.toggleSidebar();

    this.sendMenuOpen = false;
    void this.router.navigate(['/mail', p.id]);
  }

  get hasConnectedSpreadsheet(): boolean {
    return !!this.mergeFile; // mergeFile is set for BOTH Local + OneDrive
  }

  get connectedSpreadsheetName(): string {
    return this.oneDriveSpreadsheetName ?? this.mergeFile?.name ?? 'Spreadsheet';
  }

  // eslint-disable-next-line @typescript-eslint/member-ordering
  toggleBcc(): void {
    this.showBcc = !this.showBcc;

    // When opening, focus the Bcc line like Outlook
    if (this.showBcc) {
      setTimeout(() => document.getElementById('bccField')?.focus());
    }
  }
  // -----------------------
  // Undo Send (frontend-only)
  // -----------------------
  // eslint-disable-next-line @typescript-eslint/member-ordering
  queueSendProject(): void {
    // prevent double-queueing
    if (this.sendQueued() || this.mergeSending()) return;

    // same validation as sendProject()
    if (!this.projectId || !this.mergeFile) {
      this.mergeErr.set(true);
      return;
    }
    if (this.attachmentsLoading) {
      alert('Attachments are still loading, please wait a moment.');
      return;
    }

    // clear any previous timers (safety)
    this.clearQueuedSendTimers();

    this.mergeErr.set(false);
    this.sendQueued.set(true);
    this.sendQueuedSeconds.set(10);

    // countdown UI
    this.sendQueuedIntervalId = setInterval(() => {
      const s = this.sendQueuedSeconds();
      if (s <= 1) {
        this.sendQueuedSeconds.set(0);
        if (this.sendQueuedIntervalId) {
          clearInterval(this.sendQueuedIntervalId);
          this.sendQueuedIntervalId = null;
        }
        return;
      }
      this.sendQueuedSeconds.set(s - 1);
    }, 1000);

    // actual send after 10s
    this.sendQueuedTimeoutId = setTimeout(() => {
      this.clearQueuedSendTimers();
      this.sendQueued.set(false);
      this.sendQueuedSeconds.set(0);

      // re-check in case state changed during countdown
      if (!this.projectId || !this.mergeFile) {
        this.mergeErr.set(true);
        return;
      }
      if (this.attachmentsLoading) {
        alert('Attachments are still loading, please wait a moment.');
        return;
      }

      // call your existing logic
      this.sendProject();
    }, 10_000);
  }

  // eslint-disable-next-line @typescript-eslint/member-ordering
  undoQueuedSend(): void {
    if (!this.sendQueued()) return;

    this.clearQueuedSendTimers();
    this.sendQueued.set(false);
    this.sendQueuedSeconds.set(0);
  }

  private clearQueuedSendTimers(): void {
    if (this.sendQueuedTimeoutId) {
      clearTimeout(this.sendQueuedTimeoutId);
      this.sendQueuedTimeoutId = null;
    }
    if (this.sendQueuedIntervalId) {
      clearInterval(this.sendQueuedIntervalId);
      this.sendQueuedIntervalId = null;
    }
  }
}
