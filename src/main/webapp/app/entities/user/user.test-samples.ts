import { IUser } from './user.model';

export const sampleWithRequiredData: IUser = {
  id: '0bbfb0eb-cd2e-460e-96dc-5b161aed19e4',
  login: '_H',
};

export const sampleWithPartialData: IUser = {
  id: 'c19e3711-c914-42ff-b51b-82ba18d61a42',
  login: 'DcW4K',
};

export const sampleWithFullData: IUser = {
  id: 'ca636c05-a5c5-416b-ae48-cea4afb388de',
  login: '..B4i@IMR8\\OT2u7j',
};
Object.freeze(sampleWithRequiredData);
Object.freeze(sampleWithPartialData);
Object.freeze(sampleWithFullData);
