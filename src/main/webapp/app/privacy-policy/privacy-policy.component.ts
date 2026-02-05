import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';
import SharedModule from 'app/shared/shared.module';

@Component({
  standalone: true,
  selector: 'jhi-privacy-policy',
  imports: [RouterModule, SharedModule],
  templateUrl: './privacy-policy.component.html',
  styleUrl: './privacy-policy.component.scss',
})
export default class PrivacyPolicyComponent {
  // Update this whenever you edit the policy
  lastUpdated = '23 January 2026';
}
