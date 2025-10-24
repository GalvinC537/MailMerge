import dayjs from 'dayjs/esm';
import { IProject } from 'app/entities/project/project.model';
import { EmailStatus } from 'app/entities/enumerations/email-status.model';

export interface IEmail {
  id: number;
  emailAddress?: string | null;
  content?: string | null;
  variablesJson?: string | null;
  status?: keyof typeof EmailStatus | null;
  sentAt?: dayjs.Dayjs | null;
  project?: Pick<IProject, 'id'> | null;
}

export type NewEmail = Omit<IEmail, 'id'> & { id: null };
