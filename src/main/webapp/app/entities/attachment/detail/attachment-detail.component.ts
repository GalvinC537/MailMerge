import { Component, input } from '@angular/core';
import { RouterModule } from '@angular/router';

import SharedModule from 'app/shared/shared.module';
import { DurationPipe, FormatMediumDatePipe, FormatMediumDatetimePipe } from 'app/shared/date';
import { IAttachment } from '../attachment.model';

@Component({
  standalone: true,
  selector: 'jhi-attachment-detail',
  templateUrl: './attachment-detail.component.html',
  imports: [SharedModule, RouterModule, DurationPipe, FormatMediumDatetimePipe, FormatMediumDatePipe],
})
export class AttachmentDetailComponent {
  attachment = input<IAttachment | null>(null);

  previousState(): void {
    window.history.back();
  }
}
