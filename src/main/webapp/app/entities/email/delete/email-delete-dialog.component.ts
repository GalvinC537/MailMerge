import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';

import SharedModule from 'app/shared/shared.module';
import { ITEM_DELETED_EVENT } from 'app/config/navigation.constants';
import { IEmail } from '../email.model';
import { EmailService } from '../service/email.service';

@Component({
  standalone: true,
  templateUrl: './email-delete-dialog.component.html',
  imports: [SharedModule, FormsModule],
})
export class EmailDeleteDialogComponent {
  email?: IEmail;

  protected emailService = inject(EmailService);
  protected activeModal = inject(NgbActiveModal);

  cancel(): void {
    this.activeModal.dismiss();
  }

  confirmDelete(id: number): void {
    this.emailService.delete(id).subscribe(() => {
      this.activeModal.close(ITEM_DELETED_EVENT);
    });
  }
}
