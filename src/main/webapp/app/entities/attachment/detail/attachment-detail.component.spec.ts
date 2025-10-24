import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { of } from 'rxjs';

import { AttachmentDetailComponent } from './attachment-detail.component';

describe('Attachment Management Detail Component', () => {
  let comp: AttachmentDetailComponent;
  let fixture: ComponentFixture<AttachmentDetailComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AttachmentDetailComponent],
      providers: [
        provideRouter(
          [
            {
              path: '**',
              loadComponent: () => import('./attachment-detail.component').then(m => m.AttachmentDetailComponent),
              resolve: { attachment: () => of({ id: 123 }) },
            },
          ],
          withComponentInputBinding(),
        ),
      ],
    })
      .overrideTemplate(AttachmentDetailComponent, '')
      .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(AttachmentDetailComponent);
    comp = fixture.componentInstance;
  });

  describe('OnInit', () => {
    it('Should load attachment on init', async () => {
      const harness = await RouterTestingHarness.create();
      const instance = await harness.navigateByUrl('/', AttachmentDetailComponent);

      // THEN
      expect(instance.attachment()).toEqual(expect.objectContaining({ id: 123 }));
    });
  });

  describe('PreviousState', () => {
    it('Should navigate to previous state', () => {
      jest.spyOn(window.history, 'back');
      comp.previousState();
      expect(window.history.back).toHaveBeenCalled();
    });
  });
});
