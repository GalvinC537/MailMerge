import { Component, OnInit, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AccountService } from 'app/core/auth/account.service';
import { LoginService } from 'app/login/login.service';
import { Account } from 'app/core/auth/account.model';

@Component({
  standalone: true,
  selector: 'jhi-home',
  templateUrl: './home.component.html',
})
export default class HomeComponent implements OnInit {
  private readonly accountService = inject(AccountService);
  private readonly loginService = inject(LoginService);
  private readonly router = inject(Router);

  // eslint-disable-next-line @typescript-eslint/member-ordering
  account = signal<Account | null>(null);

  ngOnInit(): void {
    this.accountService.identity().subscribe(account => {
      this.account.set(account);
      // If user is already logged in, go straight to the dashboard
      if (account) {
        this.router.navigate(['/project']);
      }
    });
  }

  login(): void {
    this.loginService.login();
  }
}
