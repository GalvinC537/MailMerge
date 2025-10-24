import { Injectable } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';

import { IHeading, NewHeading } from '../heading.model';

/**
 * A partial Type with required key is used as form input.
 */
type PartialWithRequiredKeyOf<T extends { id: unknown }> = Partial<Omit<T, 'id'>> & { id: T['id'] };

/**
 * Type for createFormGroup and resetForm argument.
 * It accepts IHeading for edit and NewHeadingFormGroupInput for create.
 */
type HeadingFormGroupInput = IHeading | PartialWithRequiredKeyOf<NewHeading>;

type HeadingFormDefaults = Pick<NewHeading, 'id'>;

type HeadingFormGroupContent = {
  id: FormControl<IHeading['id'] | NewHeading['id']>;
  name: FormControl<IHeading['name']>;
  project: FormControl<IHeading['project']>;
};

export type HeadingFormGroup = FormGroup<HeadingFormGroupContent>;

@Injectable({ providedIn: 'root' })
export class HeadingFormService {
  createHeadingFormGroup(heading: HeadingFormGroupInput = { id: null }): HeadingFormGroup {
    const headingRawValue = {
      ...this.getFormDefaults(),
      ...heading,
    };
    return new FormGroup<HeadingFormGroupContent>({
      id: new FormControl(
        { value: headingRawValue.id, disabled: true },
        {
          nonNullable: true,
          validators: [Validators.required],
        },
      ),
      name: new FormControl(headingRawValue.name, {
        validators: [Validators.required],
      }),
      project: new FormControl(headingRawValue.project),
    });
  }

  getHeading(form: HeadingFormGroup): IHeading | NewHeading {
    return form.getRawValue() as IHeading | NewHeading;
  }

  resetForm(form: HeadingFormGroup, heading: HeadingFormGroupInput): void {
    const headingRawValue = { ...this.getFormDefaults(), ...heading };
    form.reset(
      {
        ...headingRawValue,
        id: { value: headingRawValue.id, disabled: true },
      } as any /* cast to workaround https://github.com/angular/angular/issues/46458 */,
    );
  }

  private getFormDefaults(): HeadingFormDefaults {
    return {
      id: null,
    };
  }
}
