import { IUser } from 'app/entities/user/user.model';

export interface IProject {
  id: number;
  name?: string | null;
  spreadsheetLink?: string | null;
  user?: Pick<IUser, 'id' | 'login'> | null;
}

export type NewProject = Omit<IProject, 'id'> & { id: null };
