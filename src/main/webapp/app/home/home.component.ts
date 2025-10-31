import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterModule } from '@angular/router';
import { HttpClient } from '@angular/common/http';

import SharedModule from 'app/shared/shared.module';
import { LoginService } from 'app/login/login.service';
import { AccountService } from 'app/core/auth/account.service';
import { Account } from 'app/core/auth/account.model';

@Component({
  standalone: true,
  selector: 'jhi-home',
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss',
  imports: [SharedModule, RouterModule],
})
export default class HomeComponent implements OnInit {
  account = signal<Account | null>(null);

  // ✅ Add HttpClient for the API call
  private readonly http = inject(HttpClient);

  private readonly accountService = inject(AccountService);
  private readonly loginService = inject(LoginService);

  // ✅ Add reactive status signals for UI feedback
  // eslint-disable-next-line @typescript-eslint/member-ordering
  sendOk = signal(false);
  // eslint-disable-next-line @typescript-eslint/member-ordering
  sendErr = signal(false);
  // eslint-disable-next-line @typescript-eslint/member-ordering
  sending = signal(false);

  ngOnInit(): void {
    this.accountService.identity().subscribe(account => this.account.set(account));
  }

  login(): void {
    this.loginService.login();
  }

  // ✅ New function to trigger backend API call
  sendTestEmail(): void {
    this.sending.set(true);
    this.sendOk.set(false);
    this.sendErr.set(false);

    this.http.post('/api/graph/send-test-email', {}).subscribe({
      next: () => {
        this.sendOk.set(true);
        this.sending.set(false);
      },
      error: err => {
        console.error('❌ Failed to send test email', err);
        this.sendErr.set(true);
        this.sending.set(false);
      },
    });
  }
}
