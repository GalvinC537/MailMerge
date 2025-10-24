import { IEmail } from 'app/entities/email/email.model';

export interface IAttachment {
  id: number;
  content?: string | null;
  email?: Pick<IEmail, 'id'> | null;
}

export type NewAttachment = Omit<IAttachment, 'id'> & { id: null };
