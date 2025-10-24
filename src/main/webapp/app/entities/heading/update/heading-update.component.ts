import { Component, OnInit, inject } from '@angular/core';
import { HttpResponse } from '@angular/common/http';
import { ActivatedRoute } from '@angular/router';
import { Observable } from 'rxjs';
import { finalize, map } from 'rxjs/operators';

import SharedModule from 'app/shared/shared.module';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';

import { IProject } from 'app/entities/project/project.model';
import { ProjectService } from 'app/entities/project/service/project.service';
import { IHeading } from '../heading.model';
import { HeadingService } from '../service/heading.service';
import { HeadingFormGroup, HeadingFormService } from './heading-form.service';

@Component({
  standalone: true,
  selector: 'jhi-heading-update',
  templateUrl: './heading-update.component.html',
  imports: [SharedModule, FormsModule, ReactiveFormsModule],
})
export class HeadingUpdateComponent implements OnInit {
  isSaving = false;
  heading: IHeading | null = null;

  projectsSharedCollection: IProject[] = [];

  protected headingService = inject(HeadingService);
  protected headingFormService = inject(HeadingFormService);
  protected projectService = inject(ProjectService);
  protected activatedRoute = inject(ActivatedRoute);

  // eslint-disable-next-line @typescript-eslint/member-ordering
  editForm: HeadingFormGroup = this.headingFormService.createHeadingFormGroup();

  compareProject = (o1: IProject | null, o2: IProject | null): boolean => this.projectService.compareProject(o1, o2);

  ngOnInit(): void {
    this.activatedRoute.data.subscribe(({ heading }) => {
      this.heading = heading;
      if (heading) {
        this.updateForm(heading);
      }

      this.loadRelationshipsOptions();
    });
  }

  previousState(): void {
    window.history.back();
  }

  save(): void {
    this.isSaving = true;
    const heading = this.headingFormService.getHeading(this.editForm);
    if (heading.id !== null) {
      this.subscribeToSaveResponse(this.headingService.update(heading));
    } else {
      this.subscribeToSaveResponse(this.headingService.create(heading));
    }
  }

  protected subscribeToSaveResponse(result: Observable<HttpResponse<IHeading>>): void {
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

  protected updateForm(heading: IHeading): void {
    this.heading = heading;
    this.headingFormService.resetForm(this.editForm, heading);

    this.projectsSharedCollection = this.projectService.addProjectToCollectionIfMissing<IProject>(
      this.projectsSharedCollection,
      heading.project,
    );
  }

  protected loadRelationshipsOptions(): void {
    this.projectService
      .query()
      .pipe(map((res: HttpResponse<IProject[]>) => res.body ?? []))
      .pipe(map((projects: IProject[]) => this.projectService.addProjectToCollectionIfMissing<IProject>(projects, this.heading?.project)))
      .subscribe((projects: IProject[]) => (this.projectsSharedCollection = projects));
  }
}
