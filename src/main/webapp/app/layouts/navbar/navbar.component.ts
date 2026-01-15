import { Component, OnInit, inject, signal } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';

import SharedModule from 'app/shared/shared.module';
import { VERSION } from 'app/app.constants';
import { AccountService } from 'app/core/auth/account.service';
import { LoginService } from 'app/login/login.service';
import { ProfileService } from 'app/layouts/profiles/profile.service';
import { EntityNavbarItems } from 'app/entities/entity-navbar-items';
import { AppTheme, ThemeService } from 'app/core/theme/theme.service';
import { SignatureService } from 'app/core/auth/signature.service';
import NavbarItem from './navbar-item.model';
import { faBug } from '@fortawesome/free-solid-svg-icons';

@Component({
  standalone: true,
  selector: 'jhi-navbar',
  templateUrl: './navbar.component.html',
  styleUrl: './navbar.component.scss',
  imports: [RouterModule, SharedModule, FormsModule],
})
export default class NavbarComponent implements OnInit {
  inProduction?: boolean;
  isNavbarCollapsed = signal(true);
  openAPIEnabled?: boolean;
  version = '';
  account = inject(AccountService).trackCurrentAccount();
  entitiesNavbarItems: NavbarItem[] = [];

  faBug = faBug;
  // Signature modal state
  signatureModalOpen = false;
  signatureDraft = '';
  signatureSaving = false;
  signatureError: string | null = null;

  private readonly loginService = inject(LoginService);
  private readonly profileService = inject(ProfileService);
  private readonly router = inject(Router);
  private readonly themeService = inject(ThemeService);
  private readonly signatureService = inject(SignatureService);

  constructor() {
    if (VERSION) {
      this.version = VERSION.toLowerCase().startsWith('v') ? VERSION : `v${VERSION}`;
    }
  }

  get theme(): AppTheme {
    return this.themeService.getTheme();
  }

  ngOnInit(): void {
    this.themeService.applyTheme();

    this.entitiesNavbarItems = EntityNavbarItems;
    this.profileService.getProfileInfo().subscribe(profileInfo => {
      this.inProduction = profileInfo.inProduction;
      this.openAPIEnabled = profileInfo.openAPIEnabled;
    });
  }

  toggleTheme(): void {
    this.themeService.toggleTheme();
  }

  // -----------------------
  // Signature modal
  // -----------------------
  openSignatureModal(): void {
    // Only logged-in users should reach here because template hides it,
    // but keep it safe.
    if (!this.account()) return;

    this.signatureModalOpen = true;
    this.signatureSaving = false;
    this.signatureError = null;

    // Load current signature
    this.signatureService.get().subscribe({
      next: sig => {
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        this.signatureDraft = (sig ?? '').trim();
      },
      error: () => {
        this.signatureError = 'Failed to load signature. Please try again.';
      },
    });
  }

  closeSignatureModal(): void {
    this.signatureModalOpen = false;
    this.signatureError = null;
  }

  saveSignatureFromModal(): void {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    const sig = (this.signatureDraft ?? '').trim();

    this.signatureSaving = true;
    this.signatureError = null;

    this.signatureService.update(sig).subscribe({
      next: () => {
        this.signatureSaving = false;
        this.signatureModalOpen = false;
      },
      error: () => {
        this.signatureSaving = false;
        this.signatureError = 'Failed to save signature. Please try again.';
      },
    });
  }

  collapseNavbar(): void {
    this.isNavbarCollapsed.set(true);
  }

  login(): void {
    this.loginService.login();
  }

  logout(): void {
    this.collapseNavbar();
    this.loginService.logout();
    this.router.navigate(['']);
  }

  toggleNavbar(): void {
    this.isNavbarCollapsed.update(isNavbarCollapsed => !isNavbarCollapsed);
  }
}
