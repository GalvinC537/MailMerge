import { Component, OnInit, AfterViewInit, inject, signal } from '@angular/core';
import { Router, ActivatedRoute, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import * as XLSX from 'xlsx'; // imported to handle excel file parsing for mailmerge input

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
  // store loggined in user under account and the project object and id itself

  account = signal<Account | null>(null);
  projectId: number | null = null;
  project: Project | null = null;
  // Below holds the form values like its name etc
  projectName = '';
  mergeSubjectTemplate = '';
  mergeBodyTemplate = '';
  mergeFile: File | null = null;
  // Below used to track the sending state
  mergeSending = signal(false);
  mergeOk = signal(false);
  mergeErr = signal(false);
  // Flags set for UI used later on
  saving = false;
  saveSuccess = false;
  sendSuccess = false;

  previewEmails: { to: string; body: string }[] = [];
  previewVisible = true;
  howToVisible = false;
  spreadsheetHeaders: string[] = []; // This is for the headers used for the drag and drop feature

  private readonly projectService = inject(ProjectService);
  private readonly accountService = inject(AccountService);
  private readonly loginService = inject(LoginService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  // This is loaded when the component is intialised and it fetches the current logged in user, extracts project ID and loads the project

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

  //This runs once the view has rendered — show initial preview automatically
  ngAfterViewInit(): void {
    setTimeout(() => this.previewMerge(), 500); // delay ensures template is ready
  }

  // This function is the back button which allows the user to go back to the project page
  goBack(): void {
    void this.router.navigate(['/project']);
  }
  // redirects to the login page if user is not authenticated
  login(): void {
    this.loginService.login();
  }
  // WHen user uploads excel file this is called and stores the uploaded file in this.mergefile
  onMergeFileChange(event: Event): void {
    const input = event.target as HTMLInputElement | null;
    this.mergeFile = input?.files && input.files.length > 0 ? input.files[0] : null;

    if (!this.mergeFile) return;

    const reader = new FileReader();
    reader.onload = e => {
      const result = (e.target as FileReader).result;
      if (!result) return;

      const data = new Uint8Array(result as ArrayBuffer);
      const workbook = XLSX.read(data, { type: 'array' });
      const sheet = workbook.SheetNames[0];
      const sheetData = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheet], { header: 1 });

      // First row contains headers
      if (Array.isArray(sheetData) && sheetData.length > 0) {
        this.spreadsheetHeaders = (sheetData[0] as unknown as string[]).filter(h => !!h && h.trim() !== '');
      }

      this.previewMerge();
    };
    reader.readAsArrayBuffer(this.mergeFile);
  }

  // Below is used for drag and drop functionality
  onDragStart(event: DragEvent, header: string): void {
    event.dataTransfer?.setData('text/plain', `{{${header}}}`);
  }

  allowDrop(event: DragEvent): void {
    event.preventDefault();
  }

  onDrop(event: DragEvent, field: 'subject' | 'body'): void {
    event.preventDefault();
    const text = event.dataTransfer?.getData('text/plain') ?? '';

    if (field === 'subject') {
      const input = document.getElementById('mergeSubject') as HTMLInputElement;
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (input) {
        const start = input.selectionStart ?? 0;
        const end = input.selectionEnd ?? 0;
        const value = input.value;
        input.value = value.slice(0, start) + text + value.slice(end);
        this.mergeSubjectTemplate = input.value;
        this.previewMerge();
      }
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    } else if (field === 'body') {
      const textarea = document.getElementById('mergeBody') as HTMLTextAreaElement;
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (textarea) {
        const start = textarea.selectionStart || 0;
        const end = textarea.selectionEnd || 0;
        const value = textarea.value;
        textarea.value = value.slice(0, start) + text + value.slice(end);
        this.mergeBodyTemplate = textarea.value;
        this.previewMerge();
      }
    }
  }

  // This function loads the project from the backend and fills in the fields based on this data
  loadProject(id: number): void {
    this.projectService.find(id).subscribe({
      // ^^ this calls the find function in the project.service.ts file
      next: p => {
        this.project = p;
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        this.projectName = p.name ?? '';
        this.mergeSubjectTemplate = p.header ?? '';
        this.mergeBodyTemplate = p.content ?? '';
        this.previewMerge();
      },
      error: err => console.error('❌ Failed to load project', err),
    });
  }
  // called when save button is pressed and saves the project to the backend
  saveProject(): void {
    if (!this.projectId) return;

    this.saving = true;
    this.saveSuccess = false;

    const updated: Project = {
      ...(this.project ?? {}),
      id: this.projectId,
      name: this.projectName,
      header: this.mergeSubjectTemplate,
      content: this.mergeBodyTemplate,
      status: 'PENDING',
    };
    // calls the update function in the project.service.ts
    this.projectService.update(updated).subscribe({
      next: proj => {
        this.project = proj;
        this.saving = false;
        this.saveSuccess = true;
        setTimeout(() => (this.saveSuccess = false), 3000);
        this.previewMerge();
      },
      error: err => {
        console.error('❌ Failed to save project', err);
        this.saving = false;
      },
    });
  }

  // called when sending the project
  sendProject(): void {
    if (!this.projectId || !this.mergeFile) {
      this.mergeErr.set(true);
      return;
    }

    this.mergeSending.set(true);
    this.mergeOk.set(false);
    this.mergeErr.set(false);
    this.sendSuccess = false;

    const pendingProject: Project = {
      ...(this.project ?? {}),
      id: this.projectId,
      name: this.projectName,
      header: this.mergeSubjectTemplate,
      content: this.mergeBodyTemplate,
      status: 'PENDING',
    };
    // this updates the values in the database (so technically saving it again)
    this.projectService.update(pendingProject).subscribe({
      next: () => {
        // Here we call the sendMailMerge function in the project.service.ts file
        this.projectService.sendMailMerge(this.mergeFile!, this.mergeSubjectTemplate, this.mergeBodyTemplate).subscribe({
          next: () => {
            const sentProject: Project = {
              ...(this.project ?? {}),
              id: this.projectId!,
              name: this.projectName,
              header: this.mergeSubjectTemplate,
              content: this.mergeBodyTemplate,
              status: 'SENT',
              sentAt: new Date().toISOString(),
            };

            this.projectService.update(sentProject).subscribe({
              next: proj => {
                this.project = proj;
                this.mergeSending.set(false);
                this.mergeOk.set(true);
                this.sendSuccess = true;
                setTimeout(() => (this.sendSuccess = false), 3000);
              },
              error: err => {
                console.error('❌ Failed to mark SENT', err);
                this.mergeSending.set(false);
                this.mergeErr.set(true);
              },
            });
          },
          error: err => {
            console.error('❌ Mail merge failed', err);
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

  // This toggles the email preview visibility. When clicked again "it refreshes"

  togglePreview(): void {
    // If already visible, regenerate instead of closing
    if (this.previewVisible) {
      this.previewMerge();
    } else {
      this.previewVisible = true;
      this.howToVisible = false;
      this.previewMerge();
    }
  }
  // This toggles the how to button - no need to refresh as the content is hardcoded
  toggleHowTo(): void {
    this.howToVisible = !this.howToVisible;
    if (this.howToVisible) {
      this.previewVisible = false;
    }
  }

  // Reads uploaded excel and parses it and extracts the first sheet
  previewMerge(): void {
    if (!this.mergeFile) return;

    const reader = new FileReader();
    reader.onload = e => {
      const result = (e.target as FileReader).result;
      if (!result) return;

      const data = new Uint8Array(result as ArrayBuffer);
      const workbook = XLSX.read(data, { type: 'array' });
      const sheet = workbook.SheetNames[0];
      const rows = XLSX.utils.sheet_to_json<Record<string, string>>(workbook.Sheets[sheet]);

      // This part iterates over each row and replaces placeholders with actual values
      this.previewEmails = rows.map(row => {
        let body = this.mergeBodyTemplate;
        Object.entries(row).forEach(([key, value]) => {
          const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
          body = body.replace(regex, String(value));
        });
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        return { to: row.email ?? '(missing email)', body };
      });
    };

    reader.readAsArrayBuffer(this.mergeFile);
  }
}
