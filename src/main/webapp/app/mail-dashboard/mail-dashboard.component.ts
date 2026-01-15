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
import { OneDrivePickerV8Service } from 'app/services/one-drive-picker-v8.service';
import { AttachmentService } from 'app/project/attachment.service';
import { forkJoin, of, switchMap, tap, catchError, finalize } from 'rxjs';
import { AiRewriteService } from '../services/ai-rewrite.service';
import { SignatureService } from 'app/core/auth/signature.service';
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
  faSignature,
} from '@fortawesome/free-solid-svg-icons';

type MergeField = 'to' | 'cc' | 'bcc' | 'subject' | 'body';
type RightPanel = 'blank' | 'compose' | 'howto' | 'sheet' | 'ai' | 'preview' | 'signature';
type InlineImage = { cid: string; fileContentType: string; base64: string; name: string };

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

  // ✅ Used to remember/display the filename even when spreadsheet is re-hydrated from DB
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
  faSignature = faSignature;

  signatureDraftHtml = '';
  showBcc = false;

  // -----------------------
  // Signature
  // -----------------------
  signatureSaved = '';
  signatureDraft = '';

  deleteTargetId: number | null = null;
  deleteTargetName = '';

  projectSearch = '';

  folderOpen: Record<'PENDING' | 'FAILED' | 'SENT', boolean> = {
    PENDING: true,
    FAILED: false,
    SENT: false,
  };

  tokenColors: Record<string, string> = {};

  creatingProject = false;
  newProjectName = '';
  deleteConfirmOpen = false;

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

  spreadsheetMenuOpen = false;
  spreadsheetPreviewOpen = false;
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

  bottomPreviewOpen = true; // ✅ Preview open by default
  bottomAiOpen = false;

  linkModalOpen = false;
  linkUrlDraft = '';
  linkTextDraft = '';
  linkError: string | null = null;

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
  activePanel: RightPanel = 'blank';

  uiToast: { type: 'warn' | 'error' | 'ok'; text: string } | null = null;

  private skipTokenRender = false;

  private savedBodyRange: Range | null = null;

  private savedLinkRange: Range | null = null;

  private pendingAttachmentReads = 0;

  // ✅ Hide projects only while a delete request is in-flight (prevents "ghosts" without breaking create)
  private readonly pendingDeletedProjectIds = new Set<number>();
  private deletingProject = false;

  private sendingFinishedTimeoutId: ReturnType<typeof setTimeout> | null = null;

  private readonly projectService = inject(ProjectService);
  private readonly accountService = inject(AccountService);
  private readonly loginService = inject(LoginService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly attachmentService = inject(AttachmentService);
  private readonly aiRewriteService = inject(AiRewriteService);
  private readonly oneDriveService = inject(OneDriveService);
  private readonly signatureService = inject(SignatureService);
  private readonly oneDrivePicker = inject(OneDrivePickerV8Service);
  private readonly SIGN_DELIM = '\n\n--\n';
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
        // ✅ When no project is selected, RHS should be blank
        this.clearEditorState();
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

  get hasSelectedProject(): boolean {
    return !!this.projectId;
  }

  // -----------------------
  // Sidebar actions
  // -----------------------
  loadProjects(): void {
    this.projectService.findMy().subscribe({
      next: projects => {
        // ✅ hide only things currently being deleted
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        this.projects = (projects ?? []).filter(p => !p.id || !this.pendingDeletedProjectIds.has(p.id));
      },
      error: err => console.error('❌ Failed to load projects', err),
    });
  }

  trackByProjectId(_idx: number, p: Project): number | undefined {
    return p.id;
  }

  newProject(): void {
    this.newProjectName = '';
    this.creatingProject = true;
  }

  confirmCreateProject(): void {
    const name = this.newProjectName.trim();
    if (!name) return;

    this.creatingProject = false;

    const project: Project = { name };
    this.projectService.create(project).subscribe({
      next: created => {
        this.projects = [created, ...this.projects];
        this.activePanel = 'compose';
        void this.router.navigate(['/mail', created.id]);
      },
      error: err => console.error('❌ Failed to create project', err),
    });
  }

  deleteCurrentProject(): void {
    if (!this.projectId || this.deletingProject) return;
    this.deleteConfirmOpen = true;
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
    this.attachmentsLoading = false;
    this.sendMenuOpen = false;
    this.spreadsheetMenuOpen = false;
    this.spreadsheetPreviewOpen = false;

    this.removeSpreadsheet();
    this.previewEmails = [];

    // ✅ blank RHS until a project is selected/created
    this.activePanel = 'blank';
  }

  // -----------------------
  // Toolbar glue
  // -----------------------
  // eslint-disable-next-line @typescript-eslint/member-ordering
  toggleSendMenu(): void {
    if (!this.hasSelectedProject) return;
    this.sendMenuOpen = !this.sendMenuOpen;
  }

  // eslint-disable-next-line @typescript-eslint/member-ordering
  connectSpreadsheet(): void {
    if (!this.hasSelectedProject) return;

    if (this.spreadsheetSource === 'LOCAL') {
      this.mergeFileInput?.nativeElement.click();
      return;
    }

    // ✅ must be called directly from the click
    void this.openOneDrivePicker();
  }

  // eslint-disable-next-line @typescript-eslint/member-ordering
  openAttachmentsPicker(): void {
    if (!this.hasSelectedProject) return;
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
    if (!this.hasSelectedProject) return;

    // clicking the same panel again returns to Compose (nice UX)
    this.activePanel = this.activePanel === panel ? 'compose' : panel;

    if (this.activePanel === 'preview') {
      this.previewMerge();
      return;
    }

    // ✅ when opening signature panel, load saved signature into the editor
    if (this.activePanel === 'signature') {
      setTimeout(() => {
        const el = document.getElementById('signatureEditor');
        if (el) {
          el.innerHTML = this.convertMarkdownToHtml(this.signatureSaved || '');
          el.focus();
        }
      });
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
    if (!this.hasSelectedProject) return;
    event.dataTransfer?.setData('text/plain', `{{${header}}}`);
  }

  // eslint-disable-next-line @typescript-eslint/member-ordering
  allowDrop(event: DragEvent): void {
    if (!this.hasSelectedProject) return;
    event.preventDefault();
  }

  // eslint-disable-next-line @typescript-eslint/member-ordering
  onDrop(event: DragEvent, field: MergeField): void {
    if (!this.hasSelectedProject) return;

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
    if (!this.hasSelectedProject) return;

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

    this.spreadsheetMenuOpen = false;
    this.spreadsheetPreviewOpen = false;

    if (this.mergeFileInput?.nativeElement) {
      this.mergeFileInput.nativeElement.value = '';
    }
  }

  // -----------------------
  // Attachments
  // -----------------------
  // eslint-disable-next-line @typescript-eslint/member-ordering
  onAttachmentsChange(event: Event): void {
    if (!this.hasSelectedProject) return;

    const input = event.target as HTMLInputElement | null;
    if (!input?.files || input.files.length === 0) return;

    const files = Array.from(input.files);

    // ✅ mark attachments as "loading" while FileReader is running
    this.pendingAttachmentReads += files.length;
    this.attachmentsLoading = true;

    files.forEach(file => {
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

        this.pendingAttachmentReads--;
        if (this.pendingAttachmentReads <= 0) {
          this.pendingAttachmentReads = 0;
          this.attachmentsLoading = false;
        }
      };

      fr.onerror = () => {
        this.pendingAttachmentReads--;
        if (this.pendingAttachmentReads <= 0) {
          this.pendingAttachmentReads = 0;
          this.attachmentsLoading = false;
        }
      };

      fr.readAsDataURL(file);
    });

    input.value = '';
  }

  // eslint-disable-next-line @typescript-eslint/member-ordering
  removeAttachment(index: number): void {
    if (!this.hasSelectedProject) return;

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
    // ✅ clear previous project's state immediately (prevents spreadsheet bleeding)
    this.project = null;
    this.projectName = '';
    this.mergeSubjectTemplate = '';
    this.mergeBodyTemplate = '';
    this.toField = '';
    this.ccField = '';
    this.bccField = '';
    this.showBcc = false;

    this.attachments = [];
    this.deletedAttachmentIds = [];
    this.attachmentsLoading = false;
    this.sendMenuOpen = false;

    this.removeSpreadsheet();
    this.previewEmails = [];

    // ✅ always land on compose when opening a project
    this.activePanel = 'compose';

    forkJoin({
      sig: this.signatureService.get().pipe(catchError(() => of(''))),
      p: this.projectService.find(id),
    }).subscribe({
      next: ({ sig, p }) => {
        // ✅ signature loaded FIRST
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        this.signatureSaved = (sig ?? '').trim();
        this.signatureDraft = this.signatureSaved;

        // ✅ then apply it to the project content
        this.project = p;
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        this.projectName = p.name ?? '';
        this.mergeSubjectTemplate = p.header ?? '';
        this.mergeBodyTemplate = this.upsertSignature(p.content ?? '', this.signatureSaved);

        this.toField = (p as any).toField ?? '';
        this.ccField = (p as any).ccField ?? '';
        this.bccField = (p as any).bccField ?? '';
        this.showBcc = !!this.bccField.trim();

        // ✅ remember stored spreadsheet filename (so UI shows it)
        this.mergeFileName = (p as any).spreadsheetName ?? null;

        if (p.spreadsheetLink) {
          this.spreadsheetBase64 = p.spreadsheetLink;
          this.spreadsheetFileContentType = (p as any).spreadsheetFileContentType ?? 'application/octet-stream';

          const byteCharacters = atob(p.spreadsheetLink);
          const byteNumbers = new Array(byteCharacters.length);
          for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
          }
          const byteArray = new Uint8Array(byteNumbers);

          const restoredName = (p as any).spreadsheetName ?? 'uploaded_spreadsheet.xlsx';

          const file = new File([byteArray], restoredName, {
            type: this.spreadsheetFileContentType!,
          });

          this.loadSpreadsheetFile(file);
        }

        this.attachmentsLoading = true;

        this.attachmentService
          .findByProject(id)
          .pipe(
            finalize(() => {
              // ✅ DB load finished; keep loading true only if local FileReader reads are still running
              this.attachmentsLoading = this.pendingAttachmentReads > 0;
            }),
          )
          .subscribe({
            next: attachments => {
              this.attachments = attachments.map(a => ({
                id: a.id,
                name: a.name,
                size: a.size,
                fileContentType: a.fileContentType,
                base64: a.file,
              }));

              this.previewMerge();
              setTimeout(() => {
                (['body', 'subject', 'to', 'cc', 'bcc'] as MergeField[]).forEach(f => this.renderTokens(f));
              });
            },
            error(err) {
              console.error('❌ Failed to load attachments', err);
            },
          });

        this.previewMerge();
        this.loadProjects();

        // ✅ ensure body editor shows the signature immediately
        setTimeout(() => this.renderTokens('body'));
      },
      error: err => {
        console.error('❌ Failed to load project/signature', err);
        this.clearEditorState();
        void this.router.navigate(['/mail']);
      },
    });
  }

  // -----------------------
  // Email validation helpers
  // -----------------------

  private isTokenTemplate(s: string): boolean {
    return /{{\s*[^}]+\s*}}/.test(s || '');
  }

  // A pragmatic email validator (good UX). Not RFC-perfect, but catches obvious bad inputs.
  private isValidEmail(email: string): boolean {
    const e = (email || '').trim();
    if (!e) return false;
    if (e.length > 254) return false;

    // no spaces
    if (/\s/.test(e)) return false;

    // basic structure
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!re.test(e)) return false;

    // domain must have a dot and not end with dot
    const parts = e.split('@');
    const domain = parts[1] || '';
    if (!domain.includes('.')) return false;
    if (domain.endsWith('.')) return false;

    return true;
  }

  // Replace {{token}} occurrences using a row object
  private replaceTokens(template: string, row: Record<string, string>): string {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    let out = template ?? '';

    Object.entries(row).forEach(([key, value]) => {
      const safeKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`{{\\s*${safeKey}\\s*}}`, 'g');
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      out = out.replace(regex, String(value ?? ''));
    });

    return out;
  }

  /**
   * Validates the "To" field for:
   * - literal email(s) (comma/semicolon separated)
   * - token templates like {{email}}
   * And catches wrong token usage like {{name}} that resolves to a non-email value.
   */
  private validateToForAllRows(): { ok: true } | { ok: false; message: string } {
    const toTemplate = (this.toField || '').trim();
    if (!toTemplate) {
      return { ok: false, message: 'The “To” field is required.' };
    }

    // If To contains tokens, validate by row
    if (this.isTokenTemplate(toTemplate)) {
      // Need spreadsheet rows to validate token resolution
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (!this.spreadsheetRows || this.spreadsheetRows.length === 0) {
        return { ok: false, message: 'Connect a spreadsheet so “To” tokens can be validated.' };
      }

      // Extract token keys used in the To template (for better error messaging)
      const tokenKeys = Array.from(toTemplate.matchAll(/{{\s*([^}]+)\s*}}/g)).map(m => (m[1] || '').trim());

      for (let i = 0; i < this.spreadsheetRows.length; i++) {
        const row = this.spreadsheetRows[i];
        const resolved = this.replaceTokens(toTemplate, row).trim();

        // If template uses tokens but none of them ever produce an email,
        // it's very likely the user used the wrong column (e.g. {{name}}).
        const anyTokenProducedEmail = tokenKeys.some(k => this.isValidEmail(String((row as any)[k] ?? '').trim()));
        if (!anyTokenProducedEmail) {
          return {
            ok: false,
            message: `Row ${i + 1}: “To” must resolve to an email address. It looks like you used a non-email column (e.g. {{name}}). Use an email column such as {{email}}.`,
          };
        }

        // Now validate resolved output supports multiple recipients too
        const recipients = resolved
          .split(/[;,]/)
          .map(s => s.trim())
          .filter(Boolean);

        if (recipients.length === 0) {
          return { ok: false, message: `Row ${i + 1}: “To” resolved to empty. Check your tokens.` };
        }

        const bad = recipients.find(r => !this.isValidEmail(r));
        if (bad) {
          return {
            ok: false,
            message: `Row ${i + 1}: invalid email in “To” after token replacement: “${bad}”.`,
          };
        }
      }

      return { ok: true };
    }

    // Literal email(s) case (no tokens)
    const recipients = toTemplate
      .split(/[;,]/)
      .map(s => s.trim())
      .filter(Boolean);

    if (recipients.length === 0) {
      return { ok: false, message: 'The “To” field must contain at least one email address.' };
    }

    const bad = recipients.find(r => !this.isValidEmail(r));
    if (bad) {
      return { ok: false, message: `Invalid email in “To”: “${bad}”.` };
    }

    return { ok: true };
  }

  // Optional: small helper so send/test share the same guard
  private guardBeforeSendOrTest(): boolean {
    // Sync editors → model
    this.onEditorInput('to');
    this.onEditorInput('cc');
    this.onEditorInput('bcc');

    // To = REQUIRED
    const toResult = this.validateEmailFieldForAllRows('to', true);
    if (!toResult.ok) {
      this.showValidationError(toResult.message);
      return false;
    }

    // Cc = OPTIONAL
    const ccResult = this.validateEmailFieldForAllRows('cc', false);
    if (!ccResult.ok) {
      this.showValidationError(ccResult.message);
      return false;
    }

    // Bcc = OPTIONAL
    const bccResult = this.validateEmailFieldForAllRows('bcc', false);
    if (!bccResult.ok) {
      this.showValidationError(bccResult.message);
      return false;
    }

    return true;
  }

  private validateEmailFieldForAllRows(field: 'to' | 'cc' | 'bcc', required: boolean): { ok: true } | { ok: false; message: string } {
    const template = field === 'to' ? this.toField : field === 'cc' ? this.ccField : this.bccField;

    if (!template.trim()) {
      return required ? { ok: false, message: 'The “To” field is required.' } : { ok: true };
    }

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (!this.spreadsheetRows || this.spreadsheetRows.length === 0) {
      return { ok: true };
    }

    for (let i = 0; i < this.spreadsheetRows.length; i++) {
      const row = this.spreadsheetRows[i];
      const resolved = this.replaceTokens(template, row).trim();

      if (!resolved) {
        if (required) {
          return {
            ok: false,
            message: `Row ${i + 1}: “To” resolves to empty. Use a valid email column.`,
          };
        }
        continue;
      }

      const emails = resolved
        .split(',')
        .map(e => e.trim())
        .filter(Boolean);

      for (const email of emails) {
        if (!this.isValidEmail(email)) {
          return {
            ok: false,
            message: `Row ${i + 1}: Invalid email in ${field.toUpperCase()}: “${email}”`,
          };
        }
      }
    }

    return { ok: true };
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

      // ✅ NEW: persist original filename
      spreadsheetName: hasSpreadsheet ? (this.oneDriveSpreadsheetName ?? this.mergeFileName ?? this.mergeFile?.name ?? null) : null,
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

      // ✅ NEW: persist original filename
      spreadsheetName: hasSpreadsheet ? (this.oneDriveSpreadsheetName ?? this.mergeFileName ?? this.mergeFile?.name ?? null) : null,
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
    this.testErr.set(false); // in testProject()
    this.mergeErr.set(false); // in sendProject()
    if (!this.projectId || !this.mergeFile) {
      this.testErr.set(true);
      this.showToast('warn', 'Connect a spreadsheet before sending a test email.');
      return;
    }

    if (this.attachmentsLoading) {
      this.showToast('warn', 'Attachments are still loading, please wait a moment.');
      return;
    }

    // ✅ NEW: validate To (including token resolution)
    // ✅ NEW: validate To (including token resolution)
    if (!this.guardBeforeSendOrTest()) {
      return; // ⬅ stop cleanly, no stuck UI
    }

    this.testSending.set(true);
    this.testErr.set(false);
    this.testSuccess = false;

    const { htmlWithCid, inlineImages } = this.buildEmailHtmlForSending(this.mergeBodyTemplate);

    this.saveProjectAndReturnObservable().subscribe({
      next: () => {
        const payload = {
          subjectTemplate: this.mergeSubjectTemplate,
          bodyTemplate: htmlWithCid,
          inlineImages,
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
            this.showToast('ok', 'Test email sent.');
            setTimeout(() => (this.testSuccess = false), 3000);
          },
          error: err => {
            console.error('❌ Test send failed', err);
            this.testSending.set(false);
            this.testErr.set(true);
            this.showToast('error', 'Test send failed. Please try again.');
          },
        });
      },
      error: err => {
        console.error('❌ Save-before-test failed', err);
        this.testSending.set(false);
        this.testErr.set(true);
        this.showToast('error', 'Could not save before test send.');
      },
    });
  }

  // eslint-disable-next-line @typescript-eslint/member-ordering
  sendProject(): void {
    this.testErr.set(false); // in testProject()
    this.mergeErr.set(false); // in sendProject()
    if (!this.projectId || !this.mergeFile) {
      this.mergeErr.set(true);
      this.showToast('warn', 'Connect a spreadsheet before sending.');
      return;
    }

    if (this.attachmentsLoading) {
      this.showToast('warn', 'Attachments are still loading, please wait a moment.');
      return;
    }

    // ✅ NEW: validate To (including token resolution)
    // ✅ NEW: validate To (including token resolution)
    if (!this.guardBeforeSendOrTest()) {
      return; // ⬅ clean exit
    }

    this.mergeSending.set(true);
    this.mergeErr.set(false);

    this.sendingProgress = 0;
    this.sendingTotal = 0;
    this.sendingInProgress = true;
    this.progressLogs = [];
    this.sendingFinished = false;

    const { htmlWithCid, inlineImages } = this.buildEmailHtmlForSending(this.mergeBodyTemplate);

    this.saveProjectAndReturnObservable().subscribe({
      next: () => {
        const payload = {
          subjectTemplate: this.mergeSubjectTemplate,
          bodyTemplate: htmlWithCid,
          inlineImages,
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
                spreadsheetName: this.connectedSpreadsheetName,
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
            this.showToast('error', 'Send failed. Please try again.');
          },
        });
      },
      error: err => {
        console.error('❌ Save-before-send failed', err);
        this.mergeSending.set(false);
        this.mergeErr.set(true);
        this.showToast('error', 'Could not save before sending.');
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
    if (!this.spreadsheetBase64) return;

    const blob = this.base64ToBlob(this.spreadsheetBase64, this.spreadsheetFileContentType ?? 'application/octet-stream');
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;

    // ✅ download with the stored name if mergeFile is rehydrated or missing
    a.download = this.mergeFile?.name ?? this.mergeFileName ?? 'spreadsheet.xlsx';

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

        // ✅ keep it visible for 2s after completion
        if (this.sendingFinishedTimeoutId) {
          clearTimeout(this.sendingFinishedTimeoutId);
          this.sendingFinishedTimeoutId = null;
        }

        this.sendingFinishedTimeoutId = setTimeout(() => {
          this.sendingFinished = false;
          this.sendingFinishedTimeoutId = null;
        }, 2000);
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

    // ✅ Protect links/images (esp. data: base64 images) before sending to AI
    const { safeText, map } = this.protectRichContentForAi(this.mergeBodyTemplate);
    this.lastAiPlaceholderMap = map;

    this.isRewriting = true;
    this.aiSelectedTone = tone;
    this.aiRewrittenText = '';
    this.aiRewrittenPreview = null;

    this.aiRewriteService.rewrite(safeText, selectedTone).subscribe({
      next: res => {
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        const rewritten = res.rewrittenText ?? '';

        // ✅ Restore protected links/images back into the rewritten markdown
        this.aiRewrittenText = this.restoreRichContentFromAi(rewritten, this.lastAiPlaceholderMap);

        // ✅ Convert to HTML and decorate merge tokens for consistent UI
        let html = this.convertMarkdownToHtml(this.aiRewrittenText || '');
        html = this.decorateTokensInHtml(html);

        this.aiRewrittenPreview = this.sanitizer.bypassSecurityTrustHtml(html);
        this.isRewriting = false;
      },
      error: () => {
        this.showToast('error', 'AI rewriting failed. Try again.');
        this.isRewriting = false;
        this.lastAiPlaceholderMap = null;
      },
    });
  }

  // eslint-disable-next-line @typescript-eslint/member-ordering
  applyRewrittenEmail(): void {
    if (!this.aiRewrittenText) return;

    // ✅ Only update the body. Do NOT touch subject/to/cc/bcc.
    this.mergeBodyTemplate = this.aiRewrittenText;

    // ✅ Clear placeholder map once applied
    this.lastAiPlaceholderMap = null;

    // ✅ Refresh preview model
    this.previewMerge();

    // ✅ Return to compose view
    this.activePanel = 'compose';

    // ✅ Critical: contenteditable fields need to be re-hydrated after panel swap
    // (otherwise they look empty even though TS fields still have values)
    setTimeout(() => {
      (['to', 'cc', 'bcc', 'subject', 'body'] as MergeField[]).forEach(f => this.renderTokens(f));
    }, 0);
  }

  // -----------------------
  // AI rewrite: protect rich content (links/images) with placeholders
  // -----------------------
  // eslint-disable-next-line @typescript-eslint/member-ordering
  private lastAiPlaceholderMap: Record<string, string> | null = null;

  private protectRichContentForAi(md: string): { safeText: string; map: Record<string, string> } {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    let text = md ?? '';
    const map: Record<string, string> = {};
    let linkIdx = 0;
    let imgIdx = 0;

    // 1) Protect HTML <img ...> (especially data: URLs)
    // Keep the entire tag so you restore exactly what the editor had.
    text = text.replace(/<img\b[^>]*>/gi, m => {
      imgIdx++;
      const token = `⟦MM_IMG_${imgIdx}⟧`;
      map[token] = m;
      return token;
    });

    // 2) Protect HTML links: <a href="https://...">text</a>
    // Convert to your markdown format so it round-trips through convertMarkdownToHtml().
    text = text.replace(/<a\b[^>]*href="(https:\/\/[^"]+)"[^>]*>(.*?)<\/a>/gi, (_m, url: string, label: string) => {
      linkIdx++;
      const token = `⟦MM_LINK_${linkIdx}⟧`;
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      const cleanLabel = String(label ?? '')
        .replace(/\s+/g, ' ')
        .trim();
      map[token] = `[${cleanLabel || url}](${url})`;
      return token;
    });

    // 3) Protect Markdown links: [text](https://...)
    text = text.replace(/\[([^\]]+)\]\((https:\/\/[^\s)]+)\)/g, (_m, label: string, url: string) => {
      linkIdx++;
      const token = `⟦MM_LINK_${linkIdx}⟧`;
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      map[token] = `[${String(label ?? '').trim() || url}](${url})`;
      return token;
    });

    return { safeText: text, map };
  }

  private restoreRichContentFromAi(md: string, map: Record<string, string> | null): string {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    let out = md ?? '';
    if (!map) return out;

    // Replace tokens back to original markup
    Object.keys(map).forEach(token => {
      // replaceAll without needing ES2021 lib assumption
      out = out.split(token).join(map[token]);
    });

    return out;
  }

  // -----------------------
  // Editor input + tokens
  // -----------------------
  // eslint-disable-next-line @typescript-eslint/member-ordering
  onEditorInput(field: MergeField): void {
    if (!this.hasSelectedProject) return;

    const el = document.getElementById(this.getElementId(field));
    if (!el) return;

    // ✅ NEW: convert a freshly typed {{token}} into a chip *in-place* (no full rerender)
    // This avoids caret jumping / "weird" behaviour.
    this.tryConvertTypedTokenAtCaret(field, el);

    let html = el.innerHTML;

    // Keep your existing span->{{}} normalization
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
    if (!this.hasSelectedProject) return;
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

    // ✅ Only wrap tokens that match a spreadsheet header
    html = html.replace(/{{\s*([^}]+)\s*}}/g, (_m, rawKey: string) => {
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      const key = String(rawKey ?? '').trim();
      if (!this.isKnownMergeField(key)) {
        return `{{${key}}}`; // leave as plain text
      }
      return `<span class="merge-token" data-field="${this.escapeAttr(key)}" contenteditable="false" style="background:${this.getColorForField(
        key,
      )}">${this.escapeHtml(key)}</span>`;
    });

    el.innerHTML = html;
  }

  private decorateTokensInHtml(html: string): string {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    const src = html ?? '';

    return src.replace(/{{\s*([^}]+)\s*}}/g, (_m, rawKey: string) => {
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      const key = String(rawKey ?? '').trim();
      if (!this.isKnownMergeField(key)) return `{{${key}}}`;

      return `<span class="merge-token" data-field="${this.escapeAttr(key)}" contenteditable="false" style="background:${this.getColorForField(
        key,
      )}">${this.escapeHtml(key)}</span>`;
    });
  }

  // Prevent recursion during DOM mutation
  // eslint-disable-next-line @typescript-eslint/member-ordering
  private autoTokenInsertInProgress = false;

  private isKnownMergeField(key: string): boolean {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    const k = (key ?? '').trim();

    return !!k && Array.isArray(this.spreadsheetHeaders) && this.spreadsheetHeaders.includes(k);
  }

  private escapeAttr(s: string): string {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    return String(s ?? '').replace(/"/g, '&quot;');
  }

  private escapeHtml(s: string): string {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  /**
   * If user just typed a token like {{name}} and "name" is a known merge field,
   * replace that exact text range with a <span class="merge-token"> chip WITHOUT re-rendering the whole editor.
   *
   * This is what prevents the "weird" contenteditable behaviour.
   */
  private tryConvertTypedTokenAtCaret(field: MergeField, rootEl: HTMLElement): void {
    // Only do this when a spreadsheet exists (because merge fields come from headers)
    if (!this.spreadsheetHeaders.length) return;
    if (this.autoTokenInsertInProgress) return;

    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;

    const caretRange = sel.getRangeAt(0);
    if (!caretRange.collapsed) return;

    // Ensure caret is inside the current editor element
    const common = caretRange.commonAncestorContainer;
    const commonEl = common instanceof Element ? common : common.parentElement;
    if (!commonEl || !rootEl.contains(commonEl)) return;

    // Build text from start of editor -> caret (kept small-ish)
    const pre = document.createRange();
    pre.selectNodeContents(rootEl);
    pre.setEnd(caretRange.endContainer, caretRange.endOffset);

    const preText = pre.toString();
    if (!preText) return;

    // Only trigger when the user closes a token with }}
    if (!preText.endsWith('}}')) return;

    // Grab the tail to search (avoid huge strings)
    const tail = preText.slice(Math.max(0, preText.length - 200));

    // Match a token at the very end: {{ something }}
    // - disallow braces inside
    // - allow spaces in the token name (if your headers can have spaces)
    const m = tail.match(/{{\s*([^{}]+?)\s*}}$/);
    if (!m) return;

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    const key = (m[1] ?? '').trim();
    if (!this.isKnownMergeField(key)) return;

    const matchLen = m[0].length;
    const tokenEndGlobal = preText.length;
    const tokenStartGlobal = tokenEndGlobal - matchLen;

    // Build a DOM range covering exactly the token text (best-effort for typical typing)
    const tokenRange = this.makeRangeFromTextOffsets(rootEl, tokenStartGlobal, tokenEndGlobal);
    if (!tokenRange) return;

    this.autoTokenInsertInProgress = true;
    try {
      // Replace token text with the chip
      const span = document.createElement('span');
      span.className = 'merge-token';
      span.setAttribute('data-field', key);
      span.setAttribute('contenteditable', 'false');
      span.setAttribute('style', `background:${this.getColorForField(key)}`);
      span.textContent = key;

      tokenRange.deleteContents();
      tokenRange.insertNode(span);

      // Add a trailing space so the user can continue typing naturally
      const space = document.createTextNode('\u00A0');
      span.after(space);

      // Move caret after the inserted space
      const newRange = document.createRange();
      newRange.setStartAfter(space);
      newRange.collapse(true);

      sel.removeAllRanges();
      sel.addRange(newRange);
    } finally {
      this.autoTokenInsertInProgress = false;
    }
  }

  /**
   * Map "text offsets within rootEl's visible text" -> DOM Range.
   * Note: This is best-effort and works well for normal typing in your editors.
   */
  private makeRangeFromTextOffsets(rootEl: HTMLElement, start: number, end: number): Range | null {
    if (start < 0 || end < start) return null;

    const tw = document.createTreeWalker(rootEl, NodeFilter.SHOW_TEXT);
    let current: Node | null = tw.nextNode();
    let pos = 0;

    let startNode: Text | null = null;
    let startOffset = 0;
    let endNode: Text | null = null;
    let endOffset = 0;

    while (current) {
      const t = current as Text;
      const len = t.data.length;

      if (!startNode && pos + len >= start) {
        startNode = t;
        startOffset = Math.max(0, start - pos);
      }
      if (pos + len >= end) {
        endNode = t;
        endOffset = Math.max(0, end - pos);
        break;
      }

      pos += len;
      current = tw.nextNode();
    }

    if (!startNode || !endNode) return null;

    const r = document.createRange();
    r.setStart(startNode, startOffset);
    r.setEnd(endNode, endOffset);
    return r;
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
    if (!this.hasSelectedProject) return;

    event.preventDefault();
    event.stopPropagation();

    // Restore last known selection (clicking toolbar steals focus)
    this.restoreBodySelection();

    // Apply formatting
    this.applyFormatting(type);
  }

  // eslint-disable-next-line @typescript-eslint/member-ordering
  applyFormatting(type: 'bold' | 'italic' | 'underline'): void {
    if (!this.hasSelectedProject) return;

    const bodyEl = document.getElementById('mergeBody');
    if (!bodyEl) return;

    bodyEl.focus();

    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;

    // If user just has a caret, select the word under caret (so toggling works)
    this.expandSelectionToWordIfCollapsed(sel, bodyEl);

    if (!sel.toString()) return;

    // Ensure selection is inside mergeBody
    const range = sel.getRangeAt(0);
    const common = range.commonAncestorContainer;
    const commonEl = common instanceof Element ? common : common.parentElement;
    if (!commonEl || !bodyEl.contains(commonEl)) return;

    if (type === 'bold') {
      // ✅ Deterministic bold toggle (no execCommand)
      this.toggleStrongOnSelection(sel, bodyEl);
    } else {
      // Keep existing behaviour for italic/underline (they’re working)
      const command = type === 'italic' ? 'italic' : 'underline';
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      document.execCommand(command, false);
    }

    // Save selection AFTER changes
    this.saveBodySelection();

    // Sync editor -> markdown
    this.onEditorInput('body');

    // Keep preview updated
    this.previewMerge();
  }

  /**
   * Toggle <strong> on current selection deterministically:
   * - If selection is fully bold (all within <strong>) -> unwrap strong within selection
   * - Else -> wrap selection in <strong>
   */
  private toggleStrongOnSelection(sel: Selection, bodyEl: HTMLElement): void {
    if (!sel.rangeCount) return;

    const range = sel.getRangeAt(0);
    if (range.collapsed) return;

    // If selection is already fully within <strong>, unwrap; otherwise wrap.
    const fullyBold = this.selectionIsFullyInStrong(range, bodyEl);

    if (fullyBold) {
      this.unwrapStrongInRange(range, bodyEl);
    } else {
      this.wrapRangeWithStrong(range);
    }

    // Re-establish selection to cover the same visual content
    // (Range objects can get stale after DOM ops)
    try {
      sel.removeAllRanges();
      sel.addRange(range);
    } catch {
      // ignore
    }
  }

  private selectionIsFullyInStrong(range: Range, root: HTMLElement): boolean {
    // Quick heuristic:
    // - Check start and end containers are within <strong>
    // - And any text nodes inside the range are also within <strong>
    const startStrong = this.closestTag(range.startContainer, 'STRONG', root);
    const endStrong = this.closestTag(range.endContainer, 'STRONG', root);
    if (!startStrong || !endStrong) return false;

    // Walk text nodes in range and ensure each one is inside a STRONG
    const walker = document.createTreeWalker(range.commonAncestorContainer, NodeFilter.SHOW_TEXT, {
      acceptNode(node: Node) {
        if (!(node instanceof Text)) return NodeFilter.FILTER_REJECT;
        if (!node.data.trim()) return NodeFilter.FILTER_REJECT;

        // Check node intersects the range
        const nodeRange = document.createRange();
        nodeRange.selectNodeContents(node);

        const intersects =
          range.compareBoundaryPoints(Range.END_TO_START, nodeRange) < 0 && range.compareBoundaryPoints(Range.START_TO_END, nodeRange) > 0;

        return intersects ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      },
    } as any);

    let n: Node | null;
    while ((n = walker.nextNode())) {
      const strong = this.closestTag(n, 'STRONG', root);
      if (!strong) return false;
    }

    return true;
  }

  private wrapRangeWithStrong(range: Range): void {
    // Extract contents and wrap in <strong>
    const strong = document.createElement('strong');
    const frag = range.extractContents();
    strong.appendChild(frag);
    range.insertNode(strong);

    // Update range to select inside the new strong
    range.selectNodeContents(strong);
  }

  private unwrapStrongInRange(range: Range, root: HTMLElement): void {
    // Find all STRONG elements that intersect the range and unwrap them
    const strongs = Array.from(root.querySelectorAll('strong')).filter(s => this.nodeIntersectsRange(s, range));
    strongs.forEach(s => this.unwrapElement(s));
  }

  private unwrapElement(el: HTMLElement): void {
    const parent = el.parentNode;
    if (!parent) return;

    while (el.firstChild) {
      parent.insertBefore(el.firstChild, el);
    }
    parent.removeChild(el);
  }

  private nodeIntersectsRange(node: Node, range: Range): boolean {
    const nodeRange = document.createRange();
    try {
      nodeRange.selectNode(node);
    } catch {
      // some nodes can't be selected; fallback to contents
      nodeRange.selectNodeContents(node);
    }

    return range.compareBoundaryPoints(Range.END_TO_START, nodeRange) < 0 && range.compareBoundaryPoints(Range.START_TO_END, nodeRange) > 0;
  }

  private closestTag(node: Node, tag: string, stopAt: HTMLElement): HTMLElement | null {
    let cur: Node | null = node instanceof Element ? node : node.parentNode;
    while (cur && cur !== stopAt) {
      if (cur instanceof HTMLElement && cur.tagName === tag) return cur;
      cur = cur.parentNode;
    }
    // also allow the stopAt itself
    if (stopAt.tagName === tag) return stopAt;
    return null;
  }

  // eslint-disable-next-line @typescript-eslint/member-ordering
  protected saveBodySelection(): void {
    const bodyEl = document.getElementById('mergeBody');
    const sel = window.getSelection();
    if (!bodyEl || !sel || sel.rangeCount === 0) return;

    const range = sel.getRangeAt(0);
    const common = range.commonAncestorContainer;
    const commonEl = common instanceof Element ? common : common.parentElement;

    if (commonEl && bodyEl.contains(commonEl)) {
      this.savedBodyRange = range.cloneRange();
    }
  }

  private restoreBodySelection(): void {
    const bodyEl = document.getElementById('mergeBody');
    const sel = window.getSelection();
    if (!bodyEl || !sel || !this.savedBodyRange) return;

    bodyEl.focus();

    try {
      sel.removeAllRanges();
      sel.addRange(this.savedBodyRange);
    } catch {
      // If the DOM changed and the saved range became invalid, just drop it.
      this.savedBodyRange = null;
    }
  }

  private expandSelectionToWordIfCollapsed(sel: Selection, bodyEl: HTMLElement): void {
    if (!sel.rangeCount) return;

    const range = sel.getRangeAt(0);
    if (!range.collapsed) return;

    // Make sure caret is inside mergeBody
    const common = range.commonAncestorContainer;
    const commonEl = common instanceof Element ? common : common.parentElement;
    if (!commonEl || !bodyEl.contains(commonEl)) return;

    // We only handle the common case: caret is in a Text node
    const node = range.startContainer;
    if (!(node instanceof Text)) return;

    const text = node.data;
    const idx = range.startOffset;

    if (!text || idx < 0 || idx > text.length) return;

    // Find word boundaries around caret
    // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
    const isWordChar = (c: string) => /[A-Za-z0-9_]/.test(c);

    let start = idx;
    let end = idx;

    // If caret is between characters, try to snap into a word
    if (start > 0 && !isWordChar(text[start]) && isWordChar(text[start - 1])) start--;

    while (start > 0 && isWordChar(text[start - 1])) start--;
    while (end < text.length && isWordChar(text[end])) end++;

    if (start === end) return; // no word found

    const wordRange = document.createRange();
    wordRange.setStart(node, start);
    wordRange.setEnd(node, end);

    sel.removeAllRanges();
    sel.addRange(wordRange);

    // Also store it so toolbar click can restore it reliably
    this.savedBodyRange = wordRange.cloneRange();
  }

  private htmlToMarkdown(html: string): string {
    return (
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      (html ?? '')
        // ✅ HTTPS-only: <a href="https://...">text</a> -> [text](https://...)
        .replace(/<a[^>]*href="(https:\/\/[^"]+)"[^>]*>(.*?)<\/a>/gi, '[$2]($1)')

        // ✅ Handle span-based formatting produced by execCommand in some browsers
        // Bold spans: font-weight: bold / 700 / 800 / 900
        // Bold spans: font-weight: bold / 600 / 700 / 800 / 900
        .replace(/<span[^>]*style="[^"]*font-weight\s*:\s*(bold|600|700|800|900)[^"]*"[^>]*>(.*?)<\/span>/gi, '**$2**')
        // Italic spans
        .replace(/<span[^>]*style="[^"]*font-style\s*:\s*italic[^"]*"[^>]*>(.*?)<\/span>/gi, '_$1_')
        // Underline spans
        .replace(/<span[^>]*style="[^"]*text-decoration\s*:\s*underline[^"]*"[^>]*>(.*?)<\/span>/gi, '~$1~')

        // ✅ Normal tag-based formatting
        .replace(/<strong[^>]*>(.*?)<\/strong>/gi, '**$1**')
        .replace(/<b[^>]*>(.*?)<\/b>/gi, '**$1**')
        .replace(/<i[^>]*>(.*?)<\/i>/gi, '_$1_')
        .replace(/<em[^>]*>(.*?)<\/em>/gi, '_$1_')
        .replace(/<u[^>]*>(.*?)<\/u>/gi, '~$1~')

        // Line breaks / spacing
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/&nbsp;/g, ' ')
        .trim()
    );
  }

  private convertMarkdownToHtml(md: string): string {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    const src = md ?? '';

    // ✅ HTTPS-only markdown links: [text](https://example.com)
    const withLinks = src.replace(/\[([^\]]+)\]\((https:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

    return withLinks
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
    if (!this.hasSelectedProject) return;
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
  async openOneDrivePicker(): Promise<void> {
    if (!this.hasSelectedProject) return;

    this.spreadsheetSource = 'ONEDRIVE';
    this.oneDriveError = null;
    this.oneDriveLoading = true;

    // ✅ open popup immediately (must be directly from the click handler)
    const win = window.open('', 'Picker', 'width=1080,height=680');
    if (!win) {
      this.oneDriveError = 'Popup blocked. Please allow popups for this site and try again.';
      this.oneDriveLoading = false;
      return;
    }

    try {
      const { name, bytes } = await this.oneDrivePicker.pickExcelFileInWindow(win);
      this.oneDrivePickerVisible = false;
      this.handleOneDriveSelection(bytes, name);
    } catch (e: any) {
      const msg = e?.message ?? String(e);
      this.oneDriveError = msg.includes('Popup blocked') ? 'Popup blocked. Please allow popups for this site and try again.' : msg;
      try {
        win.close();
      } catch {
        /* empty */
      }
    } finally {
      this.oneDriveLoading = false;
    }
  }

  // eslint-disable-next-line @typescript-eslint/member-ordering
  selectOneDriveFile(file: OneDriveFileDto): void {
    if (!this.hasSelectedProject) return;

    this.oneDriveLoading = true;
    this.oneDriveError = null;

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

    // ✅ keep the name around for UI + saving
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
    this.removeSpreadsheet();

    this.spreadsheetSource = 'ONEDRIVE';

    // ✅ set BOTH names explicitly
    this.oneDriveSpreadsheetName = fileName;
    this.mergeFileName = fileName;

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

    if (this.sidebarCollapsed) this.toggleSidebar();

    this.sendMenuOpen = false;
    void this.router.navigate(['/mail', p.id]);
  }

  get hasConnectedSpreadsheet(): boolean {
    return !!this.mergeFile; // mergeFile is set for BOTH Local + OneDrive
  }

  get connectedSpreadsheetName(): string {
    return this.oneDriveSpreadsheetName ?? this.mergeFile?.name ?? this.mergeFileName ?? 'Spreadsheet';
  }

  // -----------------------
  // Spreadsheet dropdown (Send/Save style) + preview toggle
  // -----------------------
  // eslint-disable-next-line @typescript-eslint/member-ordering
  toggleSpreadsheetMenu(): void {
    if (!this.hasSelectedProject) return;
    this.spreadsheetMenuOpen = !this.spreadsheetMenuOpen;
  }

  // eslint-disable-next-line @typescript-eslint/member-ordering
  chooseSpreadsheet(source: 'LOCAL' | 'ONEDRIVE'): void {
    if (!this.hasSelectedProject) return;

    // close menu first
    this.spreadsheetMenuOpen = false;

    // use your existing plumbing
    this.setSpreadsheetSource(source);
    this.connectSpreadsheet();
  }

  // eslint-disable-next-line @typescript-eslint/member-ordering
  toggleSpreadsheetPreview(event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();

    if (!this.hasSelectedProject) return;
    if (!this.hasConnectedSpreadsheet) return;

    this.spreadsheetPreviewOpen = !this.spreadsheetPreviewOpen;
  }

  // eslint-disable-next-line @typescript-eslint/member-ordering
  toggleBcc(): void {
    if (!this.hasSelectedProject) return;

    this.showBcc = !this.showBcc;

    if (this.showBcc) {
      setTimeout(() => document.getElementById('bccField')?.focus());
    }
  }

  // -----------------------
  // Undo Send (frontend-only)
  // -----------------------
  // eslint-disable-next-line @typescript-eslint/member-ordering
  queueSendProject(): void {
    if (!this.hasSelectedProject) return;
    if (this.sendQueued() || this.mergeSending()) return;

    if (!this.projectId || !this.mergeFile) {
      this.mergeErr.set(true);
      this.showToast('warn', 'Connect a spreadsheet before sending.');
      return;
    }

    if (this.attachmentsLoading) {
      this.showToast('warn', 'Attachments are still loading, please wait a moment.');
      return;
    }

    this.clearQueuedSendTimers();

    this.mergeErr.set(false);
    this.sendQueued.set(true);
    this.sendQueuedSeconds.set(10);

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

    this.sendQueuedTimeoutId = setTimeout(() => {
      this.clearQueuedSendTimers();
      this.sendQueued.set(false);
      this.sendQueuedSeconds.set(0);

      if (!this.projectId || !this.mergeFile) {
        this.mergeErr.set(true);
        this.showToast('warn', 'Connect a spreadsheet before sending.');
        return;
      }

      if (this.attachmentsLoading) {
        this.showToast('warn', 'Attachments are still loading, please wait a moment.');
        return;
      }

      this.sendProject();
    }, 10_000);
  }

  // eslint-disable-next-line @typescript-eslint/member-ordering
  undoQueuedSend(): void {
    if (!this.hasSelectedProject) return;
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

  // -----------------------
  // Signature helpers
  // -----------------------

  // eslint-disable-next-line @typescript-eslint/member-ordering
  saveSignature(): void {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    const sig = (this.signatureDraftHtml ?? '').trim();

    // capture whatever is currently in the email body editor
    this.onEditorInput('body');

    this.signatureService.update(sig).subscribe({
      next: () => {
        this.signatureSaved = sig;
        this.applySignatureToBody(); // already sets activePanel = 'compose'
        // (no signaturePanelOpen anymore)
      },
      error: err => console.error('❌ Failed to save signature', err),
    });
  }

  private stripSignatureBlock(body: string): string {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    const b = (body ?? '').replace(/\s+$/g, '');
    const idx = b.lastIndexOf(this.SIGN_DELIM);
    return idx >= 0 ? b.slice(0, idx).replace(/\s+$/g, '') : b;
  }

  private upsertSignature(body: string, signature: string): string {
    const base = this.stripSignatureBlock(body);
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    const sig = (signature ?? '').trim();
    if (!sig) return base;
    return base ? `${base}${this.SIGN_DELIM}${sig}` : sig;
  }

  private applySignatureToBody(): void {
    this.onEditorInput('body');
    this.mergeBodyTemplate = this.upsertSignature(this.mergeBodyTemplate, this.signatureSaved);
    this.previewMerge();
    this.activePanel = 'compose';
    setTimeout(() => this.renderTokens('body'));
  }

  // eslint-disable-next-line @typescript-eslint/member-ordering
  onEditorPaste(event: ClipboardEvent, where: 'body' | 'signature'): void {
    const items = event.clipboardData?.items;
    if (!items) return;

    const imageItem = Array.from(items).find(i => i.kind === 'file' && i.type.startsWith('image/'));
    if (!imageItem) return; // allow normal paste (text etc.)

    event.preventDefault();

    const file = imageItem.getAsFile();
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      // eslint-disable-next-line @typescript-eslint/no-base-to-string
      const dataUrl = String(reader.result ?? '');
      if (!dataUrl.startsWith('data:image/')) return;

      // Insert <img src="data:..."> at caret (so preview works)
      this.insertHtmlAtCaret(`<img src="${dataUrl}" style="max-width:220px;height:auto;" />`);

      // Sync your state
      if (where === 'body') this.onEditorInput('body');
      else this.onSignatureInput();
    };
    reader.readAsDataURL(file);
  }

  private insertHtmlAtCaret(html: string): void {
    const sel = window.getSelection();
    if (!sel?.rangeCount) return;

    const range = sel.getRangeAt(0);
    range.deleteContents();

    const temp = document.createElement('div');
    temp.innerHTML = html;

    const frag = document.createDocumentFragment();
    let node: ChildNode | null;
    let last: ChildNode | null = null;

    while ((node = temp.firstChild)) {
      last = frag.appendChild(node);
    }

    range.insertNode(frag);

    // move caret after inserted content
    if (last) {
      range.setStartAfter(last);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
    }
  }

  // eslint-disable-next-line @typescript-eslint/member-ordering
  toggleSignaturePanel(): void {
    this.setPanel('signature');
  }

  // eslint-disable-next-line @typescript-eslint/member-ordering
  onSignatureInput(): void {
    const el = document.getElementById('signatureEditor');
    if (!el) return;

    // store as your existing “markdown-ish” format (it will preserve <img>)
    this.signatureDraftHtml = this.htmlToMarkdown(el.innerHTML);
  }

  private buildEmailHtmlForSending(markdownBody: string): { htmlWithCid: string; inlineImages: InlineImage[] } {
    const html = this.convertMarkdownToHtml(markdownBody || '');
    const doc = new DOMParser().parseFromString(html, 'text/html');

    const inlineImages: InlineImage[] = [];
    const imgs = Array.from(doc.querySelectorAll('img'));

    imgs.forEach((img, idx) => {
      const src = img.getAttribute('src') ?? '';
      if (!src.startsWith('data:image/')) return;

      const match = src.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
      if (!match) return;

      const fileContentType = match[1];
      const base64 = match[2];

      // unique cid
      // eslint-disable-next-line @typescript-eslint/restrict-plus-operands
      const cid = `img_${(crypto as any).randomUUID ? crypto.randomUUID() : Date.now() + '_' + idx}`;
      const ext = fileContentType.split('/')[1] || 'png';

      inlineImages.push({
        cid,
        fileContentType,
        base64,
        name: `inline_${idx}.${ext}`,
      });

      // replace src with cid reference
      img.setAttribute('src', `cid:${cid}`);
    });

    return { htmlWithCid: doc.body.innerHTML, inlineImages };
  }

  // eslint-disable-next-line @typescript-eslint/member-ordering
  insertHttpsLink(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();

    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;

    const text = sel.toString().trim();
    if (!text) {
      // no alert() — just do nothing or show a subtle hint if you want
      return;
    }

    // Save the selection range so we can insert later even after focusing the modal input
    this.savedLinkRange = sel.getRangeAt(0).cloneRange();

    this.linkTextDraft = text;
    this.linkUrlDraft = 'https://';
    this.linkError = null;
    this.linkModalOpen = true;

    // focus the URL input after modal renders
    setTimeout(() => document.getElementById('mmLinkUrl')?.focus(), 0);
  }

  // eslint-disable-next-line @typescript-eslint/member-ordering
  closeLinkModal(): void {
    this.linkModalOpen = false;
    this.linkError = null;
    this.linkUrlDraft = '';
    this.linkTextDraft = '';
    this.savedLinkRange = null;
  }

  // eslint-disable-next-line @typescript-eslint/member-ordering
  confirmInsertLink(): void {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    const url = (this.linkUrlDraft ?? '').trim();
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    const text = (this.linkTextDraft ?? '').trim();

    if (!text) {
      this.linkError = 'Link text is required.';
      return;
    }

    if (!url.startsWith('https://')) {
      this.linkError = 'URL must start with https://';
      return;
    }

    // Restore the saved selection and insert
    const sel = window.getSelection();
    if (sel && this.savedLinkRange) {
      sel.removeAllRanges();
      sel.addRange(this.savedLinkRange);
    }

    this.insertHtmlAtCaret(`<a href="${url}" target="_blank" rel="noopener noreferrer">${text}</a>`);

    // Sync editor → markdown → preview
    this.onEditorInput('body');
    setTimeout(() => this.renderTokens('body'));

    this.closeLinkModal();
  }

  // -----------------------
  // Sidebar: Search / Filter
  // -----------------------

  // eslint-disable-next-line @typescript-eslint/member-ordering
  toggleFolder(key: 'PENDING' | 'FAILED' | 'SENT'): void {
    this.folderOpen[key] = !this.folderOpen[key];
  }

  private matchesSearch(p: Project, q: string): boolean {
    if (!q) return true;

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    const name = (p.name ?? '').toLowerCase();
    const status = String((p as any).status ?? '').toLowerCase(); // enum string or ''
    return name.includes(q) || status.includes(q);
  }

  get filteredAllProjects(): Project[] {
    const q = this.projectSearch.trim().toLowerCase();
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    const list = this.projects ?? [];
    if (!q) return list;
    return list.filter(p => this.matchesSearch(p, q));
  }

  // "No status yet" (newly created / not saved / etc.)
  get ungroupedProjects(): Project[] {
    return this.filteredAllProjects.filter(p => !(p as any).status);
  }

  get pendingProjects(): Project[] {
    return this.filteredAllProjects.filter(p => (p as any).status === 'PENDING');
  }

  get failedProjects(): Project[] {
    return this.filteredAllProjects.filter(p => (p as any).status === 'FAILED');
  }

  get sentProjects(): Project[] {
    return this.filteredAllProjects.filter(p => (p as any).status === 'SENT');
  }

  private showToast(type: 'warn' | 'error' | 'ok', text: string): void {
    this.uiToast = { type, text };
    setTimeout(() => (this.uiToast = null), 3000);
  }

  // -----------------------
  // Validation error handling
  // -----------------------
  private showValidationError(message: string): void {
    // Clear async error states so UI doesn't get stuck
    this.testErr.set(false);
    this.mergeErr.set(false);
    this.testSending.set(false);
    this.mergeSending.set(false);

    // Show a clear, actionable message
    this.showToast('error', message);
  }

  // eslint-disable-next-line @typescript-eslint/member-ordering
  openDeleteProjectModal(p: Project, event?: MouseEvent): void {
    event?.preventDefault();
    event?.stopPropagation();

    if (!p.id || this.deletingProject) return;

    this.deleteTargetId = p.id;
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    this.deleteTargetName = p.name ?? '';
    this.deleteConfirmOpen = true;
  }

  // eslint-disable-next-line @typescript-eslint/member-ordering
  cancelDeleteProject(): void {
    this.deleteConfirmOpen = false;
    this.deleteTargetId = null;
    this.deleteTargetName = '';
  }

  // eslint-disable-next-line @typescript-eslint/member-ordering
  confirmDeleteProject(): void {
    const deletingId = this.deleteTargetId;
    if (!deletingId) return;

    this.deleteConfirmOpen = false;
    this.deletingProject = true;

    // Hide in UI immediately
    this.pendingDeletedProjectIds.add(deletingId);
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    this.projects = (this.projects ?? []).filter(p => p.id !== deletingId);

    // If we deleted the currently open project, leave /mail/:id first
    const wasOpen = this.projectId === deletingId;
    if (wasOpen) {
      this.clearEditorState();
      void this.router.navigate(['/mail']);
    }

    this.projectService.delete(deletingId).subscribe({
      next: () => {
        this.pendingDeletedProjectIds.delete(deletingId);
        this.deletingProject = false;
        this.showToast('ok', 'Project deleted.');
        this.deleteTargetId = null;
        this.deleteTargetName = '';
        this.loadProjects();
      },
      error: err => {
        console.error('❌ Failed to delete project', err);
        this.pendingDeletedProjectIds.delete(deletingId);
        this.deletingProject = false;
        this.showToast('error', 'Failed to delete project. Please try again.');
        this.deleteTargetId = null;
        this.deleteTargetName = '';
        this.loadProjects();
      },
    });
  }

  // eslint-disable-next-line @typescript-eslint/member-ordering
  drawerOpen = { ai: false, preview: false };

  // eslint-disable-next-line @typescript-eslint/member-ordering
  toggleDrawer(which: 'ai' | 'preview'): void {
    this.drawerOpen[which] = !this.drawerOpen[which];
  }

  // eslint-disable-next-line @typescript-eslint/member-ordering
  toggleBottomPanel(which: 'preview' | 'ai'): void {
    if (which === 'preview') {
      this.bottomPreviewOpen = !this.bottomPreviewOpen;
      if (this.bottomPreviewOpen) {
        this.previewMerge(); // keep it fresh when opening
      }
      return;
    }

    this.bottomAiOpen = !this.bottomAiOpen;
  }

  // eslint-disable-next-line @typescript-eslint/member-ordering
  trackByRowIndex = (i: number): number => i;
}
