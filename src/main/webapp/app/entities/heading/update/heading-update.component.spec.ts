import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpResponse, provideHttpClient } from '@angular/common/http';
import { FormBuilder } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { Subject, from, of } from 'rxjs';

import { IProject } from 'app/entities/project/project.model';
import { ProjectService } from 'app/entities/project/service/project.service';
import { HeadingService } from '../service/heading.service';
import { IHeading } from '../heading.model';
import { HeadingFormService } from './heading-form.service';

import { HeadingUpdateComponent } from './heading-update.component';

describe('Heading Management Update Component', () => {
  let comp: HeadingUpdateComponent;
  let fixture: ComponentFixture<HeadingUpdateComponent>;
  let activatedRoute: ActivatedRoute;
  let headingFormService: HeadingFormService;
  let headingService: HeadingService;
  let projectService: ProjectService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HeadingUpdateComponent],
      providers: [
        provideHttpClient(),
        FormBuilder,
        {
          provide: ActivatedRoute,
          useValue: {
            params: from([{}]),
          },
        },
      ],
    })
      .overrideTemplate(HeadingUpdateComponent, '')
      .compileComponents();

    fixture = TestBed.createComponent(HeadingUpdateComponent);
    activatedRoute = TestBed.inject(ActivatedRoute);
    headingFormService = TestBed.inject(HeadingFormService);
    headingService = TestBed.inject(HeadingService);
    projectService = TestBed.inject(ProjectService);

    comp = fixture.componentInstance;
  });

  describe('ngOnInit', () => {
    it('Should call Project query and add missing value', () => {
      const heading: IHeading = { id: 456 };
      const project: IProject = { id: 21791 };
      heading.project = project;

      const projectCollection: IProject[] = [{ id: 11637 }];
      jest.spyOn(projectService, 'query').mockReturnValue(of(new HttpResponse({ body: projectCollection })));
      const additionalProjects = [project];
      const expectedCollection: IProject[] = [...additionalProjects, ...projectCollection];
      jest.spyOn(projectService, 'addProjectToCollectionIfMissing').mockReturnValue(expectedCollection);

      activatedRoute.data = of({ heading });
      comp.ngOnInit();

      expect(projectService.query).toHaveBeenCalled();
      expect(projectService.addProjectToCollectionIfMissing).toHaveBeenCalledWith(
        projectCollection,
        ...additionalProjects.map(expect.objectContaining),
      );
      expect(comp.projectsSharedCollection).toEqual(expectedCollection);
    });

    it('Should update editForm', () => {
      const heading: IHeading = { id: 456 };
      const project: IProject = { id: 9777 };
      heading.project = project;

      activatedRoute.data = of({ heading });
      comp.ngOnInit();

      expect(comp.projectsSharedCollection).toContain(project);
      expect(comp.heading).toEqual(heading);
    });
  });

  describe('save', () => {
    it('Should call update service on save for existing entity', () => {
      // GIVEN
      const saveSubject = new Subject<HttpResponse<IHeading>>();
      const heading = { id: 123 };
      jest.spyOn(headingFormService, 'getHeading').mockReturnValue(heading);
      jest.spyOn(headingService, 'update').mockReturnValue(saveSubject);
      jest.spyOn(comp, 'previousState');
      activatedRoute.data = of({ heading });
      comp.ngOnInit();

      // WHEN
      comp.save();
      expect(comp.isSaving).toEqual(true);
      saveSubject.next(new HttpResponse({ body: heading }));
      saveSubject.complete();

      // THEN
      expect(headingFormService.getHeading).toHaveBeenCalled();
      expect(comp.previousState).toHaveBeenCalled();
      expect(headingService.update).toHaveBeenCalledWith(expect.objectContaining(heading));
      expect(comp.isSaving).toEqual(false);
    });

    it('Should call create service on save for new entity', () => {
      // GIVEN
      const saveSubject = new Subject<HttpResponse<IHeading>>();
      const heading = { id: 123 };
      jest.spyOn(headingFormService, 'getHeading').mockReturnValue({ id: null });
      jest.spyOn(headingService, 'create').mockReturnValue(saveSubject);
      jest.spyOn(comp, 'previousState');
      activatedRoute.data = of({ heading: null });
      comp.ngOnInit();

      // WHEN
      comp.save();
      expect(comp.isSaving).toEqual(true);
      saveSubject.next(new HttpResponse({ body: heading }));
      saveSubject.complete();

      // THEN
      expect(headingFormService.getHeading).toHaveBeenCalled();
      expect(headingService.create).toHaveBeenCalled();
      expect(comp.isSaving).toEqual(false);
      expect(comp.previousState).toHaveBeenCalled();
    });

    it('Should set isSaving to false on error', () => {
      // GIVEN
      const saveSubject = new Subject<HttpResponse<IHeading>>();
      const heading = { id: 123 };
      jest.spyOn(headingService, 'update').mockReturnValue(saveSubject);
      jest.spyOn(comp, 'previousState');
      activatedRoute.data = of({ heading });
      comp.ngOnInit();

      // WHEN
      comp.save();
      expect(comp.isSaving).toEqual(true);
      saveSubject.error('This is an error!');

      // THEN
      expect(headingService.update).toHaveBeenCalled();
      expect(comp.isSaving).toEqual(false);
      expect(comp.previousState).not.toHaveBeenCalled();
    });
  });

  describe('Compare relationships', () => {
    describe('compareProject', () => {
      it('Should forward to projectService', () => {
        const entity = { id: 123 };
        const entity2 = { id: 456 };
        jest.spyOn(projectService, 'compareProject');
        comp.compareProject(entity, entity2);
        expect(projectService.compareProject).toHaveBeenCalledWith(entity, entity2);
      });
    });
  });
});
