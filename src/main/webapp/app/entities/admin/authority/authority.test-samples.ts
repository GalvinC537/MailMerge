import { IAuthority, NewAuthority } from './authority.model';

export const sampleWithRequiredData: IAuthority = {
  name: '2abfd83a-4648-4a99-b587-6f17768a545e',
};

export const sampleWithPartialData: IAuthority = {
  name: 'a26b611e-bac0-401b-8ff6-24e5737a0fe8',
};

export const sampleWithFullData: IAuthority = {
  name: '7074a5ac-467a-414b-9711-877e3ff29969',
};

export const sampleWithNewData: NewAuthority = {
  name: null,
};

Object.freeze(sampleWithNewData);
Object.freeze(sampleWithRequiredData);
Object.freeze(sampleWithPartialData);
Object.freeze(sampleWithFullData);
