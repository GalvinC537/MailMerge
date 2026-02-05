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

/**
 * MergeField:
 * - The set of editable "fields" on the compose view.
 * - Used to map between:
 *   - editor DOM element ids (contenteditable divs)
 *   - TS model values (toField, mergeBodyTemplate, etc.)
 */
type MergeField = 'to' | 'cc' | 'bcc' | 'subject' | 'body';

/**
 * RightPanel:
 * - A single source of truth for the RHS panel state.
 * - Keeps HTML simpler (no multiple booleans fighting each other).
 */
type RightPanel = 'blank' | 'compose' | 'howto' | 'sheet' | 'ai' | 'preview' | 'signature';

/**
 * InlineImage:
 * - Represents a pasted inline base64 image that will be sent as an Outlook/Graph inline attachment.
 * - We rewrite <img src="data:image/..."> → <img src="cid:..."> and ship the image as a separate part.
 */
type InlineImage = { cid: string; fileContentType: string; base64: string; name: string };

@Component({
  standalone: true,
  selector: 'jhi-mail-dashboard',
  templateUrl: './mail-dashboard.component.html',
  styleUrls: ['./mail-dashboard.component.scss'],
  imports: [SharedModule, RouterModule, FormsModule],
})
export class MailDashboardComponent implements OnInit {
  // ===========================================================================
  // Dependency injection
  // ===========================================================================
  // These services are defined in other files and perform:
  // - ProjectService: CRUD for Project + "send mail merge" API calls (backend endpoint)
  // - AccountService: loads the logged-in Account object from JHipster auth
  // - LoginService: opens the login flow
  // - AttachmentService: CRUD attachments for a project (backend)
  // - AiRewriteService: calls your AI rewriting backend/endpoint
  // - OneDriveService: fetches file content from OneDrive via Microsoft Graph integration
  // - SignatureService: loads/saves a user signature (backend)
  // - OneDrivePickerV8Service: opens the OneDrive picker popup and returns selected bytes/name
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

  // ===========================================================================
  // Constants / internal flags
  // ===========================================================================
  /**
   * Signature delimiter used inside the markdown-ish body content.
   * This is used by stripSignatureBlock/upsertSignature to keep the signature stable.
   */
  private readonly SIGN_DELIM = '\n\n--\n';

  /**
   * Prevent token rendering recursion:
   * - renderTokens() mutates DOM → can trigger input handlers in some cases
   * - this flag acts as a safety break
   */
  private skipTokenRender = false;

  /**
   * Token insert guard for contenteditable:
   * - tryConvertTypedTokenAtCaret() does targeted DOM replacement
   * - this flag prevents re-entry during DOM mutation
   */

  private autoTokenInsertInProgress = false;

  /**
   * Used to restore selection after clicking toolbar buttons:
   * - Toolbar click steals focus → selection disappears
   * - We clone it and restore before applying formatting.
   */
  private savedBodyRange: Range | null = null;

  /**
   * Used to restore selection after opening the "insert link" modal:
   * - Modal focus steals selection
   * - We keep a clone to insert a link back into the original place.
   */
  private savedLinkRange: Range | null = null;

  /**
   * Tracks number of FileReader operations still in flight for attachments.
   * The UI uses attachmentsLoading to prevent sending while reads are ongoing.
   */
  private pendingAttachmentReads = 0;

  /**
   * Hide projects only while delete request is in flight:
   * - Avoids “ghost” projects reappearing briefly after optimistic UI removal.
   */
  private readonly pendingDeletedProjectIds = new Set<number>();
  private deletingProject = false;

  /**
   * Controls the "sending finished" UI visibility:
   * - We keep a 2s success indicator after progress reaches 100%.
   */
  private sendingFinishedTimeoutId: ReturnType<typeof setTimeout> | null = null;

  /**
   * "Undo send" (queue) timers:
   * - interval updates countdown seconds
   * - timeout triggers actual sendProject()
   */
  private sendQueuedTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private sendQueuedIntervalId: ReturnType<typeof setInterval> | null = null;

  // ===========================================================================
  // View references (hidden file inputs)
  // ===========================================================================
  // Hidden <input type=file> elements triggered by toolbar buttons (local uploads)
  // eslint-disable-next-line @typescript-eslint/member-ordering
  @ViewChild('mergeFileInput') mergeFileInput?: ElementRef<HTMLInputElement>;
  // eslint-disable-next-line @typescript-eslint/member-ordering
  @ViewChild('attachmentsInput') attachmentsInput?: ElementRef<HTMLInputElement>;

  // ===========================================================================
  // UI state: sidebar + routing
  // ===========================================================================

  // eslint-disable-next-line @typescript-eslint/member-ordering
  projects: Project[] = [];

  // eslint-disable-next-line @typescript-eslint/member-ordering
  sendMenuOpen = false;

  // eslint-disable-next-line @typescript-eslint/member-ordering
  sidebarCollapsed = false;

  // eslint-disable-next-line @typescript-eslint/member-ordering
  projectSearch = '';

  // eslint-disable-next-line @typescript-eslint/member-ordering
  folderOpen: Record<'PENDING' | 'FAILED' | 'SENT', boolean> = {
    PENDING: true,
    FAILED: false,
    SENT: false,
  };

  // eslint-disable-next-line @typescript-eslint/member-ordering
  creatingProject = false;

  // eslint-disable-next-line @typescript-eslint/member-ordering
  newProjectName = '';

  // eslint-disable-next-line @typescript-eslint/member-ordering
  deleteConfirmOpen = false;

  // eslint-disable-next-line @typescript-eslint/member-ordering
  deleteTargetId: number | null = null;

  // eslint-disable-next-line @typescript-eslint/member-ordering
  deleteTargetName = '';

  // ===========================================================================
  // Auth/account state
  // ===========================================================================

  // signal() keeps state reactive without needing RxJS Subjects in the component
  // eslint-disable-next-line @typescript-eslint/member-ordering
  account = signal<Account | null>(null);

  // ===========================================================================
  // Project/editor state
  // ===========================================================================

  // eslint-disable-next-line @typescript-eslint/member-ordering
  projectId: number | null = null;

  // eslint-disable-next-line @typescript-eslint/member-ordering
  project: Project | null = null;

  // eslint-disable-next-line @typescript-eslint/member-ordering
  projectName = '';

  // Templates stored as plain text / markdown-ish values:
  // - Subject/To/Cc/Bcc: stored as plain text (no HTML tags)
  // - Body: stored as markdown-ish (with your custom formatting rules)
  // eslint-disable-next-line @typescript-eslint/member-ordering
  mergeSubjectTemplate = '';

  // eslint-disable-next-line @typescript-eslint/member-ordering
  mergeBodyTemplate = '';

  // Address fields (plain text; can contain {{tokens}} and [[if]] blocks)
  // eslint-disable-next-line @typescript-eslint/member-ordering
  toField = '';

  // eslint-disable-next-line @typescript-eslint/member-ordering
  ccField = '';

  // eslint-disable-next-line @typescript-eslint/member-ordering
  bccField = '';

  // eslint-disable-next-line @typescript-eslint/member-ordering
  showBcc = false;

  /**
   * Merge spreadsheet (local or OneDrive):
   * - mergeFile holds a File instance (even if constructed from OneDrive bytes)
   * - spreadsheetBase64 is persisted in DB to rehydrate later
   */
  // eslint-disable-next-line @typescript-eslint/member-ordering
  mergeFile: File | null = null;

  // Used to remember/display filename even if spreadsheet is rehydrated from DB (where File instance is reconstructed)
  // eslint-disable-next-line @typescript-eslint/member-ordering
  mergeFileName: string | null = null;

  // eslint-disable-next-line @typescript-eslint/member-ordering
  spreadsheetBase64: string | null = null;

  // eslint-disable-next-line @typescript-eslint/member-ordering
  spreadsheetFileContentType: string | null = null;

  // Parsed spreadsheet
  // eslint-disable-next-line @typescript-eslint/member-ordering
  spreadsheetHeaders: string[] = [];

  // eslint-disable-next-line @typescript-eslint/member-ordering
  spreadsheetTable: string[][] = []; // used for preview table rendering

  // eslint-disable-next-line @typescript-eslint/member-ordering
  spreadsheetRows: Record<string, string>[] = []; // used for token replacement per row

  // Spreadsheet UI
  // eslint-disable-next-line @typescript-eslint/member-ordering
  spreadsheetMenuOpen = false;

  // eslint-disable-next-line @typescript-eslint/member-ordering
  spreadsheetPreviewOpen = false;

  // eslint-disable-next-line @typescript-eslint/member-ordering
  spreadsheetSource: 'LOCAL' | 'ONEDRIVE' = 'LOCAL';

  // eslint-disable-next-line @typescript-eslint/member-ordering
  oneDriveSpreadsheetName: string | null = null;

  // eslint-disable-next-line @typescript-eslint/member-ordering
  oneDriveLoading = false;

  // eslint-disable-next-line @typescript-eslint/member-ordering
  oneDriveFiles: OneDriveFileDto[] = [];

  // eslint-disable-next-line @typescript-eslint/member-ordering
  oneDrivePickerVisible = false;

  // eslint-disable-next-line @typescript-eslint/member-ordering
  oneDriveError: string | null = null;

  // (legacy var; safe to remove once HTML stops referencing it)
  // eslint-disable-next-line @typescript-eslint/member-ordering
  spreadsheetPreviewVisible = false;

  // ===========================================================================
  // Attachments state
  // ===========================================================================

  // Attachments can be:
  // - Existing (from DB): have id and base64 already saved
  // - New local uploads: no id yet; base64 created via FileReader
  // eslint-disable-next-line @typescript-eslint/member-ordering
  attachments: { id?: number; name: string; size: number; fileContentType: string; base64: string }[] = [];

  // eslint-disable-next-line @typescript-eslint/member-ordering
  deletedAttachmentIds: number[] = [];

  // eslint-disable-next-line @typescript-eslint/member-ordering
  attachmentsLoading = false;

  // ===========================================================================
  // Signature state
  // ===========================================================================

  // eslint-disable-next-line @typescript-eslint/member-ordering
  signatureSaved = '';

  // eslint-disable-next-line @typescript-eslint/member-ordering
  signatureDraft = '';

  // Draft html (really “markdown-ish” based on htmlToMarkdown() conversion)
  // eslint-disable-next-line @typescript-eslint/member-ordering
  signatureDraftHtml = '';

  // ===========================================================================
  // Preview state
  // ===========================================================================

  // eslint-disable-next-line @typescript-eslint/member-ordering
  previewEmails: {
    to: string;
    cc: string;
    bcc: string;
    subject: string;
    body: SafeHtml;
    attachments: { id?: number; name: string; size: number; fileContentType: string; base64: string }[];
  }[] = [];

  // (legacy vars; safe to remove once HTML stops referencing them)
  // eslint-disable-next-line @typescript-eslint/member-ordering
  previewVisible = true;

  // eslint-disable-next-line @typescript-eslint/member-ordering
  howToVisible = false;

  // Single source of truth for right side
  // eslint-disable-next-line @typescript-eslint/member-ordering
  activePanel: RightPanel = 'blank';

  // ===========================================================================
  // Send/test state + progress state
  // ===========================================================================

  // eslint-disable-next-line @typescript-eslint/member-ordering
  mergeSending = signal(false);

  // eslint-disable-next-line @typescript-eslint/member-ordering
  mergeOk = signal(false);

  // eslint-disable-next-line @typescript-eslint/member-ordering
  mergeErr = signal(false);

  // Test send state
  // eslint-disable-next-line @typescript-eslint/member-ordering
  testSending = signal(false);

  // eslint-disable-next-line @typescript-eslint/member-ordering
  testSuccess = false;

  // eslint-disable-next-line @typescript-eslint/member-ordering
  testErr = signal(false);

  // eslint-disable-next-line @typescript-eslint/member-ordering
  saving = false;

  // eslint-disable-next-line @typescript-eslint/member-ordering
  saveSuccess = false;

  // eslint-disable-next-line @typescript-eslint/member-ordering
  sendSuccess = false;

  // Send progress via SSE stream (/api/mail-progress/stream on the backend)
  // eslint-disable-next-line @typescript-eslint/member-ordering
  sendingProgress = 0;

  // eslint-disable-next-line @typescript-eslint/member-ordering
  sendingTotal = 0;

  // eslint-disable-next-line @typescript-eslint/member-ordering
  sendingInProgress = false;

  // eslint-disable-next-line @typescript-eslint/member-ordering
  progressLogs: string[] = [];

  // eslint-disable-next-line @typescript-eslint/member-ordering
  sendingFinished = false;

  // Undo send queue state (frontend-only)
  // eslint-disable-next-line @typescript-eslint/member-ordering
  sendQueued = signal(false);

  // eslint-disable-next-line @typescript-eslint/member-ordering
  sendQueuedSeconds = signal(0);

  // ===========================================================================
  // AI rewrite state
  // ===========================================================================

  // eslint-disable-next-line @typescript-eslint/member-ordering
  isRewriting = false;

  // eslint-disable-next-line @typescript-eslint/member-ordering
  customTone = '';

  // eslint-disable-next-line @typescript-eslint/member-ordering
  aiVisible = false; // (legacy var; safe to remove once HTML stops referencing it)

  // eslint-disable-next-line @typescript-eslint/member-ordering
  aiRewrittenText = '';

  // eslint-disable-next-line @typescript-eslint/member-ordering
  aiSelectedTone: 'professional' | 'friendly' | 'custom' | null = null;

  // eslint-disable-next-line @typescript-eslint/member-ordering
  aiRewrittenPreview: SafeHtml | null = null;

  // AI placeholder map for protected images/links

  private lastAiPlaceholderMap: Record<string, string> | null = null;

  // ===========================================================================
  // Formatting/link modal UI
  // ===========================================================================

  // eslint-disable-next-line @typescript-eslint/member-ordering
  linkModalOpen = false;

  // eslint-disable-next-line @typescript-eslint/member-ordering
  linkUrlDraft = '';

  // eslint-disable-next-line @typescript-eslint/member-ordering
  linkTextDraft = '';

  // eslint-disable-next-line @typescript-eslint/member-ordering
  linkError: string | null = null;

  // ===========================================================================
  // Bottom drawer UI
  // ===========================================================================

  // eslint-disable-next-line @typescript-eslint/member-ordering
  bottomPreviewOpen = true; // preview open by default

  // eslint-disable-next-line @typescript-eslint/member-ordering
  bottomAiOpen = false;

  // eslint-disable-next-line @typescript-eslint/member-ordering
  drawerOpen = { ai: false, preview: false };

  // ===========================================================================
  // Token UI helpers
  // ===========================================================================

  // eslint-disable-next-line @typescript-eslint/member-ordering
  tokenColors: Record<string, string> = {};

  // ===========================================================================
  // FontAwesome icons (referenced in template)
  // ===========================================================================

  // eslint-disable-next-line @typescript-eslint/member-ordering
  faTrash = faTrash;

  // eslint-disable-next-line @typescript-eslint/member-ordering
  faPaperclip = faPaperclip;

  // eslint-disable-next-line @typescript-eslint/member-ordering
  faFileExcel = faFileExcel;

  // eslint-disable-next-line @typescript-eslint/member-ordering
  faCloud = faCloud;

  // eslint-disable-next-line @typescript-eslint/member-ordering
  faHowTo = faCircleQuestion;

  // eslint-disable-next-line @typescript-eslint/member-ordering
  faSpreadsheet = faTable;

  // eslint-disable-next-line @typescript-eslint/member-ordering
  faAi = faWandMagicSparkles;

  // eslint-disable-next-line @typescript-eslint/member-ordering
  faPreview = faEye;

  // eslint-disable-next-line @typescript-eslint/member-ordering
  faLink = faLink;

  // eslint-disable-next-line @typescript-eslint/member-ordering
  faCompose = faPenToSquare;

  // eslint-disable-next-line @typescript-eslint/member-ordering
  faSignature = faSignature;

  // ===========================================================================
  // Toast / small UX
  // ===========================================================================

  // eslint-disable-next-line @typescript-eslint/member-ordering
  uiToast: { type: 'warn' | 'error' | 'ok'; text: string } | null = null;

  // ===========================================================================
  // Conditionals behaviour toggle
  // ===========================================================================

  // Require {{token}} for column references inside [[if ...]] conditions.
  // This avoids ambiguity and prevents collisions with literal words.

  private readonly REQUIRE_TOKENS_IN_CONDITIONS = true;

  // ===========================================================================
  // Angular lifecycle
  // ===========================================================================
  ngOnInit(): void {
    // Load the current authenticated account (JHipster auth)
    this.accountService.identity().subscribe(account => this.account.set(account));

    // Start listening to backend Server-Sent Events progress stream
    // Backend endpoint: GET /api/mail-progress/stream
    this.listenToMailProgress();

    // Load project list in sidebar
    this.loadProjects();

    // Restore sidebar collapsed state from localStorage
    const saved = localStorage.getItem('mm_sidebar_collapsed');
    if (saved != null) this.sidebarCollapsed = saved === 'true';

    // React to route param changes:
    // - /mail/:id loads that project into the editor
    // - /mail without id clears editor and shows blank panel
    this.route.params.subscribe(params => {
      const idParam = params['id'];
      if (idParam) {
        this.projectId = Number(idParam);
        this.loadProject(this.projectId);
      } else {
        this.clearEditorState();
      }
    });

    // Global key handling:
    // Backspace deletes a whole token chip in one go (prevents caret getting stuck inside token spans)
    document.addEventListener('keydown', e => {
      if (e.key !== 'Backspace') return;

      // Current selection/caret
      const sel = window.getSelection();
      if (!sel?.anchorNode) return;

      const anchor = sel.anchorNode;

      // Find the editor container this event is happening within
      const container = anchor instanceof Element ? anchor.closest('.merge-editor') : anchor.parentElement?.closest('.merge-editor');
      if (!container) return;

      // If editor is visually empty, clear it hard (helps contenteditable behaviour)
      const plain = (container as HTMLElement).innerText.trim();
      if (plain === '') {
        e.preventDefault();
        (container as HTMLElement).innerHTML = '';
        return;
      }

      // If caret is adjacent to/in a token, delete the token node rather than a single character
      const token = anchor instanceof Element ? anchor.closest('.merge-token') : anchor.parentElement?.closest('.merge-token');
      if (!token) return;

      e.preventDefault();
      token.remove();

      // Determine which field was affected so we can sync DOM → TS model
      const fieldContainer = token.closest('[id]');
      if (!fieldContainer) return;

      const id = (fieldContainer as HTMLElement).id;

      let field: MergeField | null = null;
      if (id === 'mergeBody') field = 'body';
      else if (id === 'mergeSubject') field = 'subject';
      else if (id === 'toField') field = 'to';
      else if (id === 'ccField') field = 'cc';
      else if (id === 'bccField') field = 'bcc';

      // Re-sync model and re-render tokens so DOM stays consistent with templates
      if (field) {
        this.onEditorInput(field);
        setTimeout(() => this.renderTokens(field));
      }
    });

    // Prevent caret from being placed inside the token span itself
    // (tokens are contenteditable=false, but some browsers can still behave oddly)
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

  // ===========================================================================
  // Derived flags / getters
  // ===========================================================================
  get hasSelectedProject(): boolean {
    return !!this.projectId;
  }

  get hasConnectedSpreadsheet(): boolean {
    // mergeFile is set for BOTH Local and OneDrive because OneDrive selection builds a File([blob])
    return !!this.mergeFile;
  }

  get connectedSpreadsheetName(): string {
    // Preference order:
    // 1) OneDrive name if chosen from OneDrive picker
    // 2) mergeFile.name if we have a File object
    // 3) mergeFileName fallback (rehydrated from DB)
    return this.oneDriveSpreadsheetName ?? this.mergeFile?.name ?? this.mergeFileName ?? 'Spreadsheet';
  }

  // ===========================================================================
  // Sidebar actions: load/create/delete
  // ===========================================================================
  loadProjects(): void {
    // Calls ProjectService.findMy() (backend: list projects owned by current user)
    this.projectService.findMy().subscribe({
      next: projects => {
        // Hide only projects currently being deleted (optimistic UI)
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        this.projects = (projects ?? []).filter(p => !p.id || !this.pendingDeletedProjectIds.has(p.id));
      },
      error: err => console.error('❌ Failed to load projects', err),
    });
  }

  trackByProjectId(_idx: number, p: Project): number | undefined {
    // Angular trackBy to keep list rendering fast/stable
    return p.id;
  }

  newProject(): void {
    // Opens create project UI (modal/inline)
    this.newProjectName = '';
    this.creatingProject = true;
  }

  confirmCreateProject(): void {
    const name = (this.newProjectName || '').trim();
    if (!name) return;

    // This boolean currently represents “create UI open / busy”
    // If later you want a separate spinner, split into two flags.
    this.creatingProject = true;

    // JDL likely expects status enum; PENDING means it appears in Drafts immediately
    const newProject: any = {
      name,
      status: 'PENDING',
    };

    // Calls ProjectService.create() (backend: POST /api/projects)
    this.projectService.create(newProject).subscribe({
      next: (created: Project) => {
        this.creatingProject = false;
        this.newProjectName = '';

        // UI feedback
        this.saveSuccess = true;
        setTimeout(() => (this.saveSuccess = false), 2000);

        // Refresh sidebar list
        this.loadProjects();

        // Navigate to the created project so editors can load it
        if (created.id) {
          this.openProjectFromSidebar(created);
        }
      },
      error: err => {
        console.error('❌ Create project failed', err);
        this.creatingProject = false;
        this.showToast('error', 'Failed to create project. Please try again.');
      },
    });
  }

  deleteCurrentProject(): void {
    // Delete the currently opened project (shows confirmation modal)
    if (!this.projectId || this.deletingProject) return;
    this.deleteConfirmOpen = true;
  }

  openDeleteProjectModal(p: Project, event?: MouseEvent): void {
    // Called from sidebar delete icon (prevents click navigating into project)
    event?.preventDefault();
    event?.stopPropagation();

    if (!p.id || this.deletingProject) return;

    this.deleteTargetId = p.id;
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    this.deleteTargetName = p.name ?? '';
    this.deleteConfirmOpen = true;
  }

  cancelDeleteProject(): void {
    // Close modal without action
    this.deleteConfirmOpen = false;
    this.deleteTargetId = null;
    this.deleteTargetName = '';
  }

  confirmDeleteProject(): void {
    const deletingId = this.deleteTargetId;
    if (!deletingId) return;

    this.deleteConfirmOpen = false;
    this.deletingProject = true;

    // Optimistic UI: hide immediately
    this.pendingDeletedProjectIds.add(deletingId);
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    this.projects = (this.projects ?? []).filter(p => p.id !== deletingId);

    // If deleting the open project, navigate away so editor doesn't point at missing data
    const wasOpen = this.projectId === deletingId;
    if (wasOpen) {
      this.clearEditorState();
      void this.router.navigate(['/mail']);
    }

    // Calls ProjectService.delete() (backend: DELETE /api/projects/:id)
    this.projectService.delete(deletingId).subscribe({
      next: () => {
        this.pendingDeletedProjectIds.delete(deletingId);
        this.deletingProject = false;

        this.showToast('ok', 'Project deleted.');
        this.deleteTargetId = null;
        this.deleteTargetName = '';

        // Re-fetch list to ensure sidebar matches backend
        this.loadProjects();
      },
      error: err => {
        console.error('❌ Failed to delete project', err);
        this.pendingDeletedProjectIds.delete(deletingId);
        this.deletingProject = false;

        this.showToast('error', 'Failed to delete project. Please try again.');
        this.deleteTargetId = null;
        this.deleteTargetName = '';

        // Re-fetch list so UI recovers even after failure
        this.loadProjects();
      },
    });
  }

  // ===========================================================================
  // Navigation + auth actions
  // ===========================================================================

  goBack(): void {
    // Route back to project list route
    void this.router.navigate(['/project']);
  }

  login(): void {
    // Triggers JHipster login flow
    this.loginService.login();
  }

  toggleSidebar(): void {
    // Persist UX preference so it survives refresh
    this.sidebarCollapsed = !this.sidebarCollapsed;
    localStorage.setItem('mm_sidebar_collapsed', String(this.sidebarCollapsed));
  }

  openProjectFromSidebar(p: Project): void {
    if (!p.id) return;

    // If sidebar is collapsed, expand it for better navigation context
    if (this.sidebarCollapsed) this.toggleSidebar();

    // Close open menus to avoid odd overlays during navigation
    this.sendMenuOpen = false;

    // Navigate to /mail/:id which triggers loadProject() via route param subscription
    void this.router.navigate(['/mail', p.id]);
  }

  // ===========================================================================
  // Editor state reset helpers
  // ===========================================================================
  private clearEditorState(): void {
    // Clear selection state
    this.projectId = null;
    this.project = null;

    // Clear editable model values
    this.projectName = '';
    this.mergeSubjectTemplate = '';
    this.mergeBodyTemplate = '';
    this.toField = '';
    this.ccField = '';
    this.bccField = '';

    // Clear UI toggles
    this.attachments = [];
    this.deletedAttachmentIds = [];
    this.attachmentsLoading = false;

    this.sendMenuOpen = false;
    this.spreadsheetMenuOpen = false;
    this.spreadsheetPreviewOpen = false;

    // Reset spreadsheet-related state
    this.removeSpreadsheet();
    this.previewEmails = [];

    // With no project selected we want RHS to show nothing
    this.activePanel = 'blank';
  }

  // ===========================================================================
  // Toolbar glue
  // ===========================================================================
  // eslint-disable-next-line @typescript-eslint/member-ordering
  toggleSendMenu(): void {
    // Guard: can't send with no selected project
    if (!this.hasSelectedProject) return;
    this.sendMenuOpen = !this.sendMenuOpen;
  }

  // eslint-disable-next-line @typescript-eslint/member-ordering
  connectSpreadsheet(): void {
    // Guard: spreadsheet must belong to a project
    if (!this.hasSelectedProject) return;

    // Local upload: click hidden input
    if (this.spreadsheetSource === 'LOCAL') {
      this.mergeFileInput?.nativeElement.click();
      return;
    }

    // OneDrive upload: open picker popup immediately from click (browser popup rules)
    void this.openOneDrivePicker();
  }

  // eslint-disable-next-line @typescript-eslint/member-ordering
  openAttachmentsPicker(): void {
    if (!this.hasSelectedProject) return;
    this.attachmentsInput?.nativeElement.click();
  }

  // ===========================================================================
  // Right panel switching (single source of truth)
  // ===========================================================================
  // eslint-disable-next-line @typescript-eslint/member-ordering
  setPanel(panel: RightPanel): void {
    if (!this.hasSelectedProject) return;

    // Clicking the same panel again returns to compose (nice UX)
    this.activePanel = this.activePanel === panel ? 'compose' : panel;

    // Preview panel should always regenerate preview rows from current templates
    if (this.activePanel === 'preview') {
      this.previewMerge();
      return;
    }

    // Signature panel: load current saved signature into the editor
    if (this.activePanel === 'signature') {
      setTimeout(() => {
        const el = document.getElementById('signatureEditor');
        if (el) {
          // Signature saved is stored as markdown-ish, so convert to HTML for display
          el.innerHTML = this.convertMarkdownToHtml(this.signatureSaved || '');
          el.focus();
        }
      });
      return;
    }

    // Compose panel: re-hydrate token spans so the contenteditable DOM matches template strings
    if (this.activePanel === 'compose') {
      setTimeout(() => {
        (['body', 'subject', 'to', 'cc', 'bcc'] as MergeField[]).forEach(f => this.renderTokens(f));
      });
    }
  }

  // eslint-disable-next-line @typescript-eslint/member-ordering
  toggleSignaturePanel(): void {
    this.setPanel('signature');
  }

  // ===========================================================================
  // Spreadsheet tokens drag/drop
  // ===========================================================================
  // eslint-disable-next-line @typescript-eslint/member-ordering
  onDragStart(event: DragEvent, header: string): void {
    if (!this.hasSelectedProject) return;
    // Drag inserts a token string (actual stored form in templates)
    event.dataTransfer?.setData('text/plain', `{{${header}}}`);
  }

  // eslint-disable-next-line @typescript-eslint/member-ordering
  allowDrop(event: DragEvent): void {
    if (!this.hasSelectedProject) return;
    // Needed so drop actually fires on the target
    event.preventDefault();
  }

  // eslint-disable-next-line @typescript-eslint/member-ordering
  onDrop(event: DragEvent, field: MergeField): void {
    if (!this.hasSelectedProject) return;

    event.preventDefault();

    // Retrieve token text from drag data
    const text = event.dataTransfer?.getData('text/plain') ?? '';

    // Focus the editor and insert at caret
    const el = document.getElementById(this.getElementId(field));
    if (!el) return;
    el.focus();

    const sel = window.getSelection();
    if (!sel?.rangeCount) return;

    const range = sel.getRangeAt(0);
    range.deleteContents();

    // Insert literal token text first; renderTokens later converts it into chip spans
    range.insertNode(document.createTextNode(text));

    // Insert trailing space so user can keep typing
    const space = document.createTextNode(' ');
    range.insertNode(space);

    // Move caret after inserted space
    range.setStartAfter(space);
    range.collapse(true);

    sel.removeAllRanges();
    sel.addRange(range);

    // Sync DOM → templates
    this.onEditorInput(field);

    // Convert any known tokens into chips
    setTimeout(() => this.renderTokens(field));
  }

  // ===========================================================================
  // Spreadsheet: source selection / dropdown
  // ===========================================================================
  // eslint-disable-next-line @typescript-eslint/member-ordering
  toggleSpreadsheetMenu(): void {
    if (!this.hasSelectedProject) return;
    this.spreadsheetMenuOpen = !this.spreadsheetMenuOpen;
  }

  // eslint-disable-next-line @typescript-eslint/member-ordering
  chooseSpreadsheet(source: 'LOCAL' | 'ONEDRIVE'): void {
    if (!this.hasSelectedProject) return;

    // Close menu first so it doesn’t overlay picker/file dialog
    this.spreadsheetMenuOpen = false;

    // Switch source and then trigger connection flow
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
  setSpreadsheetSource(source: 'LOCAL' | 'ONEDRIVE'): void {
    if (!this.hasSelectedProject) return;
    if (this.spreadsheetSource === source) return;

    this.spreadsheetSource = source;

    // Switching sources clears state so we don’t mix tokens/headers from different files
    if (source === 'LOCAL') {
      this.oneDriveSpreadsheetName = null;
      this.removeSpreadsheet();
    } else {
      this.removeSpreadsheet();
    }
  }

  // eslint-disable-next-line @typescript-eslint/member-ordering
  onMergeFileChange(event: Event): void {
    if (!this.hasSelectedProject) return;

    // Local upload path
    this.spreadsheetSource = 'LOCAL';
    this.oneDriveSpreadsheetName = null;

    const input = event.target as HTMLInputElement | null;
    const file = input?.files && input.files.length > 0 ? input.files[0] : null;
    if (!file) return;

    // Clear any previous spreadsheet state first
    this.removeSpreadsheet();

    // Parse + store base64 for persistence
    this.loadSpreadsheetFile(file);
  }

  // eslint-disable-next-line @typescript-eslint/member-ordering
  removeSpreadsheet(): void {
    // Reset "connected spreadsheet" state
    this.mergeFile = null;
    this.spreadsheetBase64 = null;

    // Reset name fields used by UI and persistence
    this.mergeFileName = null;
    this.oneDriveSpreadsheetName = null;

    // Reset content type and parsed data
    this.spreadsheetFileContentType = null;
    this.spreadsheetHeaders = [];
    this.spreadsheetTable = [];
    this.spreadsheetRows = [];
    this.previewEmails = [];

    // Reset To/Cc/Bcc UI behaviour that is spreadsheet driven
    this.showBcc = false;

    // Reset OneDrive picker UI
    this.oneDrivePickerVisible = false;
    this.oneDriveFiles = [];
    this.oneDriveLoading = false;
    this.oneDriveError = null;

    // Close spreadsheet menus/panels
    this.spreadsheetMenuOpen = false;
    this.spreadsheetPreviewOpen = false;

    // Allow re-uploading the same file (input won't trigger change if same path unless we clear value)
    if (this.mergeFileInput?.nativeElement) {
      this.mergeFileInput.nativeElement.value = '';
    }
  }

  // ===========================================================================
  // OneDrive spreadsheet integration
  // ===========================================================================
  // eslint-disable-next-line @typescript-eslint/member-ordering
  async openOneDrivePicker(): Promise<void> {
    if (!this.hasSelectedProject) return;

    this.spreadsheetSource = 'ONEDRIVE';
    this.oneDriveError = null;
    this.oneDriveLoading = true;

    // Popup must be opened synchronously from click handler to avoid browser blocking
    const win = window.open('', 'Picker', 'width=1080,height=680');
    if (!win) {
      this.oneDriveError = 'Popup blocked. Please allow popups for this site and try again.';
      this.oneDriveLoading = false;
      return;
    }

    try {
      // OneDrivePickerV8Service returns selected Excel bytes + filename
      const { name, bytes } = await this.oneDrivePicker.pickExcelFileInWindow(win);

      // Hide picker UI once we have a file
      this.oneDrivePickerVisible = false;

      // Convert bytes -> File and parse it
      this.handleOneDriveSelection(bytes, name);
    } catch (e: any) {
      // Surface a friendly error message
      const msg = e?.message ?? String(e);
      this.oneDriveError = msg.includes('Popup blocked') ? 'Popup blocked. Please allow popups for this site and try again.' : msg;

      // Try to close the popup if we own it
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

    // Calls OneDriveService.getSpreadsheetContent() (Graph API behind the scenes)
    (this.oneDriveService.getSpreadsheetContent(file.id, file.driveId) as unknown as import('rxjs').Observable<ArrayBuffer>).subscribe({
      next: (arrayBuffer: ArrayBuffer) => {
        this.oneDriveLoading = false;
        this.oneDrivePickerVisible = false;

        // Parse bytes like a local file
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

  // eslint-disable-next-line @typescript-eslint/member-ordering
  handleOneDriveSelection(fileBytes: ArrayBuffer, fileName: string): void {
    // Clear any existing spreadsheet state first
    this.removeSpreadsheet();

    // We are now in OneDrive mode
    this.spreadsheetSource = 'ONEDRIVE';

    // Set BOTH names:
    // - oneDriveSpreadsheetName is “source-of-truth” for UI label
    // - mergeFileName is persistence/display fallback when mergeFile is reconstructed
    this.oneDriveSpreadsheetName = fileName;
    this.mergeFileName = fileName;

    // Build a File object so the rest of the parsing flow is identical to local upload
    const blob = new Blob([fileBytes], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const file = new File([blob], fileName || 'onedrive.xlsx', { type: blob.type });

    this.loadSpreadsheetFile(file);
  }

  /**
   * Parse spreadsheet into:
   * - spreadsheetHeaders: list of column names
   * - spreadsheetRows: list of objects (header -> cell string)
   * - spreadsheetTable: matrix form used by preview table
   * Also stores spreadsheetBase64 for persistence (Project.spreadsheetLink).
   */
  private loadSpreadsheetFile(file: File): void {
    // Keep the actual File object so we know “connected spreadsheet exists”
    this.mergeFile = file;

    // Keep original name for UI + save-to-project
    this.mergeFileName = file.name;

    // Needed when saving to DB (so backend knows the payload type)
    this.spreadsheetFileContentType = file.type || 'application/octet-stream';

    // 1) Parse binary via ArrayBuffer -> XLSX
    const reader = new FileReader();
    reader.onload = e => {
      const result = (e.target as FileReader).result;
      if (!result) {
        // Reset parsed state if file read failed unexpectedly
        this.spreadsheetHeaders = [];
        this.spreadsheetTable = [];
        this.spreadsheetRows = [];
        this.previewMerge();
        return;
      }

      // XLSX.read expects a typed array for {type:'array'}
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
        // No sheets -> nothing to merge
        this.spreadsheetHeaders = [];
        this.spreadsheetTable = [];
        this.spreadsheetRows = [];
        this.previewMerge();
        return;
      }

      // Use first sheet only (consistent with typical Mail Merge UX)
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];

      // Convert to array-of-arrays:
      // - header: 1 means first row is row[0]
      // - defval: '' avoids undefined for empty cells
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

      // First row = header row; remaining rows are data
      const headerRowRaw = matrix[0] ?? [];
      const dataRows = matrix.slice(1);

      // Normalize header cells to trimmed strings
      const headerRow = headerRowRaw.map(cell => String(cell ?? '').trim());

      // Keep only non-empty headers and record their original indexes
      const headerIndexes: number[] = [];
      const headers: string[] = [];
      headerRow.forEach((h, idx) => {
        if (h !== '') {
          headerIndexes.push(idx);
          headers.push(h);
        }
      });

      // Set headers used by token logic (isKnownMergeField)
      this.spreadsheetHeaders = headers;

      // Build object rows: { HeaderName: "cellString" }
      this.spreadsheetRows = dataRows.map(row => {
        const obj: Record<string, string> = {};
        headerIndexes.forEach((colIdx, i) => {
          const key = headers[i];
          const cell = row[colIdx];
          obj[key] = String(cell ?? '');
        });
        return obj;
      });

      // Build table matrix for spreadsheet preview UI
      this.spreadsheetTable = [headers, ...dataRows.map(row => headerIndexes.map(colIdx => String(row[colIdx] ?? '')))];

      // With new rows loaded, refresh preview immediately
      this.previewMerge();
    };

    reader.readAsArrayBuffer(file);

    // 2) Store base64 for persistence:
    // Project.save stores spreadsheetBase64 into Project.spreadsheetLink so it can rehydrate later.
    const dataUrlReader = new FileReader();
    dataUrlReader.onload = e => {
      const dataUrl = (e.target as FileReader).result as string;
      this.spreadsheetBase64 = dataUrl.split(',')[1] ?? '';
    };
    dataUrlReader.readAsDataURL(file);
  }

  // ===========================================================================
  // Attachments
  // ===========================================================================
  // eslint-disable-next-line @typescript-eslint/member-ordering
  onAttachmentsChange(event: Event): void {
    if (!this.hasSelectedProject) return;

    const input = event.target as HTMLInputElement | null;
    if (!input?.files || input.files.length === 0) return;

    const files = Array.from(input.files);

    // Mark “loading” while FileReader runs (prevents sending mid-read)
    this.pendingAttachmentReads += files.length;
    this.attachmentsLoading = true;

    files.forEach(file => {
      const fr = new FileReader();

      fr.onload = e => {
        const dataUrl = (e.target as FileReader).result as string;
        const base64 = dataUrl.split(',')[1] ?? '';

        // New attachment has no id until saved
        this.attachments.push({
          name: file.name,
          size: file.size,
          fileContentType: file.type || 'application/octet-stream',
          base64,
        });

        // Decrement pending reads and potentially clear loading state
        this.pendingAttachmentReads--;
        if (this.pendingAttachmentReads <= 0) {
          this.pendingAttachmentReads = 0;
          this.attachmentsLoading = false;
        }
      };

      fr.onerror = () => {
        // Even on error we must decrement to avoid permanent “loading”
        this.pendingAttachmentReads--;
        if (this.pendingAttachmentReads <= 0) {
          this.pendingAttachmentReads = 0;
          this.attachmentsLoading = false;
        }
      };

      fr.readAsDataURL(file);
    });

    // Clear file input so selecting same file again triggers change event
    input.value = '';
  }

  // eslint-disable-next-line @typescript-eslint/member-ordering
  removeAttachment(index: number): void {
    if (!this.hasSelectedProject) return;

    // Remove from UI list immediately
    const removed = this.attachments.splice(index, 1)[0];

    // If it existed in DB, track id so saveProject() can delete server-side
    if (removed.id) {
      this.deletedAttachmentIds.push(removed.id);
    }
  }

  // ===========================================================================
  // Project loading
  // ===========================================================================
  // eslint-disable-next-line @typescript-eslint/member-ordering
  loadProject(id: number): void {
    // Reset the previous project's UI state immediately to prevent “bleeding”
    // (e.g. spreadsheet headers/tokens sticking while new project loads)
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

    // Opening a project should land on compose by default
    this.activePanel = 'compose';

    // Load signature + project in parallel:
    // - Signature is needed to upsertSignature() into the loaded project body
    // - Project contains header/content/to/cc/bcc + spreadsheetLink (base64) + spreadsheetName
    forkJoin({
      sig: this.signatureService.get().pipe(catchError(() => of(''))),
      p: this.projectService.find(id),
    }).subscribe({
      next: ({ sig, p }) => {
        // 1) Signature is loaded first so we can insert it into body content
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        this.signatureSaved = (sig ?? '').trim();
        this.signatureDraft = this.signatureSaved;

        // 2) Apply project fields
        this.project = p;
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        this.projectName = p.name ?? '';
        this.mergeSubjectTemplate = p.header ?? '';

        // Ensure signature block exists at bottom of body content
        this.mergeBodyTemplate = this.upsertSignature(p.content ?? '', this.signatureSaved);

        // Non-standard fields stored on Project (likely extended DTO)
        this.toField = (p as any).toField ?? '';
        this.ccField = (p as any).ccField ?? '';
        this.bccField = (p as any).bccField ?? '';

        // Bcc UI should only show if bcc contains something
        this.showBcc = !!this.bccField.trim();

        // Remember stored spreadsheet filename so UI label survives reload
        this.mergeFileName = (p as any).spreadsheetName ?? null;

        // If spreadsheetLink exists (base64 in DB), reconstruct File and parse it
        if (p.spreadsheetLink) {
          this.spreadsheetBase64 = p.spreadsheetLink;
          this.spreadsheetFileContentType = (p as any).spreadsheetFileContentType ?? 'application/octet-stream';

          // Convert base64 -> bytes -> File
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

          // This will populate headers/rows/table and refresh preview
          this.loadSpreadsheetFile(file);
        }

        // Load attachments from backend
        // AttachmentService.findByProject hits backend to return {id,name,size,fileContentType,file(base64)}
        this.attachmentsLoading = true;

        this.attachmentService
          .findByProject(id)
          .pipe(
            finalize(() => {
              // DB load finished; keep spinner only if local FileReaders are still running
              this.attachmentsLoading = this.pendingAttachmentReads > 0;
            }),
          )
          .subscribe({
            next: attachments => {
              // Map backend DTO -> component attachment model
              this.attachments = attachments.map(a => ({
                id: a.id,
                name: a.name,
                size: a.size,
                fileContentType: a.fileContentType,
                base64: a.file,
              }));

              // With attachments loaded, regenerate preview and tokens
              this.previewMerge();
              setTimeout(() => {
                (['body', 'subject', 'to', 'cc', 'bcc'] as MergeField[]).forEach(f => this.renderTokens(f));
              });
            },
            error(err) {
              console.error('❌ Failed to load attachments', err);
            },
          });

        // Refresh preview + sidebar list (e.g. status changes)
        this.previewMerge();
        this.loadProjects();

        // Ensure body editor shows signature immediately
        setTimeout(() => this.renderTokens('body'));
      },
      error: err => {
        console.error('❌ Failed to load project/signature', err);

        // Reset state and navigate out (avoid half-loaded editor)
        this.clearEditorState();
        void this.router.navigate(['/mail']);
      },
    });
  }

  // ===========================================================================
  // Address fields (Bcc toggle)
  // ===========================================================================
  // eslint-disable-next-line @typescript-eslint/member-ordering
  toggleBcc(): void {
    if (!this.hasSelectedProject) return;

    this.showBcc = !this.showBcc;

    // If user just opened Bcc, focus it for smooth UX
    if (this.showBcc) {
      setTimeout(() => document.getElementById('bccField')?.focus());
    }
  }

  // ===========================================================================
  // Save project (and shared save observable)
  // ===========================================================================
  // eslint-disable-next-line @typescript-eslint/member-ordering
  saveProject(): void {
    if (!this.projectId) return;
    this.saving = true;

    const hasSpreadsheet = !!this.spreadsheetBase64;

    // Build Project object that ProjectService.update() expects (backend update endpoint)
    const updated: Project = {
      ...(this.project ?? {}),
      id: this.projectId,
      name: this.projectName,
      header: this.mergeSubjectTemplate,
      content: this.mergeBodyTemplate,
      status: 'PENDING',

      // These fields are custom/extended; they are read by backend MailMergeService later when sending
      toField: this.toField,
      ccField: this.ccField,
      bccField: this.bccField,

      // Persist spreadsheet payload and metadata so project can be rehydrated later
      spreadsheetLink: hasSpreadsheet ? this.spreadsheetBase64 : null,
      spreadsheetFileContentType: hasSpreadsheet ? this.spreadsheetFileContentType : null,

      // Persist original filename so UI shows the correct name (even after rehydration from DB)
      spreadsheetName: hasSpreadsheet ? (this.oneDriveSpreadsheetName ?? this.mergeFileName ?? this.mergeFile?.name ?? null) : null,
    };

    // New attachments are those without an id (they aren't in DB yet)
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
        // Delete attachments that user removed (AttachmentService.deleteById hits backend)
        switchMap(() => {
          if (this.deletedAttachmentIds.length > 0) {
            const deletes = this.deletedAttachmentIds.map(id => this.attachmentService.deleteById(id));
            return forkJoin(deletes);
          }
          return of(null);
        }),
        // Save new attachments for this project (AttachmentService.saveForProject hits backend)
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

          // UI feedback
          this.saveSuccess = true;
          setTimeout(() => (this.saveSuccess = false), 3000);

          // Clear delete queue now that backend is consistent
          this.deletedAttachmentIds = [];

          // Keep local project reference consistent
          this.project = updated;

          // Refresh sidebar list
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
    // Shared save logic used by sendProject() and testProject()
    // (ensures project is persisted before mail merge calls backend)
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

    // ProjectService.update + attachment deletes + attachment saves
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
        // Keep local state in sync with what was saved
        this.deletedAttachmentIds = [];
        this.project = updated;
      }),
      switchMap(() => of(void 0)),
    );
  }

  // ===========================================================================
  // Send / test
  // ===========================================================================
  // eslint-disable-next-line @typescript-eslint/member-ordering
  testProject(): void {
    // Clear error flags that could otherwise stick in UI
    this.testErr.set(false);
    this.mergeErr.set(false);

    // Must have an active project and spreadsheet to test
    if (!this.projectId || !this.mergeFile) {
      this.testErr.set(true);
      this.showToast('warn', 'Connect a spreadsheet before sending a test email.');
      return;
    }

    // Prevent sending while attachments are still reading
    if (this.attachmentsLoading) {
      this.showToast('warn', 'Attachments are still loading, please wait a moment.');
      return;
    }

    // Shared validation path used by send + test (To required, CC/BCC optional)
    if (!this.guardBeforeSendOrTest()) {
      return;
    }

    // UI flags for "test send in progress"
    this.testSending.set(true);
    this.testErr.set(false);
    this.testSuccess = false;

    // Persist changes before sending
    this.saveProjectAndReturnObservable().subscribe({
      next: () => {
        // Build payload that your ProjectService will send to backend MailMergeService
        // (payload includes spreadsheet and templates with conditionals handled)
        const payload = this.buildAdvancedPayloadRespectingConditionals();

        // Calls ProjectService.sendMailMergeTestWithMeta(payload)
        // -> backend endpoint sends a single test email (implementation in backend)
        this.projectService.sendMailMergeTestWithMeta(payload).subscribe({
          next: () => {
            this.testSending.set(false);
            this.testSuccess = true;

            // Show toast feedback
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
    // Clear test error state (send and test share UX surfaces)
    this.testErr.set(false);
    this.mergeErr.set(false);

    // Must have spreadsheet connected for a merge send
    if (!this.projectId || !this.mergeFile) {
      this.mergeErr.set(true);
      this.showToast('warn', 'Connect a spreadsheet before sending.');
      return;
    }

    // Block send while attachment FileReader is still reading
    if (this.attachmentsLoading) {
      this.showToast('warn', 'Attachments are still loading, please wait a moment.');
      return;
    }

    // Validate all row-resolved recipients before hitting backend
    if (!this.guardBeforeSendOrTest()) {
      return;
    }

    // UI flags: “merge send” now running
    this.mergeSending.set(true);
    this.mergeErr.set(false);

    // Reset progress UI before starting
    this.sendingProgress = 0;
    this.sendingTotal = 0;
    this.sendingInProgress = true;
    this.progressLogs = [];
    this.sendingFinished = false;

    // Persist before sending
    this.saveProjectAndReturnObservable().subscribe({
      next: () => {
        const payload = this.buildAdvancedPayloadRespectingConditionals();

        // Calls ProjectService.sendMailMergeWithMeta(payload)
        // -> backend should start sending and emit SSE progress events
        this.projectService.sendMailMergeWithMeta(payload).subscribe({
          next: () => {
            this.mergeSending.set(false);
            this.sendSuccess = true;

            // After send, mark project SENT in backend so it moves folder
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

              // Update on backend so sidebar foldering stays consistent
              this.projectService.update(updatedProject).subscribe(() => this.loadProjects());
            }

            // Clear success after a moment
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

  // ===========================================================================
  // Undo Send (frontend-only queue)
  // ===========================================================================
  // eslint-disable-next-line @typescript-eslint/member-ordering
  queueSendProject(): void {
    if (!this.hasSelectedProject) return;

    // Don't queue if already queued or already sending
    if (this.sendQueued() || this.mergeSending()) return;

    // Must have spreadsheet
    if (!this.projectId || !this.mergeFile) {
      this.mergeErr.set(true);
      this.showToast('warn', 'Connect a spreadsheet before sending.');
      return;
    }

    // Must not be reading attachments
    if (this.attachmentsLoading) {
      this.showToast('warn', 'Attachments are still loading, please wait a moment.');
      return;
    }

    // Clear existing timers to avoid multiple queues
    this.clearQueuedSendTimers();

    // Enter queued state
    this.mergeErr.set(false);
    this.sendQueued.set(true);
    this.sendQueuedSeconds.set(10);

    // Countdown display timer
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

    // Actual send trigger
    this.sendQueuedTimeoutId = setTimeout(() => {
      this.clearQueuedSendTimers();
      this.sendQueued.set(false);
      this.sendQueuedSeconds.set(0);

      // Re-check guards right before sending
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

    // Cancel timers and reset queued UI state
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

  // ===========================================================================
  // Preview
  // ===========================================================================
  // eslint-disable-next-line @typescript-eslint/member-ordering
  previewMerge(): void {
    // No spreadsheet rows means nothing can be previewed
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (!this.spreadsheetRows || this.spreadsheetRows.length === 0) {
      this.previewEmails = [];
      return;
    }

    const rows = this.spreadsheetRows;

    // Build a preview email per row
    this.previewEmails = rows
      .map(row => {
        // Apply conditionals first, then token replacement for this row
        const subjectFinal = this.renderTemplateForRow(this.mergeSubjectTemplate, row);

        // Resolve and normalize recipient lists
        const toRaw = this.renderTemplateForRow(this.toField, row);
        const toFinal = this.normalizeRecipientList(toRaw);

        // If To resolves empty (due to conditionals), this row would be skipped server-side
        if (!toFinal) return null;

        const ccFinal = this.normalizeRecipientList(this.renderTemplateForRow(this.ccField, row));
        const bccFinal = this.normalizeRecipientList(this.renderTemplateForRow(this.bccField, row));

        // Body: markdown-ish -> HTML
        const bodyFinalMd = this.renderTemplateForRow(this.mergeBodyTemplate, row);
        const bodyHtml = this.convertMarkdownToHtml(bodyFinalMd);

        return {
          to: toFinal,
          cc: ccFinal,
          bcc: bccFinal,
          subject: subjectFinal,
          // sanitizer bypass is needed because we generate HTML markup intentionally
          body: this.sanitizer.bypassSecurityTrustHtml(bodyHtml),
          // attach same attachments list for preview (server will send same for all rows)
          attachments: this.attachments,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
  }

  private normalizeRecipientList(raw: string): string {
    const s = (raw || '').trim();
    if (!s) return '';

    // Collapse whitespace/newlines from conditional blocks
    const parts = s
      .replace(/\s+/g, ' ')
      .split(/[;,]/)
      .map(x => x.trim())
      .filter(Boolean);

    // Normalized output used by UI and “row skipped” checks
    return parts.join(', ');
  }

  // ===========================================================================
  // Downloads (spreadsheet + attachments)
  // ===========================================================================
  // eslint-disable-next-line @typescript-eslint/member-ordering
  downloadSpreadsheet(event: Event): void {
    event.preventDefault();
    if (!this.spreadsheetBase64) return;

    // Convert base64 to a Blob so browser download works
    const blob = this.base64ToBlob(this.spreadsheetBase64, this.spreadsheetFileContentType ?? 'application/octet-stream');
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;

    // Download using stored name (rehydrated) when mergeFile is missing or reconstructed
    a.download = this.mergeFile?.name ?? this.mergeFileName ?? 'spreadsheet.xlsx';

    a.click();
    window.URL.revokeObjectURL(url);
  }

  // eslint-disable-next-line @typescript-eslint/member-ordering
  downloadAttachment(a: { name: string; base64: string; fileContentType: string; size: number }, event: Event): void {
    event.preventDefault();

    // Same base64->blob download approach for attachments
    const blob = this.base64ToBlob(a.base64, a.fileContentType || 'application/octet-stream');
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = a.name;
    anchor.click();
    window.URL.revokeObjectURL(url);
  }

  private base64ToBlob(base64: string, contentType: string): Blob {
    // Chunk decode avoids large memory spikes for big payloads
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

  // ===========================================================================
  // Mail progress (SSE)
  // ===========================================================================
  // eslint-disable-next-line @typescript-eslint/member-ordering
  listenToMailProgress(): void {
    // Backend emits "mail-progress" events from /api/mail-progress/stream
    const eventSource = new EventSource('/api/mail-progress/stream');

    eventSource.addEventListener('mail-progress', (event: MessageEvent) => {
      // Backend event payload should be JSON: { totalCount, sentCount, email, message }
      const data = JSON.parse(event.data);

      if (typeof data.totalCount === 'number' && data.totalCount >= 0) this.sendingTotal = data.totalCount;
      if (typeof data.sentCount === 'number' && data.sentCount >= 0) this.sendingProgress = data.sentCount;

      // Derive whether we are still in progress
      this.sendingInProgress = this.sendingTotal > 0 && this.sendingProgress < this.sendingTotal;

      // Append per-email log line if backend provides it
      if (data.email && data.message) this.progressLogs.push(`${data.email} — ${data.message}`);

      // Mark finished when counts match
      if (this.sendingTotal > 0 && this.sendingProgress >= this.sendingTotal) {
        this.sendingInProgress = false;
        this.sendingFinished = true;

        // Keep finished banner visible for 2 seconds
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

  // ===========================================================================
  // AI rewrite
  // ===========================================================================
  // eslint-disable-next-line @typescript-eslint/member-ordering
  rewriteEmailBody(tone: 'professional' | 'friendly' | 'custom'): void {
    // No body means nothing to rewrite
    if (!this.mergeBodyTemplate) return;

    // Resolve custom tone text if needed
    const selectedTone = tone === 'custom' ? this.customTone : tone;
    if (!selectedTone.trim()) return;

    // Protect links/images before sending to AI so it doesn't break data: URLs or anchors
    const { safeText, map } = this.protectRichContentForAi(this.mergeBodyTemplate);
    this.lastAiPlaceholderMap = map;

    // UI flags
    this.isRewriting = true;
    this.aiSelectedTone = tone;
    this.aiRewrittenText = '';
    this.aiRewrittenPreview = null;

    // Calls AiRewriteService.rewrite(text, tone) (backend AI endpoint)
    this.aiRewriteService.rewrite(safeText, selectedTone).subscribe({
      next: res => {
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        const rewritten = res.rewrittenText ?? '';

        // Restore placeholders back into markdown
        this.aiRewrittenText = this.restoreRichContentFromAi(rewritten, this.lastAiPlaceholderMap);

        // Convert to HTML for preview, and decorate merge tokens for UI consistency
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

    // Only update body template (do not modify address/subject fields)
    this.mergeBodyTemplate = this.aiRewrittenText;

    // Drop placeholder map once applied
    this.lastAiPlaceholderMap = null;

    // Refresh preview model
    this.previewMerge();

    // Return to compose view
    this.activePanel = 'compose';

    // Re-hydrate contenteditable DOM (otherwise it can look empty after panel swap)
    setTimeout(() => {
      (['to', 'cc', 'bcc', 'subject', 'body'] as MergeField[]).forEach(f => this.renderTokens(f));
    }, 0);
  }

  // -----------------------
  // AI rewrite: protect rich content (links/images) with placeholders
  // -----------------------
  private protectRichContentForAi(md: string): { safeText: string; map: Record<string, string> } {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    let text = md ?? '';
    const map: Record<string, string> = {};
    let linkIdx = 0;
    let imgIdx = 0;

    // Protect HTML <img ...> tags so AI doesn't rewrite data URLs
    text = text.replace(/<img\b[^>]*>/gi, m => {
      imgIdx++;
      const token = `⟦MM_IMG_${imgIdx}⟧`;
      map[token] = m;
      return token;
    });

    // Protect HTML <a href="https://...">..</a> by converting to markdown format for safe round-trip
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

    // Protect markdown links too: [text](https://...)
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

    // Replace all placeholders with original content
    Object.keys(map).forEach(token => {
      // replaceAll without needing ES2021 lib assumption
      out = out.split(token).join(map[token]);
    });

    return out;
  }

  // ===========================================================================
  // Editor input + tokens
  // ===========================================================================
  // eslint-disable-next-line @typescript-eslint/member-ordering
  onEditorInput(field: MergeField): void {
    if (!this.hasSelectedProject) return;

    // Find the contenteditable element by its known id
    const el = document.getElementById(this.getElementId(field));
    if (!el) return;

    // Convert freshly typed {{token}} into a chip span in-place (without full re-render)
    // This prevents contenteditable “jumpiness”
    this.tryConvertTypedTokenAtCaret(field, el);

    // Capture the editor's innerHTML for conversion
    let html = el.innerHTML;

    // Normalize merge-token spans back to {{token}} strings for storage
    html = html.replace(/<span[^>]*class="merge-token"[^>]*data-field="([^"]+)"[^>]*>.*?<\/span>/gi, '{{$1}}');

    // To/Cc/Bcc/Subject are treated as PLAIN TEXT, not HTML/markdown
    if (field !== 'body') {
      const text = this.htmlToPlainText(html);

      if (field === 'subject') this.mergeSubjectTemplate = text;
      else if (field === 'to') this.toField = text;
      else if (field === 'cc') this.ccField = text;
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      else if (field === 'bcc') this.bccField = text;

      // Update preview after changing any field
      this.previewMerge();
      return;
    }

    // Body is stored as “markdown-ish” format using htmlToMarkdown conversion rules
    const markdown = this.htmlToMarkdown(html);
    this.mergeBodyTemplate = markdown;

    // Preview should stay in sync with body edits
    this.previewMerge();
  }

  private htmlToPlainText(html: string): string {
    // Create a temporary element to strip tags reliably
    const tmp = document.createElement('div');
    tmp.innerHTML = html || '';

    // innerText collapses tags like <div>, <br>, etc. into visual text
    let text = tmp.innerText || '';

    // Normalize NBSP and line endings
    text = text.replace(/\u00A0/g, ' ').replace(/\r\n/g, '\n');

    // Trim outer whitespace but keep internal newlines (needed for [[if]] blocks)
    return text.trim();
  }

  // eslint-disable-next-line @typescript-eslint/member-ordering
  renderTokens(field: MergeField): void {
    if (!this.hasSelectedProject) return;
    if (this.skipTokenRender) return;

    const el = document.getElementById(this.getElementId(field));
    if (!el) return;

    // Pick the right stored template string for this editor
    let md = '';
    if (field === 'body') md = this.mergeBodyTemplate;
    else if (field === 'subject') md = this.mergeSubjectTemplate;
    else if (field === 'to') md = this.toField;
    else if (field === 'cc') md = this.ccField;
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    else if (field === 'bcc') md = this.bccField;

    if (!md) md = '';

    // Convert markdown-ish into HTML so editors display formatting
    let html = this.convertMarkdownToHtml(md);

    // Only wrap tokens that match a spreadsheet header:
    // - prevents turning unknown strings into chips
    // - keeps user-typed {{something}} as literal text if not in headers
    html = html.replace(/{{\s*([^}]+)\s*}}/g, (_m, rawKey: string) => {
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      const key = String(rawKey ?? '').trim();

      if (!this.isKnownMergeField(key)) {
        return `{{${key}}}`;
      }

      return `<span class="merge-token" data-field="${this.escapeAttr(key)}" contenteditable="false" style="background:${this.getColorForField(
        key,
      )}">${this.escapeHtml(key)}</span>`;
    });

    // Hydrate editor DOM
    el.innerHTML = html;
  }

  private decorateTokensInHtml(html: string): string {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    const src = html ?? '';

    // Same token wrapping logic used by renderTokens(), but applied to a pre-rendered HTML string
    // (used for AI preview so it visually matches the editor)
    return src.replace(/{{\s*([^}]+)\s*}}/g, (_m, rawKey: string) => {
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      const key = String(rawKey ?? '').trim();
      if (!this.isKnownMergeField(key)) return `{{${key}}}`;

      return `<span class="merge-token" data-field="${this.escapeAttr(key)}" contenteditable="false" style="background:${this.getColorForField(
        key,
      )}">${this.escapeHtml(key)}</span>`;
    });
  }

  private isKnownMergeField(key: string): boolean {
    // A token is “known” only if it matches a spreadsheet column header exactly
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    const k = (key ?? '').trim();

    return !!k && Array.isArray(this.spreadsheetHeaders) && this.spreadsheetHeaders.includes(k);
  }

  private escapeAttr(s: string): string {
    // Escape attribute quotes to prevent broken HTML
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    return String(s ?? '').replace(/"/g, '&quot;');
  }

  private escapeHtml(s: string): string {
    // Escape HTML special chars for safe innerHTML insertion
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  /**
   * If user types {{name}} and “name” is a known spreadsheet header,
   * replace just that text range with a token chip WITHOUT re-rendering entire editor.
   * This avoids contenteditable caret jumps.
   */
  private tryConvertTypedTokenAtCaret(field: MergeField, rootEl: HTMLElement): void {
    // Only do this when headers exist; otherwise everything would be “unknown”
    if (!this.spreadsheetHeaders.length) return;

    // Avoid re-entrancy during DOM mutation
    if (this.autoTokenInsertInProgress) return;

    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;

    const caretRange = sel.getRangeAt(0);
    if (!caretRange.collapsed) return;

    // Ensure caret is inside the current editor element
    const common = caretRange.commonAncestorContainer;
    const commonEl = common instanceof Element ? common : common.parentElement;
    if (!commonEl || !rootEl.contains(commonEl)) return;

    // Build a string from start of editor to caret
    const pre = document.createRange();
    pre.selectNodeContents(rootEl);
    pre.setEnd(caretRange.endContainer, caretRange.endOffset);

    const preText = pre.toString();
    if (!preText) return;

    // Only trigger when token closes with }}
    if (!preText.endsWith('}}')) return;

    // Inspect only last 200 chars to avoid huge strings
    const tail = preText.slice(Math.max(0, preText.length - 200));

    // Match a token right at the end: {{ something }}
    const m = tail.match(/{{\s*([^{}]+?)\s*}}$/);
    if (!m) return;

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    const key = (m[1] ?? '').trim();

    // Only convert if it matches spreadsheet headers
    if (!this.isKnownMergeField(key)) return;

    const matchLen = m[0].length;
    const tokenEndGlobal = preText.length;
    const tokenStartGlobal = tokenEndGlobal - matchLen;

    // Convert global text offsets to an actual DOM Range
    const tokenRange = this.makeRangeFromTextOffsets(rootEl, tokenStartGlobal, tokenEndGlobal);
    if (!tokenRange) return;

    this.autoTokenInsertInProgress = true;
    try {
      // Create chip span
      const span = document.createElement('span');
      span.className = 'merge-token';
      span.setAttribute('data-field', key);
      span.setAttribute('contenteditable', 'false');
      span.setAttribute('style', `background:${this.getColorForField(key)}`);
      span.textContent = key;

      // Replace token text with chip
      tokenRange.deleteContents();
      tokenRange.insertNode(span);

      // Add a trailing NBSP so typing continues cleanly
      const space = document.createTextNode('\u00A0');
      span.after(space);

      // Move caret after space
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
   * Best-effort approach that works well for typical typing patterns.
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

      // When our cumulative text length reaches start, capture start node + offset
      if (!startNode && pos + len >= start) {
        startNode = t;
        startOffset = Math.max(0, start - pos);
      }

      // When we reach end, capture end node + offset and stop
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
    // Assign a stable random HSL colour per token label
    const k = key.trim();
    if (!this.tokenColors[k]) {
      this.tokenColors[k] = `hsl(${Math.floor(Math.random() * 360)}, 70%, 50%)`;
    }
    return this.tokenColors[k];
  }

  private getElementId(field: MergeField): string {
    // Single mapping for editor DOM element ids used in HTML
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

  // ===========================================================================
  // Formatting (bold/italic/underline) + selection persistence
  // ===========================================================================
  // eslint-disable-next-line @typescript-eslint/member-ordering
  formatFromToolbar(event: MouseEvent, type: 'bold' | 'italic' | 'underline'): void {
    if (!this.hasSelectedProject) return;

    // Prevent toolbar click from doing anything else (focus stealing, navigation)
    event.preventDefault();
    event.stopPropagation();

    // Restore selection in mergeBody (toolbar click steals focus)
    this.restoreBodySelection();

    // Apply formatting to the restored selection
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

    // If caret is collapsed, expand to current word so toggles work predictably
    this.expandSelectionToWordIfCollapsed(sel, bodyEl);

    // If still nothing selected, nothing to format
    if (!sel.toString()) return;

    // Ensure selection lives inside mergeBody (avoid formatting other fields)
    const range = sel.getRangeAt(0);
    const common = range.commonAncestorContainer;
    const commonEl = common instanceof Element ? common : common.parentElement;
    if (!commonEl || !bodyEl.contains(commonEl)) return;

    if (type === 'bold') {
      // Deterministic bold (no execCommand) so you can control behaviour around tokens
      this.toggleStrongOnSelection(sel, bodyEl);
    } else {
      // Keep existing behaviour for italic/underline (they're working)
      const command = type === 'italic' ? 'italic' : 'underline';
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      document.execCommand(command, false);
    }

    // Save selection AFTER changes so toolbar keeps working for next click
    this.saveBodySelection();

    // Sync editor DOM → markdown template
    this.onEditorInput('body');

    // Keep preview in sync
    this.previewMerge();
  }

  /**
   * Toggle <strong> around selection deterministically:
   * - If selection fully bold -> unwrap strong within selection
   * - Else -> wrap selection in strong
   */
  private toggleStrongOnSelection(sel: Selection, bodyEl: HTMLElement): void {
    if (!sel.rangeCount) return;

    const range = sel.getRangeAt(0);
    if (range.collapsed) return;

    const fullyBold = this.selectionIsFullyInStrong(range, bodyEl);

    if (fullyBold) {
      this.unwrapStrongInRange(range, bodyEl);
    } else {
      this.wrapRangeWithStrong(range);
    }

    // Attempt to restore selection after DOM operations
    try {
      sel.removeAllRanges();
      sel.addRange(range);
    } catch {
      // ignore
    }
  }

  private selectionIsFullyInStrong(range: Range, root: HTMLElement): boolean {
    const startStrong = this.closestTag(range.startContainer, 'STRONG', root);
    const endStrong = this.closestTag(range.endContainer, 'STRONG', root);
    if (!startStrong || !endStrong) return false;

    // Walk text nodes intersecting the range and ensure each is inside <strong>
    const walker = document.createTreeWalker(range.commonAncestorContainer, NodeFilter.SHOW_TEXT, {
      acceptNode(node: Node) {
        if (!(node instanceof Text)) return NodeFilter.FILTER_REJECT;
        if (!node.data.trim()) return NodeFilter.FILTER_REJECT;

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
    const strong = document.createElement('strong');

    // Extract selection contents into a fragment and place inside <strong>
    const frag = range.extractContents();
    strong.appendChild(frag);

    // Insert strong back where the selection was
    range.insertNode(strong);

    // Select the content of the newly inserted element
    range.selectNodeContents(strong);
  }

  private unwrapStrongInRange(range: Range, root: HTMLElement): void {
    // Find all strong tags that intersect range and unwrap them
    const strongs = Array.from(root.querySelectorAll('strong')).filter(s => this.nodeIntersectsRange(s, range));
    strongs.forEach(s => this.unwrapElement(s));
  }

  private unwrapElement(el: HTMLElement): void {
    const parent = el.parentNode;
    if (!parent) return;

    // Move children out into parent and remove wrapper element
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

    // Only store selection if it’s inside mergeBody
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
      // If DOM changed and range is no longer valid, drop it
      this.savedBodyRange = null;
    }
  }

  private expandSelectionToWordIfCollapsed(sel: Selection, bodyEl: HTMLElement): void {
    if (!sel.rangeCount) return;

    const range = sel.getRangeAt(0);
    if (!range.collapsed) return;

    const common = range.commonAncestorContainer;
    const commonEl = common instanceof Element ? common : common.parentElement;
    if (!commonEl || !bodyEl.contains(commonEl)) return;

    const node = range.startContainer;
    if (!(node instanceof Text)) return;

    const text = node.data;
    const idx = range.startOffset;

    if (!text || idx < 0 || idx > text.length) return;

    // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
    const isWordChar = (c: string) => /[A-Za-z0-9_]/.test(c);

    let start = idx;
    let end = idx;

    if (start > 0 && !isWordChar(text[start]) && isWordChar(text[start - 1])) start--;

    while (start > 0 && isWordChar(text[start - 1])) start--;
    while (end < text.length && isWordChar(text[end])) end++;

    if (start === end) return;

    const wordRange = document.createRange();
    wordRange.setStart(node, start);
    wordRange.setEnd(node, end);

    sel.removeAllRanges();
    sel.addRange(wordRange);

    // Store it for toolbar restore
    this.savedBodyRange = wordRange.cloneRange();
  }

  // ===========================================================================
  // Markdown-ish conversions (HTML <-> Markdown-ish)
  // ===========================================================================
  private htmlToMarkdown(html: string): string {
    return (
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      (html ?? '')
        // HTTPS-only: <a href="https://...">text</a> -> [text](https://...)
        .replace(/<a[^>]*href="(https:\/\/[^"]+)"[^>]*>(.*?)<\/a>/gi, '[$2]($1)')

        // execCommand sometimes emits <span style="font-weight:..."> for bold
        .replace(/<span[^>]*style="[^"]*font-weight\s*:\s*(bold|600|700|800|900)[^"]*"[^>]*>(.*?)<\/span>/gi, '**$2**')
        // Italic spans
        .replace(/<span[^>]*style="[^"]*font-style\s*:\s*italic[^"]*"[^>]*>(.*?)<\/span>/gi, '_$1_')
        // Underline spans
        .replace(/<span[^>]*style="[^"]*text-decoration\s*:\s*underline[^"]*"[^>]*>(.*?)<\/span>/gi, '~$1~')

        // Normal tag-based formatting
        .replace(/<strong[^>]*>(.*?)<\/strong>/gi, '**$1**')
        .replace(/<b[^>]*>(.*?)<\/b>/gi, '**$1**')
        .replace(/<i[^>]*>(.*?)<\/i>/gi, '_$1_')
        .replace(/<em[^>]*>(.*?)<\/em>/gi, '_$1_')
        .replace(/<u[^>]*>(.*?)<\/u>/gi, '~$1~')

        // Line breaks and spaces
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/&nbsp;/g, ' ')
        .trim()
    );
  }

  private convertMarkdownToHtml(md: string): string {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    const src = md ?? '';

    // Convert HTTPS-only markdown links into safe anchors
    const withLinks = src.replace(/\[([^\]]+)\]\((https:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

    // Apply bold/italic/underline conversions, then newlines -> <br>
    return withLinks
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/__(.*?)__/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<i>$1</i>')
      .replace(/_(.*?)_/g, '<i>$1</i>')
      .replace(/~(.*?)~/g, '<u>$1</u>')
      .replace(/\n/g, '<br>');
  }

  // ===========================================================================
  // Paste handling for inline images
  // ===========================================================================
  // eslint-disable-next-line @typescript-eslint/member-ordering
  onEditorPaste(event: ClipboardEvent, where: 'body' | 'signature'): void {
    const items = event.clipboardData?.items;
    if (!items) return;

    // Only intercept paste if clipboard contains an image file
    const imageItem = Array.from(items).find(i => i.kind === 'file' && i.type.startsWith('image/'));
    if (!imageItem) return;

    event.preventDefault();

    const file = imageItem.getAsFile();
    if (!file) return;

    // Convert image to data URL and insert <img src="data:...">
    const reader = new FileReader();
    reader.onload = () => {
      // eslint-disable-next-line @typescript-eslint/no-base-to-string
      const dataUrl = String(reader.result ?? '');
      if (!dataUrl.startsWith('data:image/')) return;

      // Insert into editor at caret for immediate preview
      this.insertHtmlAtCaret(`<img src="${dataUrl}" style="max-width:220px;height:auto;" />`);

      // Sync the right model based on paste target
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

    // Parse HTML into nodes and insert as fragment
    const temp = document.createElement('div');
    temp.innerHTML = html;

    const frag = document.createDocumentFragment();
    let node: ChildNode | null;
    let last: ChildNode | null = null;

    while ((node = temp.firstChild)) {
      last = frag.appendChild(node);
    }

    range.insertNode(frag);

    // Move caret after inserted HTML
    if (last) {
      range.setStartAfter(last);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
    }
  }

  // ===========================================================================
  // Link insertion modal
  // ===========================================================================
  // eslint-disable-next-line @typescript-eslint/member-ordering
  insertHttpsLink(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();

    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;

    const text = sel.toString().trim();
    if (!text) {
      // No selection -> do nothing (you could toast if you want)
      return;
    }

    // Save selection so we can insert after modal steals focus
    this.savedLinkRange = sel.getRangeAt(0).cloneRange();

    // Prefill modal fields
    this.linkTextDraft = text;
    this.linkUrlDraft = 'https://';
    this.linkError = null;
    this.linkModalOpen = true;

    // Focus URL input after modal render
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

    // Enforce HTTPS-only for safety + consistency with markdown converter
    if (!url.startsWith('https://')) {
      this.linkError = 'URL must start with https://';
      return;
    }

    // Restore selection range and insert anchor
    const sel = window.getSelection();
    if (sel && this.savedLinkRange) {
      sel.removeAllRanges();
      sel.addRange(this.savedLinkRange);
    }

    this.insertHtmlAtCaret(`<a href="${url}" target="_blank" rel="noopener noreferrer">${text}</a>`);

    // Sync editor -> template -> preview, then re-render token chips
    this.onEditorInput('body');
    setTimeout(() => this.renderTokens('body'));

    this.closeLinkModal();
  }

  // ===========================================================================
  // Signature helpers
  // ===========================================================================
  // eslint-disable-next-line @typescript-eslint/member-ordering
  saveSignature(): void {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    const sig = (this.signatureDraftHtml ?? '').trim();

    // Capture current body edits before we apply signature changes
    this.onEditorInput('body');

    // Calls SignatureService.update(sig) (backend persists signature for account)
    this.signatureService.update(sig).subscribe({
      next: () => {
        this.signatureSaved = sig;

        // Ensure body has latest saved signature appended consistently
        this.applySignatureToBody();
      },
      error: err => console.error('❌ Failed to save signature', err),
    });
  }

  // eslint-disable-next-line @typescript-eslint/member-ordering
  onSignatureInput(): void {
    const el = document.getElementById('signatureEditor');
    if (!el) return;

    // Store signature in markdown-ish format (preserves <img> via htmlToMarkdown rules)
    this.signatureDraftHtml = this.htmlToMarkdown(el.innerHTML);
  }

  private stripSignatureBlock(body: string): string {
    // Remove trailing whitespace and locate the signature delimiter
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    const b = (body ?? '').replace(/\s+$/g, '');
    const idx = b.lastIndexOf(this.SIGN_DELIM);

    // If delimiter exists, keep everything before it; else return original body
    return idx >= 0 ? b.slice(0, idx).replace(/\s+$/g, '') : b;
  }

  private upsertSignature(body: string, signature: string): string {
    // Remove existing signature block and append the current saved signature
    const base = this.stripSignatureBlock(body);
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    const sig = (signature ?? '').trim();

    // If user has no saved signature, return base content only
    if (!sig) return base;

    // If body has content, append delimiter + signature; else signature becomes full body
    return base ? `${base}${this.SIGN_DELIM}${sig}` : sig;
  }

  private applySignatureToBody(): void {
    // Sync latest body edits into mergeBodyTemplate
    this.onEditorInput('body');

    // Rebuild signature block at bottom using saved signature
    this.mergeBodyTemplate = this.upsertSignature(this.mergeBodyTemplate, this.signatureSaved);

    // Refresh preview and return to compose
    this.previewMerge();
    this.activePanel = 'compose';

    // Re-render body so signature appears visually in editor
    setTimeout(() => this.renderTokens('body'));
  }

  /**
   * Converts body markdown-ish into HTML and replaces data: images with cid: links.
   * This prepares the payload expected by backend mail sending (Graph / MIME inline parts).
   */
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

      // Generate a unique cid (prefer crypto.randomUUID if available)
      // eslint-disable-next-line @typescript-eslint/restrict-plus-operands
      const cid = `img_${(crypto as any).randomUUID ? crypto.randomUUID() : Date.now() + '_' + idx}`;
      const ext = fileContentType.split('/')[1] || 'png';

      inlineImages.push({
        cid,
        fileContentType,
        base64,
        name: `inline_${idx}.${ext}`,
      });

      // Rewrite <img src="data:..."> -> <img src="cid:..."> so email clients render inline
      img.setAttribute('src', `cid:${cid}`);
    });

    return { htmlWithCid: doc.body.innerHTML, inlineImages };
  }

  // ===========================================================================
  // Bottom drawer UX
  // ===========================================================================
  // eslint-disable-next-line @typescript-eslint/member-ordering
  toggleDrawer(which: 'ai' | 'preview'): void {
    this.drawerOpen[which] = !this.drawerOpen[which];
  }

  // eslint-disable-next-line @typescript-eslint/member-ordering
  toggleBottomPanel(which: 'preview' | 'ai'): void {
    if (which === 'preview') {
      this.bottomPreviewOpen = !this.bottomPreviewOpen;

      // When opening preview panel, refresh it to ensure it reflects current edits
      if (this.bottomPreviewOpen) {
        this.previewMerge();
      }
      return;
    }

    this.bottomAiOpen = !this.bottomAiOpen;
  }

  // eslint-disable-next-line @typescript-eslint/member-ordering
  trackByRowIndex = (i: number): number => i;

  // ===========================================================================
  // Sidebar: Search / Filter
  // ===========================================================================
  // eslint-disable-next-line @typescript-eslint/member-ordering
  toggleFolder(key: 'PENDING' | 'FAILED' | 'SENT'): void {
    this.folderOpen[key] = !this.folderOpen[key];
  }

  private matchesSearch(p: Project, q: string): boolean {
    if (!q) return true;

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    const name = (p.name ?? '').toLowerCase();

    // status may be enum string or missing; treat missing as ''
    const status = String((p as any).status ?? '').toLowerCase();
    return name.includes(q) || status.includes(q);
  }

  get filteredAllProjects(): Project[] {
    const q = this.projectSearch.trim().toLowerCase();
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    const list = this.projects ?? [];
    if (!q) return list;
    return list.filter(p => this.matchesSearch(p, q));
  }

  get ungroupedProjects(): Project[] {
    // Projects without status (new/unsaved/migrated edge cases)
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

  // ===========================================================================
  // Validation + error UX for send/test
  // ===========================================================================
  private showValidationError(message: string): void {
    // Clear async state flags so UI doesn’t get stuck in “sending” mode
    this.testErr.set(false);
    this.mergeErr.set(false);
    this.testSending.set(false);
    this.mergeSending.set(false);

    // Display the error message prominently
    this.showToast('error', message);
  }

  // Optional: small helper so send/test share the same guard
  private guardBeforeSendOrTest(): boolean {
    // Sync editor DOM -> models for address fields before validating
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

    if (/\s/.test(e)) return false;

    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!re.test(e)) return false;

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

  private validateEmailFieldForAllRows(field: 'to' | 'cc' | 'bcc', required: boolean): { ok: true } | { ok: false; message: string } {
    const template = field === 'to' ? this.toField : field === 'cc' ? this.ccField : this.bccField;
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    const tpl = (template ?? '').trim();

    if (!tpl) {
      return required ? { ok: false, message: 'The “To” field is required.' } : { ok: true };
    }

    // If we have no rows, we can’t validate per-row token replacements yet
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (!this.spreadsheetRows || this.spreadsheetRows.length === 0) {
      return { ok: true };
    }

    const hasConditionals = this.templateHasConditionals(tpl);

    for (let i = 0; i < this.spreadsheetRows.length; i++) {
      const row = this.spreadsheetRows[i];

      // Conditionals -> thunderbird inline -> token replacement for this row
      const resolved = this.renderTemplateForRow(tpl, row).trim();

      if (!resolved) {
        // If required field resolves empty due to conditionals, skip that row (server will skip too)
        if (required && hasConditionals) {
          continue;
        }

        if (required) {
          return {
            ok: false,
            message: `Row ${i + 1}: “To” resolves to empty. Use a valid email column or a conditional that produces an email.`,
          };
        }
        continue;
      }

      const emails = resolved
        .split(/[;,]/)
        .map(e => e.trim())
        .filter(Boolean);

      if (required && emails.length === 0) {
        if (hasConditionals) continue;
        return { ok: false, message: `Row ${i + 1}: “To” resolves to empty.` };
      }

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

  // ===========================================================================
  // Conditionals [[if]] + thunderbird inline + per-row renderer
  // ===========================================================================
  private templateHasConditionals(s: string): boolean {
    const t = s || '';

    // Block syntax
    if (t.includes('[[if') || t.includes('[[else]]') || t.includes('[[endif]]')) return true;

    // Inline “thunderbird-style” syntax
    return /{{[^}]*\|[^}]*}}/.test(t);
  }

  /** Apply conditionals first (block + thunderbird), then {{token}} replacement */
  private renderTemplateForRow(template: string, row: Record<string, string>): string {
    const withBlocks = this.applyConditionals(template || '', row);
    const withThunderbird = this.applyThunderbirdInlineConditionals(withBlocks, row);
    return this.replaceTokens(withThunderbird, row);
  }

  private applyConditionals(template: string, row: Record<string, string>): string {
    const src = template || '';
    if (!this.templateHasConditionals(src)) return src;

    type Frame = { parentActive: boolean; condTrue: boolean; inElse: boolean };

    const stack: Frame[] = [];
    let out = '';
    let i = 0;

    const isCurrentlyActive = (): boolean => {
      for (const f of stack) {
        const branchActive = f.inElse ? !f.condTrue : f.condTrue;
        if (!(f.parentActive && branchActive)) return false;
      }
      return true;
    };

    while (i < src.length) {
      const next = src.indexOf('[[', i);
      if (next === -1) {
        if (isCurrentlyActive()) out += src.slice(i);
        break;
      }

      // Emit plain text before tag
      if (next > i && isCurrentlyActive()) {
        out += src.slice(i, next);
      }
      i = next;

      if (src.startsWith('[[if', i)) {
        const close = src.indexOf(']]', i);
        if (close === -1) {
          if (isCurrentlyActive()) out += src.slice(i);
          break;
        }

        const inner = src.slice(i + '[[if'.length, close).trim();
        i = close + 2;

        const parentActive = isCurrentlyActive();
        const condTrue = parentActive ? this.evalCondition(inner, row) : false;

        stack.push({ parentActive, condTrue, inElse: false });
        continue;
      }

      if (src.startsWith('[[else]]', i)) {
        i += '[[else]]'.length;
        const top = stack[stack.length - 1];
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (top) top.inElse = true;
        continue;
      }

      if (src.startsWith('[[endif]]', i)) {
        i += '[[endif]]'.length;
        stack.pop();
        continue;
      }

      // Unknown [[...]] -> treat as literal
      if (isCurrentlyActive()) out += '[[';
      i += 2;
    }

    return out;
  }

  private decodeHtmlEntities(s: string): string {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    return (s ?? '')
      .replace(/&gt;/g, '>')
      .replace(/&lt;/g, '<')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
  }

  private evalCondition(expr: string, row: Record<string, string>): boolean {
    // Decode HTML entities (important if editor produced &gt;=)
    const e = this.decodeHtmlEntities((expr || '').trim());
    if (!e) return false;

    const m = e.match(/^(.+?)\s*(==|!=|>=|<=|>|<)\s*(.+)$/);
    if (!m) {
      const v = this.resolveOperand(e, row);
      return this.isTruthy(v);
    }

    const leftRaw = m[1].trim();
    const op = m[2].trim();
    const rightRaw = m[3].trim();

    const left = this.resolveOperand(leftRaw, row);
    const right = this.resolveOperand(rightRaw, row);

    const leftNum = this.tryNumber(left);
    const rightNum = this.tryNumber(right);

    const bothNumeric = leftNum != null && rightNum != null;

    if (bothNumeric) {
      if (op === '==') return leftNum === rightNum;
      if (op === '!=') return leftNum !== rightNum;
      if (op === '>') return leftNum > rightNum;
      if (op === '>=') return leftNum >= rightNum;
      if (op === '<') return leftNum < rightNum;
      if (op === '<=') return leftNum <= rightNum;
      return false;
    }

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    const ls = String(left ?? '');
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    const rs = String(right ?? '');

    if (op === '==') return ls === rs;
    if (op === '!=') return ls !== rs;
    if (op === '>') return ls > rs;
    if (op === '>=') return ls >= rs;
    if (op === '<') return ls < rs;
    if (op === '<=') return ls <= rs;

    return false;
  }

  private resolveOperand(raw: string, row: Record<string, string>): string {
    const r = (raw || '').trim();

    const dq = r.match(/^"(.*)"$/);
    if (dq) return dq[1];

    const sq = r.match(/^'(.*)'$/);
    if (sq) return sq[1];

    if (/^(true|false)$/i.test(r)) return r.toLowerCase();

    if (/^-?\d+(\.\d+)?$/.test(r)) return r;

    const token = r.match(/^{{\s*([^}]+)\s*}}$/);
    if (token) {
      const key = (token[1] || '').trim();
      return String((row as any)[key] ?? '').trim();
    }

    // If token-only is enforced, bare column names resolve to empty
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (this.REQUIRE_TOKENS_IN_CONDITIONS) {
      return '';
    }

    return String((row as any)[r] ?? '').trim();
  }

  private tryNumber(v: string): number | null {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    const s = String(v ?? '').trim();
    if (!s) return null;

    const m = s.match(/-?\d+(\.\d+)?/);
    if (!m) return null;

    const n = Number(m[0]);
    return Number.isFinite(n) ? n : null;
  }

  private isTruthy(v: string): boolean {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    const s = String(v ?? '')
      .trim()
      .toLowerCase();
    if (!s) return false;
    if (s === 'false') return false;
    if (s === '0') return false;
    return true;
  }

  // eslint-disable-next-line @typescript-eslint/member-ordering
  onConditionSnippetDragStart(event: DragEvent, snippet: 'if' | 'nestedIf' | 'thunderbird'): void {
    if (!this.hasSelectedProject) return;

    // Drag-and-drop snippets into body/subject/to fields to guide user syntax
    const text =
      snippet === 'if'
        ? '[[if {{COLUMN}} == "VALUE"]]\nYOUR_TEXT\n[[else]]\nELSE_TEXT\n[[endif]]'
        : snippet === 'nestedIf'
          ? '[[if {{A}} == "X"]]\nTEXT_A\n[[else]]\n  [[if {{B}} == "Y"]]\n  TEXT_B\n  [[else]]\n  TEXT_C\n  [[endif]]\n[[endif]]'
          : '{{COLUMN|==|"VALUE"|THEN_TEXT|ELSE_TEXT}}';

    event.dataTransfer?.setData('text/plain', text);
  }

  // Thunderbird-style inline conditionals
  private applyThunderbirdInlineConditionals(template: string, row: Record<string, string>): string {
    let src = template || '';
    if (!/{{[^}]*\|[^}]*}}/.test(src)) return src;

    const MAX_PASSES = 6;

    for (let pass = 0; pass < MAX_PASSES; pass++) {
      let changed = false;

      src = src.replace(/{{\s*([^{}]*\|[^{}]*)\s*}}/g, (full, innerRaw: string) => {
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        const parts = this.splitPipesRespectingQuotes(String(innerRaw ?? '').trim());
        if (parts.length < 2) return full;

        const field = (parts[0] ?? '').trim();
        const op = ((parts[1] ?? '') + '').trim();

        const rawValue = (parts[2] ?? '').trim();
        const thenPart = parts.length >= 4 ? (parts[3] ?? '') : '';
        const elsePart = parts.length >= 5 ? (parts[4] ?? '') : '';

        const left = String((row as any)[field] ?? '').trim();
        const right = this.resolveThunderbirdValue(rawValue, row);

        const ok = this.evalThunderbirdOp(left, op, right);

        changed = true;
        return ok ? thenPart : elsePart;
      });

      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (!changed) break;
    }

    return src;
  }

  private splitPipesRespectingQuotes(s: string): string[] {
    const out: string[] = [];
    let cur = '';
    let q: '"' | "'" | null = null;
    let esc = false;

    // eslint-disable-next-line @typescript-eslint/prefer-for-of
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];

      if (esc) {
        cur += ch;
        esc = false;
        continue;
      }

      if (ch === '\\') {
        esc = true;
        continue;
      }

      if ((ch === '"' || ch === "'") && !q) {
        q = ch as any;
        cur += ch;
        continue;
      }

      if (q && ch === q) {
        q = null;
        cur += ch;
        continue;
      }

      if (!q && ch === '|') {
        out.push(cur);
        cur = '';
        continue;
      }

      cur += ch;
    }

    out.push(cur);
    return out.map(p => p.replace(/\\\|/g, '|').trim());
  }

  private resolveThunderbirdValue(raw: string, row: Record<string, string>): string {
    const r = (raw || '').trim();
    if (!r) return '';

    const dq = r.match(/^"(.*)"$/);
    if (dq) return dq[1];

    const sq = r.match(/^'(.*)'$/);
    if (sq) return sq[1];

    const token = r.match(/^{{\s*([^}]+)\s*}}$/);
    if (token) {
      const key = (token[1] || '').trim();
      return String((row as any)[key] ?? '').trim();
    }

    if (/^(true|false)$/i.test(r)) return r.toLowerCase();
    if (/^-?\d+(\.\d+)?$/.test(r)) return r;

    return r;
  }

  private evalThunderbirdOp(leftRaw: string, opRaw: string, rightRaw: string): boolean {
    const op = (opRaw || '').trim();
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    const left = String(leftRaw ?? '').trim();
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    const right = String(rightRaw ?? '').trim();

    const ln = this.tryNumber(left);
    const rn = this.tryNumber(right);
    const bothNumeric = ln != null && rn != null;

    const lc = left.toLowerCase();
    const rc = right.toLowerCase();

    switch (op) {
      case '==':
        return bothNumeric ? ln === rn : left === right;
      case '!=':
        return bothNumeric ? ln !== rn : left !== right;
      case '>':
        return bothNumeric ? ln > rn : left > right;
      case '>=':
        return bothNumeric ? ln >= rn : left >= right;
      case '<':
        return bothNumeric ? ln < rn : left < right;
      case '<=':
        return bothNumeric ? ln <= rn : left <= right;

      case 'contains':
        return lc.includes(rc);
      case 'startsWith':
        return lc.startsWith(rc);
      case 'endsWith':
        return lc.endsWith(rc);

      case 'empty':
        return !left.trim();
      case 'notEmpty':
        return !!left.trim();

      case 'truthy':
        return this.isTruthy(left);
      case 'falsy':
        return !this.isTruthy(left);

      default:
        return false;
    }
  }

  // ===========================================================================
  // Conditionals-aware send payload builder
  // ===========================================================================
  private applyInlineCidsToHtml(html: string, inlineImages: InlineImage[]): string {
    // Build a lookup map from “image identity” to cid
    const map = new Map<string, string>();
    inlineImages.forEach(img => {
      const key = `${img.fileContentType}|${img.base64}`;
      map.set(key, img.cid);
    });

    // Parse html and replace any matching data: images with cid: versions
    const doc = new DOMParser().parseFromString(html || '', 'text/html');
    const imgs = Array.from(doc.querySelectorAll('img'));

    imgs.forEach(img => {
      const src = img.getAttribute('src') ?? '';
      if (!src.startsWith('data:image/')) return;

      const match = src.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
      if (!match) return;

      const fileContentType = match[1];
      const base64 = match[2];
      const cid = map.get(`${fileContentType}|${base64}`);
      if (!cid) return;

      img.setAttribute('src', `cid:${cid}`);
    });

    return doc.body.innerHTML;
  }

  private buildAdvancedPayloadRespectingConditionals(): {
    subjectTemplate: string;
    bodyTemplate: string;
    inlineImages: InlineImage[];
    toTemplate: string;
    ccTemplate: string;
    bccTemplate: string;
    spreadsheet: string | null;
    spreadsheetFileContentType: string | null;
    attachments: { name: string; fileContentType: string; file: string }[];
  } {
    // Detect whether any templates contain conditionals
    const hasConds =
      this.templateHasConditionals(this.mergeSubjectTemplate) ||
      this.templateHasConditionals(this.mergeBodyTemplate) ||
      this.templateHasConditionals(this.toField) ||
      this.templateHasConditionals(this.ccField) ||
      this.templateHasConditionals(this.bccField);

    // No conditionals -> keep existing “server does token replacement itself” behaviour
    if (!hasConds) {
      const { htmlWithCid, inlineImages } = this.buildEmailHtmlForSending(this.mergeBodyTemplate);
      return {
        subjectTemplate: this.mergeSubjectTemplate,
        bodyTemplate: htmlWithCid,
        inlineImages,
        toTemplate: this.toField,
        ccTemplate: this.ccField,
        bccTemplate: this.bccField,
        spreadsheet: this.spreadsheetBase64,
        spreadsheetFileContentType: this.spreadsheetFileContentType,
        attachments: this.attachments.map(a => ({ name: a.name, fileContentType: a.fileContentType, file: a.base64 })),
      };
    }

    // Conditionals present:
    // We precompute per-row final values into extra spreadsheet columns.
    // Backend then just replaces {{__to}}, {{__subject}}, {{__body}}, etc.
    const { inlineImages } = this.buildEmailHtmlForSending(this.mergeBodyTemplate);

    const baseHeaders = this.spreadsheetHeaders.slice();
    const extraHeaders = ['__to', '__cc', '__bcc', '__subject', '__body'];
    const headers = [...baseHeaders, ...extraHeaders];

    const aoa: (string | number | boolean | null)[][] = [headers];

    for (const row of this.spreadsheetRows) {
      const baseVals = baseHeaders.map(h => String((row as any)[h] ?? ''));

      const finalTo = this.renderTemplateForRow(this.toField, row);
      const finalCc = this.renderTemplateForRow(this.ccField, row);
      const finalBcc = this.renderTemplateForRow(this.bccField, row);
      const finalSubject = this.renderTemplateForRow(this.mergeSubjectTemplate, row);

      const finalBodyMd = this.renderTemplateForRow(this.mergeBodyTemplate, row);
      const finalBodyHtml = this.convertMarkdownToHtml(finalBodyMd);
      const finalBodyHtmlWithCid = this.applyInlineCidsToHtml(finalBodyHtml, inlineImages);

      aoa.push([...baseVals, finalTo, finalCc, finalBcc, finalSubject, finalBodyHtmlWithCid]);
    }

    // Build a new workbook with the extra columns and encode as base64
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');

    const base64Xlsx = XLSX.write(wb, { bookType: 'xlsx', type: 'base64' });

    return {
      subjectTemplate: '{{__subject}}',
      bodyTemplate: '{{__body}}',
      inlineImages,
      toTemplate: '{{__to}}',
      ccTemplate: '{{__cc}}',
      bccTemplate: '{{__bcc}}',
      spreadsheet: base64Xlsx,
      spreadsheetFileContentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      attachments: this.attachments.map(a => ({ name: a.name, fileContentType: a.fileContentType, file: a.base64 })),
    };
  }
}
