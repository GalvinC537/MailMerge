import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';

import { IEmail } from '../email.model';
import { sampleWithFullData, sampleWithNewData, sampleWithPartialData, sampleWithRequiredData } from '../email.test-samples';

import { EmailService, RestEmail } from './email.service';

const requireRestSample: RestEmail = {
  ...sampleWithRequiredData,
  sentAt: sampleWithRequiredData.sentAt?.toJSON(),
};

describe('Email Service', () => {
  let service: EmailService;
  let httpMock: HttpTestingController;
  let expectedResult: IEmail | IEmail[] | boolean | null;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    expectedResult = null;
    service = TestBed.inject(EmailService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  describe('Service methods', () => {
    it('should find an element', () => {
      const returnedFromService = { ...requireRestSample };
      const expected = { ...sampleWithRequiredData };

      service.find(123).subscribe(resp => (expectedResult = resp.body));

      const req = httpMock.expectOne({ method: 'GET' });
      req.flush(returnedFromService);
      expect(expectedResult).toMatchObject(expected);
    });

    it('should create a Email', () => {
      const email = { ...sampleWithNewData };
      const returnedFromService = { ...requireRestSample };
      const expected = { ...sampleWithRequiredData };

      service.create(email).subscribe(resp => (expectedResult = resp.body));

      const req = httpMock.expectOne({ method: 'POST' });
      req.flush(returnedFromService);
      expect(expectedResult).toMatchObject(expected);
    });

    it('should update a Email', () => {
      const email = { ...sampleWithRequiredData };
      const returnedFromService = { ...requireRestSample };
      const expected = { ...sampleWithRequiredData };

      service.update(email).subscribe(resp => (expectedResult = resp.body));

      const req = httpMock.expectOne({ method: 'PUT' });
      req.flush(returnedFromService);
      expect(expectedResult).toMatchObject(expected);
    });

    it('should partial update a Email', () => {
      const patchObject = { ...sampleWithPartialData };
      const returnedFromService = { ...requireRestSample };
      const expected = { ...sampleWithRequiredData };

      service.partialUpdate(patchObject).subscribe(resp => (expectedResult = resp.body));

      const req = httpMock.expectOne({ method: 'PATCH' });
      req.flush(returnedFromService);
      expect(expectedResult).toMatchObject(expected);
    });

    it('should return a list of Email', () => {
      const returnedFromService = { ...requireRestSample };

      const expected = { ...sampleWithRequiredData };

      service.query().subscribe(resp => (expectedResult = resp.body));

      const req = httpMock.expectOne({ method: 'GET' });
      req.flush([returnedFromService]);
      httpMock.verify();
      expect(expectedResult).toMatchObject([expected]);
    });

    it('should delete a Email', () => {
      const expected = true;

      service.delete(123).subscribe(resp => (expectedResult = resp.ok));

      const req = httpMock.expectOne({ method: 'DELETE' });
      req.flush({ status: 200 });
      expect(expectedResult).toBe(expected);
    });

    describe('addEmailToCollectionIfMissing', () => {
      it('should add a Email to an empty array', () => {
        const email: IEmail = sampleWithRequiredData;
        expectedResult = service.addEmailToCollectionIfMissing([], email);
        expect(expectedResult).toHaveLength(1);
        expect(expectedResult).toContain(email);
      });

      it('should not add a Email to an array that contains it', () => {
        const email: IEmail = sampleWithRequiredData;
        const emailCollection: IEmail[] = [
          {
            ...email,
          },
          sampleWithPartialData,
        ];
        expectedResult = service.addEmailToCollectionIfMissing(emailCollection, email);
        expect(expectedResult).toHaveLength(2);
      });

      it("should add a Email to an array that doesn't contain it", () => {
        const email: IEmail = sampleWithRequiredData;
        const emailCollection: IEmail[] = [sampleWithPartialData];
        expectedResult = service.addEmailToCollectionIfMissing(emailCollection, email);
        expect(expectedResult).toHaveLength(2);
        expect(expectedResult).toContain(email);
      });

      it('should add only unique Email to an array', () => {
        const emailArray: IEmail[] = [sampleWithRequiredData, sampleWithPartialData, sampleWithFullData];
        const emailCollection: IEmail[] = [sampleWithRequiredData];
        expectedResult = service.addEmailToCollectionIfMissing(emailCollection, ...emailArray);
        expect(expectedResult).toHaveLength(3);
      });

      it('should accept varargs', () => {
        const email: IEmail = sampleWithRequiredData;
        const email2: IEmail = sampleWithPartialData;
        expectedResult = service.addEmailToCollectionIfMissing([], email, email2);
        expect(expectedResult).toHaveLength(2);
        expect(expectedResult).toContain(email);
        expect(expectedResult).toContain(email2);
      });

      it('should accept null and undefined values', () => {
        const email: IEmail = sampleWithRequiredData;
        expectedResult = service.addEmailToCollectionIfMissing([], null, email, undefined);
        expect(expectedResult).toHaveLength(1);
        expect(expectedResult).toContain(email);
      });

      it('should return initial array if no Email is added', () => {
        const emailCollection: IEmail[] = [sampleWithRequiredData];
        expectedResult = service.addEmailToCollectionIfMissing(emailCollection, undefined, null);
        expect(expectedResult).toEqual(emailCollection);
      });
    });

    describe('compareEmail', () => {
      it('Should return true if both entities are null', () => {
        const entity1 = null;
        const entity2 = null;

        const compareResult = service.compareEmail(entity1, entity2);

        expect(compareResult).toEqual(true);
      });

      it('Should return false if one entity is null', () => {
        const entity1 = { id: 123 };
        const entity2 = null;

        const compareResult1 = service.compareEmail(entity1, entity2);
        const compareResult2 = service.compareEmail(entity2, entity1);

        expect(compareResult1).toEqual(false);
        expect(compareResult2).toEqual(false);
      });

      it('Should return false if primaryKey differs', () => {
        const entity1 = { id: 123 };
        const entity2 = { id: 456 };

        const compareResult1 = service.compareEmail(entity1, entity2);
        const compareResult2 = service.compareEmail(entity2, entity1);

        expect(compareResult1).toEqual(false);
        expect(compareResult2).toEqual(false);
      });

      it('Should return false if primaryKey matches', () => {
        const entity1 = { id: 123 };
        const entity2 = { id: 123 };

        const compareResult1 = service.compareEmail(entity1, entity2);
        const compareResult2 = service.compareEmail(entity2, entity1);

        expect(compareResult1).toEqual(true);
        expect(compareResult2).toEqual(true);
      });
    });
  });

  afterEach(() => {
    httpMock.verify();
  });
});
