import { TestBed } from '@angular/core/testing';

import { sampleWithNewData, sampleWithRequiredData } from '../heading.test-samples';

import { HeadingFormService } from './heading-form.service';

describe('Heading Form Service', () => {
  let service: HeadingFormService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(HeadingFormService);
  });

  describe('Service methods', () => {
    describe('createHeadingFormGroup', () => {
      it('should create a new form with FormControl', () => {
        const formGroup = service.createHeadingFormGroup();

        expect(formGroup.controls).toEqual(
          expect.objectContaining({
            id: expect.any(Object),
            name: expect.any(Object),
            project: expect.any(Object),
          }),
        );
      });

      it('passing IHeading should create a new form with FormGroup', () => {
        const formGroup = service.createHeadingFormGroup(sampleWithRequiredData);

        expect(formGroup.controls).toEqual(
          expect.objectContaining({
            id: expect.any(Object),
            name: expect.any(Object),
            project: expect.any(Object),
          }),
        );
      });
    });

    describe('getHeading', () => {
      it('should return NewHeading for default Heading initial value', () => {
        const formGroup = service.createHeadingFormGroup(sampleWithNewData);

        const heading = service.getHeading(formGroup) as any;

        expect(heading).toMatchObject(sampleWithNewData);
      });

      it('should return NewHeading for empty Heading initial value', () => {
        const formGroup = service.createHeadingFormGroup();

        const heading = service.getHeading(formGroup) as any;

        expect(heading).toMatchObject({});
      });

      it('should return IHeading', () => {
        const formGroup = service.createHeadingFormGroup(sampleWithRequiredData);

        const heading = service.getHeading(formGroup) as any;

        expect(heading).toMatchObject(sampleWithRequiredData);
      });
    });

    describe('resetForm', () => {
      it('passing IHeading should not enable id FormControl', () => {
        const formGroup = service.createHeadingFormGroup();
        expect(formGroup.controls.id.disabled).toBe(true);

        service.resetForm(formGroup, sampleWithRequiredData);

        expect(formGroup.controls.id.disabled).toBe(true);
      });

      it('passing NewHeading should disable id FormControl', () => {
        const formGroup = service.createHeadingFormGroup(sampleWithRequiredData);
        expect(formGroup.controls.id.disabled).toBe(true);

        service.resetForm(formGroup, { id: null });

        expect(formGroup.controls.id.disabled).toBe(true);
      });
    });
  });
});
