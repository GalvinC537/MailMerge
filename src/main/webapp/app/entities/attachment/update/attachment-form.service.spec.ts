import { TestBed } from '@angular/core/testing';

import { sampleWithNewData, sampleWithRequiredData } from '../attachment.test-samples';

import { AttachmentFormService } from './attachment-form.service';

describe('Attachment Form Service', () => {
  let service: AttachmentFormService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(AttachmentFormService);
  });

  describe('Service methods', () => {
    describe('createAttachmentFormGroup', () => {
      it('should create a new form with FormControl', () => {
        const formGroup = service.createAttachmentFormGroup();

        expect(formGroup.controls).toEqual(
          expect.objectContaining({
            id: expect.any(Object),
            content: expect.any(Object),
            email: expect.any(Object),
          }),
        );
      });

      it('passing IAttachment should create a new form with FormGroup', () => {
        const formGroup = service.createAttachmentFormGroup(sampleWithRequiredData);

        expect(formGroup.controls).toEqual(
          expect.objectContaining({
            id: expect.any(Object),
            content: expect.any(Object),
            email: expect.any(Object),
          }),
        );
      });
    });

    describe('getAttachment', () => {
      it('should return NewAttachment for default Attachment initial value', () => {
        const formGroup = service.createAttachmentFormGroup(sampleWithNewData);

        const attachment = service.getAttachment(formGroup) as any;

        expect(attachment).toMatchObject(sampleWithNewData);
      });

      it('should return NewAttachment for empty Attachment initial value', () => {
        const formGroup = service.createAttachmentFormGroup();

        const attachment = service.getAttachment(formGroup) as any;

        expect(attachment).toMatchObject({});
      });

      it('should return IAttachment', () => {
        const formGroup = service.createAttachmentFormGroup(sampleWithRequiredData);

        const attachment = service.getAttachment(formGroup) as any;

        expect(attachment).toMatchObject(sampleWithRequiredData);
      });
    });

    describe('resetForm', () => {
      it('passing IAttachment should not enable id FormControl', () => {
        const formGroup = service.createAttachmentFormGroup();
        expect(formGroup.controls.id.disabled).toBe(true);

        service.resetForm(formGroup, sampleWithRequiredData);

        expect(formGroup.controls.id.disabled).toBe(true);
      });

      it('passing NewAttachment should disable id FormControl', () => {
        const formGroup = service.createAttachmentFormGroup(sampleWithRequiredData);
        expect(formGroup.controls.id.disabled).toBe(true);

        service.resetForm(formGroup, { id: null });

        expect(formGroup.controls.id.disabled).toBe(true);
      });
    });
  });
});
