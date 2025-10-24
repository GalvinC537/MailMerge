import { IProject, NewProject } from './project.model';

export const sampleWithRequiredData: IProject = {
  id: 13830,
  name: 'even aha nor',
  spreadsheetLink: 'for tabulate whether',
};

export const sampleWithPartialData: IProject = {
  id: 20406,
  name: 'warmly plagiarise pink',
  spreadsheetLink: 'stitcher courtroom toward',
};

export const sampleWithFullData: IProject = {
  id: 24301,
  name: 'vaguely',
  spreadsheetLink: 'near roger duh',
};

export const sampleWithNewData: NewProject = {
  name: 'switchboard draw wholly',
  spreadsheetLink: 'almighty',
  id: null,
};

Object.freeze(sampleWithNewData);
Object.freeze(sampleWithRequiredData);
Object.freeze(sampleWithPartialData);
Object.freeze(sampleWithFullData);
