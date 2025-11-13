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

  // spreadsheet blob
  spreadsheetBase64: string | null = null;
  spreadsheetFileContentType: string | null = null;

  // New email fields
  toField = '';
  ccField = '';
  bccField = '';

  // Attachments
  attachments: { name: string; size: number; fileContentType: string; base64: string }[] = [];

  mergeSending = signal(false);
  mergeOk = signal(false);
  mergeErr = signal(false);
  saving = false;
  saveSuccess = false;
  sendSuccess = false;

  spreadsheetHeaders: string[] = [];
  previewEmails: {
    to: string;
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

  ngOnInit(): void {
    this.accountService.identity().subscribe(account => this.account.set(account));

    this.route.params.subscribe(params => {
      const idParam = params['id'];
      if (idParam) {
        this.projectId = Number(idParam);
        this.loadProject(this.projectId);
      }
    });
  }

  /** Redirects back to the project page **/
  goBack(): void {
    void this.router.navigate(['/project']);
  }

  /** Makes the user log in  **/
  login(): void {
    this.loginService.login();
  }

  /** DRAG & DROP **/
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

  /** Spreadsheet upload function **/
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

  /** Remove the currently attached spreadsheet */
  removeSpreadsheet(): void {
    this.mergeFile = null;
    this.spreadsheetBase64 = null;
    this.spreadsheetFileContentType = null;
    this.spreadsheetHeaders = [];
    this.previewEmails = [];
  }

  /** This is for adding mutliple attachments **/
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

  /** This is for removing attachments **/
  removeAttachment(index: number): void {
    this.attachments.splice(index, 1);
  }

  /** Used to load the project which was selected **/
  loadProject(id: number): void {
    this.projectService.find(id).subscribe({
      next: p => {
        this.project = p;

        // Load all project fields safely
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        this.projectName = p.name ?? '';
        this.mergeSubjectTemplate = p.header ?? '';
        this.mergeBodyTemplate = p.content ?? '';
        this.toField = (p as any).toField ?? '';
        this.ccField = (p as any).ccField ?? '';
        this.bccField = (p as any).bccField ?? '';

        // Handle spreadsheet blob from backend
        if (p.spreadsheetLink) {
          this.spreadsheetBase64 = p.spreadsheetLink;
          this.spreadsheetFileContentType = (p as any).spreadsheetFileContentType ?? 'application/octet-stream';

          // Optionally rebuild a File object for preview (if you want to treat it as a real file again)
          const byteCharacters = atob(p.spreadsheetLink);
          const byteNumbers = new Array(byteCharacters.length);
          for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
          }
          const byteArray = new Uint8Array(byteNumbers);
          this.mergeFile = new File([byteArray], 'uploaded_spreadsheet.xlsx', {
            type: this.spreadsheetFileContentType!,
          });

          this.parseSpreadsheetForHeaders(this.mergeFile);
        }

        this.previewMerge();
        this.http.get<any[]>(`/api/attachments/project/${id}`).subscribe({
          next: attachments => {
            this.attachments = attachments.map(a => ({
              name: a.name,
              size: a.size,
              fileContentType: a.fileContentType,
              base64: a.file, // ensure backend returns the Base64
            }));
          },
          error: err => console.error('❌ Failed to load attachments', err),
        });
      },
      error: err => console.error('❌ Failed to load project', err),
    });
  }

  /** This is the function to save a project  **/
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

    // Update project first
    this.projectService.update(updated).subscribe({
      next: proj => {
        this.project = proj;

        //  Then upload attachments, if any
        if (this.attachments.length > 0) {
          const attachmentDTOs = this.attachments.map(a => ({
            file: a.base64,
            fileContentType: a.fileContentType,
            name: a.name,
            size: a.size,
          }));

          this.http.post(`/api/attachments/project/${this.projectId}`, attachmentDTOs).subscribe({
            next: () => {
              this.saving = false;
              this.saveSuccess = true;
              setTimeout(() => (this.saveSuccess = false), 3000);
            },
            error: err => {
              console.error('❌ Failed to upload attachments', err);
              this.saving = false;
            },
          });
        } else {
          this.saving = false;
          this.saveSuccess = true;
          setTimeout(() => (this.saveSuccess = false), 3000);
        }
      },
      error: err => {
        console.error('❌ Save failed', err);
        this.saving = false;
      },
    });
  }

  /** This is the button to send a project **/
  sendProject(): void {
    if (!this.projectId || !this.mergeFile) {
      this.mergeErr.set(true);
      return;
    }

    this.mergeSending.set(true);
    this.mergeErr.set(false);

    const pendingProject: Project = {
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

    // Save the project first
    this.projectService.update(pendingProject).subscribe({
      next: () => {
        // Then trigger backend to send with all fields
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
        console.error('❌ Update before send failed', err);
        this.mergeSending.set(false);
        this.mergeErr.set(true);
      },
    });
  }

  /** This is used to preview the merge in the right hand panel **/
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

        const to = replaceTokens(this.toField) || '(missing To)';
        const subject = replaceTokens(this.mergeSubjectTemplate);
        const body = replaceTokens(this.mergeBodyTemplate);
        const cc = replaceTokens(this.ccField);
        const bcc = replaceTokens(this.bccField);

        return {
          to,
          body: `Subject: ${subject}\nCC: ${cc}\nBCC: ${bcc}\n\n${body}`,
          attachments: this.attachments,
        };
      });
    };

    reader.readAsArrayBuffer(this.mergeFile);
  }
  /** This is used to turn on and off the preview **/
  togglePreview(): void {
    if (this.previewVisible) {
      // already open? just regenerate so users see latest changes
      this.previewMerge();
    } else {
      // switch from How To → Preview
      this.previewVisible = true;
      this.howToVisible = false;
      this.previewMerge();
    }
  }

  /** This is to turn on and off the how to page **/
  toggleHowTo(): void {
    this.howToVisible = !this.howToVisible;
    if (this.howToVisible) {
      // when How To is open, hide the preview pane
      this.previewVisible = false;
    }
  }

  /** Helper to parse spreadsheet headers from a File object - used when getting headers for drag and drop */
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
}
