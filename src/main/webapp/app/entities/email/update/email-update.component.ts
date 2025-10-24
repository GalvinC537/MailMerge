import { Component, OnInit, inject } from '@angular/core';
import { HttpResponse } from '@angular/common/http';
import { ActivatedRoute } from '@angular/router';
import { Observable } from 'rxjs';
import { finalize, map } from 'rxjs/operators';

import SharedModule from 'app/shared/shared.module';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';

import { AlertError } from 'app/shared/alert/alert-error.model';
import { EventManager, EventWithContent } from 'app/core/util/event-manager.service';
import { DataUtils, FileLoadError } from 'app/core/util/data-util.service';
import { IProject } from 'app/entities/project/project.model';
import { ProjectService } from 'app/entities/project/service/project.service';
import { EmailStatus } from 'app/entities/enumerations/email-status.model';
import { EmailService } from '../service/email.service';
import { IEmail } from '../email.model';
import { EmailFormGroup, EmailFormService } from './email-form.service';

@Component({
  standalone: true,
  selector: 'jhi-email-update',
  templateUrl: './email-update.component.html',
  imports: [SharedModule, FormsModule, ReactiveFormsModule],
})
export class EmailUpdateComponent implements OnInit {
  isSaving = false;
  email: IEmail | null = null;
  emailStatusValues = Object.keys(EmailStatus);

  projectsSharedCollection: IProject[] = [];

  protected dataUtils = inject(DataUtils);
  protected eventManager = inject(EventManager);
  protected emailService = inject(EmailService);
  protected emailFormService = inject(EmailFormService);
  protected projectService = inject(ProjectService);
  protected activatedRoute = inject(ActivatedRoute);

  // eslint-disable-next-line @typescript-eslint/member-ordering
  editForm: EmailFormGroup = this.emailFormService.createEmailFormGroup();

  compareProject = (o1: IProject | null, o2: IProject | null): boolean => this.projectService.compareProject(o1, o2);

  ngOnInit(): void {
    this.activatedRoute.data.subscribe(({ email }) => {
      this.email = email;
      if (email) {
        this.updateForm(email);
      }

      this.loadRelationshipsOptions();
    });
  }

  byteSize(base64String: string): string {
    return this.dataUtils.byteSize(base64String);
  }

  openFile(base64String: string, contentType: string | null | undefined): void {
    this.dataUtils.openFile(base64String, contentType);
  }

  setFileData(event: Event, field: string, isImage: boolean): void {
    this.dataUtils.loadFileToForm(event, this.editForm, field, isImage).subscribe({
      error: (err: FileLoadError) =>
        this.eventManager.broadcast(new EventWithContent<AlertError>('mailmergeApp.error', { message: err.message })),
    });
  }

  previousState(): void {
    window.history.back();
  }

  save(): void {
    this.isSaving = true;
    const email = this.emailFormService.getEmail(this.editForm);
    if (email.id !== null) {
      this.subscribeToSaveResponse(this.emailService.update(email));
    } else {
      this.subscribeToSaveResponse(this.emailService.create(email));
    }
  }

  protected subscribeToSaveResponse(result: Observable<HttpResponse<IEmail>>): void {
    result.pipe(finalize(() => this.onSaveFinalize())).subscribe({
      next: () => this.onSaveSuccess(),
      error: () => this.onSaveError(),
    });
  }

  protected onSaveSuccess(): void {
    this.previousState();
  }

  protected onSaveError(): void {
    // Api for inheritance.
  }

  protected onSaveFinalize(): void {
    this.isSaving = false;
  }

  protected updateForm(email: IEmail): void {
    this.email = email;
    this.emailFormService.resetForm(this.editForm, email);

    this.projectsSharedCollection = this.projectService.addProjectToCollectionIfMissing<IProject>(
      this.projectsSharedCollection,
      email.project,
    );
  }

  protected loadRelationshipsOptions(): void {
    this.projectService
      .query()
      .pipe(map((res: HttpResponse<IProject[]>) => res.body ?? []))
      .pipe(map((projects: IProject[]) => this.projectService.addProjectToCollectionIfMissing<IProject>(projects, this.email?.project)))
      .subscribe((projects: IProject[]) => (this.projectsSharedCollection = projects));
  }
}
