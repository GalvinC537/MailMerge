import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';

import SharedModule from 'app/shared/shared.module';
import { ITEM_DELETED_EVENT } from 'app/config/navigation.constants';
import { IHeading } from '../heading.model';
import { HeadingService } from '../service/heading.service';

@Component({
  standalone: true,
  templateUrl: './heading-delete-dialog.component.html',
  imports: [SharedModule, FormsModule],
})
export class HeadingDeleteDialogComponent {
  heading?: IHeading;

  protected headingService = inject(HeadingService);
  protected activeModal = inject(NgbActiveModal);

  cancel(): void {
    this.activeModal.dismiss();
  }

  confirmDelete(id: number): void {
    this.headingService.delete(id).subscribe(() => {
      this.activeModal.close(ITEM_DELETED_EVENT);
    });
  }
}
