import { Injectable } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';

import dayjs from 'dayjs/esm';
import { DATE_TIME_FORMAT } from 'app/config/input.constants';
import { IEmail, NewEmail } from '../email.model';

/**
 * A partial Type with required key is used as form input.
 */
type PartialWithRequiredKeyOf<T extends { id: unknown }> = Partial<Omit<T, 'id'>> & { id: T['id'] };

/**
 * Type for createFormGroup and resetForm argument.
 * It accepts IEmail for edit and NewEmailFormGroupInput for create.
 */
type EmailFormGroupInput = IEmail | PartialWithRequiredKeyOf<NewEmail>;

/**
 * Type that converts some properties for forms.
 */
type FormValueOf<T extends IEmail | NewEmail> = Omit<T, 'sentAt'> & {
  sentAt?: string | null;
};

type EmailFormRawValue = FormValueOf<IEmail>;

type NewEmailFormRawValue = FormValueOf<NewEmail>;

type EmailFormDefaults = Pick<NewEmail, 'id' | 'sentAt'>;

type EmailFormGroupContent = {
  id: FormControl<EmailFormRawValue['id'] | NewEmail['id']>;
  emailAddress: FormControl<EmailFormRawValue['emailAddress']>;
  content: FormControl<EmailFormRawValue['content']>;
  variablesJson: FormControl<EmailFormRawValue['variablesJson']>;
  status: FormControl<EmailFormRawValue['status']>;
  sentAt: FormControl<EmailFormRawValue['sentAt']>;
  project: FormControl<EmailFormRawValue['project']>;
};

export type EmailFormGroup = FormGroup<EmailFormGroupContent>;

@Injectable({ providedIn: 'root' })
export class EmailFormService {
  createEmailFormGroup(email: EmailFormGroupInput = { id: null }): EmailFormGroup {
    const emailRawValue = this.convertEmailToEmailRawValue({
      ...this.getFormDefaults(),
      ...email,
    });
    return new FormGroup<EmailFormGroupContent>({
      id: new FormControl(
        { value: emailRawValue.id, disabled: true },
        {
          nonNullable: true,
          validators: [Validators.required],
        },
      ),
      emailAddress: new FormControl(emailRawValue.emailAddress, {
        validators: [Validators.required],
      }),
      content: new FormControl(emailRawValue.content, {
        validators: [Validators.required],
      }),
      variablesJson: new FormControl(emailRawValue.variablesJson),
      status: new FormControl(emailRawValue.status, {
        validators: [Validators.required],
      }),
      sentAt: new FormControl(emailRawValue.sentAt),
      project: new FormControl(emailRawValue.project),
    });
  }

  getEmail(form: EmailFormGroup): IEmail | NewEmail {
    return this.convertEmailRawValueToEmail(form.getRawValue() as EmailFormRawValue | NewEmailFormRawValue);
  }

  resetForm(form: EmailFormGroup, email: EmailFormGroupInput): void {
    const emailRawValue = this.convertEmailToEmailRawValue({ ...this.getFormDefaults(), ...email });
    form.reset(
      {
        ...emailRawValue,
        id: { value: emailRawValue.id, disabled: true },
      } as any /* cast to workaround https://github.com/angular/angular/issues/46458 */,
    );
  }

  private getFormDefaults(): EmailFormDefaults {
    const currentTime = dayjs();

    return {
      id: null,
      sentAt: currentTime,
    };
  }

  private convertEmailRawValueToEmail(rawEmail: EmailFormRawValue | NewEmailFormRawValue): IEmail | NewEmail {
    return {
      ...rawEmail,
      sentAt: dayjs(rawEmail.sentAt, DATE_TIME_FORMAT),
    };
  }

  private convertEmailToEmailRawValue(
    email: IEmail | (Partial<NewEmail> & EmailFormDefaults),
  ): EmailFormRawValue | PartialWithRequiredKeyOf<NewEmailFormRawValue> {
    return {
      ...email,
      sentAt: email.sentAt ? email.sentAt.format(DATE_TIME_FORMAT) : undefined,
    };
  }
}
