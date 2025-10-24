import { IHeading, NewHeading } from './heading.model';

export const sampleWithRequiredData: IHeading = {
  id: 1725,
  name: 'incidentally general why',
};

export const sampleWithPartialData: IHeading = {
  id: 12419,
  name: 'yuck bah',
};

export const sampleWithFullData: IHeading = {
  id: 3886,
  name: 'vaguely complicated noisily',
};

export const sampleWithNewData: NewHeading = {
  name: 'from easily',
  id: null,
};

Object.freeze(sampleWithNewData);
Object.freeze(sampleWithRequiredData);
Object.freeze(sampleWithPartialData);
Object.freeze(sampleWithFullData);
