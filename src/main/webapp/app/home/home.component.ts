import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterModule } from '@angular/router';
import { HttpClient } from '@angular/common/http';

import SharedModule from 'app/shared/shared.module';
import { LoginService } from 'app/login/login.service';
import { AccountService } from 'app/core/auth/account.service';
import { Account } from 'app/core/auth/account.model';
import { FormsModule } from '@angular/forms';

@Component({
  standalone: true,
  selector: 'jhi-home',
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss',
  imports: [SharedModule, RouterModule, FormsModule],
})
export default class HomeComponent implements OnInit {
  account = signal<Account | null>(null);

  private readonly http = inject(HttpClient);
  private readonly accountService = inject(AccountService);
  private readonly loginService = inject(LoginService);

  // Single email form
  // eslint-disable-next-line @typescript-eslint/member-ordering
  emailForm = {
    to: '',
    subject: '',
    body: '',
  };

  // Single email status
  // eslint-disable-next-line @typescript-eslint/member-ordering
  sendOk = signal(false);
  // eslint-disable-next-line @typescript-eslint/member-ordering
  sendErr = signal(false);
  // eslint-disable-next-line @typescript-eslint/member-ordering
  sending = signal(false);

  // Mail merge form
  // eslint-disable-next-line @typescript-eslint/member-ordering
  mergeSubjectTemplate = '';
  // eslint-disable-next-line @typescript-eslint/member-ordering
  mergeBodyTemplate = '';
  // eslint-disable-next-line @typescript-eslint/member-ordering
  mergeFile: File | null = null;

  // Mail merge status
  // eslint-disable-next-line @typescript-eslint/member-ordering
  mergeSending = signal(false);
  // eslint-disable-next-line @typescript-eslint/member-ordering
  mergeOk = signal(false);
  // eslint-disable-next-line @typescript-eslint/member-ordering
  mergeErr = signal(false);

  ngOnInit(): void {
    this.accountService.identity().subscribe(account => this.account.set(account));
  }

  login(): void {
    this.loginService.login();
  }

  // Existing: send a single email
  sendEmail(): void {
    this.sending.set(true);
    this.sendOk.set(false);
    this.sendErr.set(false);

    this.http.post('/api/graph-mail/send', this.emailForm).subscribe({
      next: () => {
        this.sendOk.set(true);
        this.sending.set(false);
      },
      error: err => {
        console.error('❌ Failed to send email', err);
        this.sendErr.set(true);
        this.sending.set(false);
      },
    });
  }

  // Handle file selection for mail merge
  onMergeFileChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) {
      this.mergeFile = null;
      return;
    }
    this.mergeFile = input.files[0];
  }

  // Send mail merge
  sendMailMerge(): void {
    this.mergeSending.set(true);
    this.mergeOk.set(false);
    this.mergeErr.set(false);

    if (!this.mergeFile) {
      console.error('No file selected for mail merge');
      this.mergeSending.set(false);
      this.mergeErr.set(true);
      return;
    }

    const formData = new FormData();
    formData.append('file', this.mergeFile);
    formData.append('subjectTemplate', this.mergeSubjectTemplate);
    formData.append('bodyTemplate', this.mergeBodyTemplate);

    this.http.post('/api/mail-merge/send', formData).subscribe({
      next: () => {
        this.mergeSending.set(false);
        this.mergeOk.set(true);
      },
      error: err => {
        console.error('❌ Mail merge failed', err);
        this.mergeSending.set(false);
        this.mergeErr.set(true);
      },
    });
  }
}
