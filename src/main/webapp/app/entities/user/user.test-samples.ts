import { IUser } from './user.model';

export const sampleWithRequiredData: IUser = {
  id: 'f29c469b-3844-4f65-aa15-f0430d4f2c66',
  login: '4zTp=U@e1BCCS',
};

export const sampleWithPartialData: IUser = {
  id: 'b627f288-cc5f-45b5-a9ee-f5cdbdf3591a',
  login: 'C',
};

export const sampleWithFullData: IUser = {
  id: 'c357b890-0bb5-4780-b272-4d1a492f1d13',
  login: 'LV+9@5Ui\\iOeoz\\Um\\cN',
};
Object.freeze(sampleWithRequiredData);
Object.freeze(sampleWithPartialData);
Object.freeze(sampleWithFullData);
