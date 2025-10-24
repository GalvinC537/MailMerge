import { IAttachment, NewAttachment } from './attachment.model';

export const sampleWithRequiredData: IAttachment = {
  id: 25504,
};

export const sampleWithPartialData: IAttachment = {
  id: 30455,
};

export const sampleWithFullData: IAttachment = {
  id: 31317,
  content: 'within small on',
};

export const sampleWithNewData: NewAttachment = {
  id: null,
};

Object.freeze(sampleWithNewData);
Object.freeze(sampleWithRequiredData);
Object.freeze(sampleWithPartialData);
Object.freeze(sampleWithFullData);
