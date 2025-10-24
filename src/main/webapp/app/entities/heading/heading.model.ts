import { IProject } from 'app/entities/project/project.model';

export interface IHeading {
  id: number;
  name?: string | null;
  project?: Pick<IProject, 'id'> | null;
}

export type NewHeading = Omit<IHeading, 'id'> & { id: null };
