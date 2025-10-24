import dayjs from 'dayjs/esm';

import { IEmail, NewEmail } from './email.model';

export const sampleWithRequiredData: IEmail = {
  id: 31087,
  emailAddress: 'acquaintance notwithstanding',
  content: '../fake-data/blob/hipster.txt',
  status: 'FAILED',
};

export const sampleWithPartialData: IEmail = {
  id: 26137,
  emailAddress: 'fowl woot geez',
  content: '../fake-data/blob/hipster.txt',
  status: 'FAILED',
};

export const sampleWithFullData: IEmail = {
  id: 25028,
  emailAddress: 'holster partial as',
  content: '../fake-data/blob/hipster.txt',
  variablesJson: '../fake-data/blob/hipster.txt',
  status: 'PENDING',
  sentAt: dayjs('2025-10-24T03:05'),
};

export const sampleWithNewData: NewEmail = {
  emailAddress: 'velvety generally neighboring',
  content: '../fake-data/blob/hipster.txt',
  status: 'SENT',
  id: null,
};

Object.freeze(sampleWithNewData);
Object.freeze(sampleWithRequiredData);
Object.freeze(sampleWithPartialData);
Object.freeze(sampleWithFullData);
