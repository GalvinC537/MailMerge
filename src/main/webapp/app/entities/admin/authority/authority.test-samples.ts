import { IAuthority, NewAuthority } from './authority.model';

export const sampleWithRequiredData: IAuthority = {
  name: 'f49dafa0-faff-48ef-95c4-1b3efe7e67dc',
};

export const sampleWithPartialData: IAuthority = {
  name: 'c4dfa564-96b6-4c00-9b56-93c6c702a588',
};

export const sampleWithFullData: IAuthority = {
  name: '410ee0df-3fdc-45f1-9bfc-fa5627d5263b',
};

export const sampleWithNewData: NewAuthority = {
  name: null,
};

Object.freeze(sampleWithNewData);
Object.freeze(sampleWithRequiredData);
Object.freeze(sampleWithPartialData);
Object.freeze(sampleWithFullData);
