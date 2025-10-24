import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';

import { IHeading } from '../heading.model';
import { sampleWithFullData, sampleWithNewData, sampleWithPartialData, sampleWithRequiredData } from '../heading.test-samples';

import { HeadingService } from './heading.service';

const requireRestSample: IHeading = {
  ...sampleWithRequiredData,
};

describe('Heading Service', () => {
  let service: HeadingService;
  let httpMock: HttpTestingController;
  let expectedResult: IHeading | IHeading[] | boolean | null;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    expectedResult = null;
    service = TestBed.inject(HeadingService);
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

    it('should create a Heading', () => {
      const heading = { ...sampleWithNewData };
      const returnedFromService = { ...requireRestSample };
      const expected = { ...sampleWithRequiredData };

      service.create(heading).subscribe(resp => (expectedResult = resp.body));

      const req = httpMock.expectOne({ method: 'POST' });
      req.flush(returnedFromService);
      expect(expectedResult).toMatchObject(expected);
    });

    it('should update a Heading', () => {
      const heading = { ...sampleWithRequiredData };
      const returnedFromService = { ...requireRestSample };
      const expected = { ...sampleWithRequiredData };

      service.update(heading).subscribe(resp => (expectedResult = resp.body));

      const req = httpMock.expectOne({ method: 'PUT' });
      req.flush(returnedFromService);
      expect(expectedResult).toMatchObject(expected);
    });

    it('should partial update a Heading', () => {
      const patchObject = { ...sampleWithPartialData };
      const returnedFromService = { ...requireRestSample };
      const expected = { ...sampleWithRequiredData };

      service.partialUpdate(patchObject).subscribe(resp => (expectedResult = resp.body));

      const req = httpMock.expectOne({ method: 'PATCH' });
      req.flush(returnedFromService);
      expect(expectedResult).toMatchObject(expected);
    });

    it('should return a list of Heading', () => {
      const returnedFromService = { ...requireRestSample };

      const expected = { ...sampleWithRequiredData };

      service.query().subscribe(resp => (expectedResult = resp.body));

      const req = httpMock.expectOne({ method: 'GET' });
      req.flush([returnedFromService]);
      httpMock.verify();
      expect(expectedResult).toMatchObject([expected]);
    });

    it('should delete a Heading', () => {
      const expected = true;

      service.delete(123).subscribe(resp => (expectedResult = resp.ok));

      const req = httpMock.expectOne({ method: 'DELETE' });
      req.flush({ status: 200 });
      expect(expectedResult).toBe(expected);
    });

    describe('addHeadingToCollectionIfMissing', () => {
      it('should add a Heading to an empty array', () => {
        const heading: IHeading = sampleWithRequiredData;
        expectedResult = service.addHeadingToCollectionIfMissing([], heading);
        expect(expectedResult).toHaveLength(1);
        expect(expectedResult).toContain(heading);
      });

      it('should not add a Heading to an array that contains it', () => {
        const heading: IHeading = sampleWithRequiredData;
        const headingCollection: IHeading[] = [
          {
            ...heading,
          },
          sampleWithPartialData,
        ];
        expectedResult = service.addHeadingToCollectionIfMissing(headingCollection, heading);
        expect(expectedResult).toHaveLength(2);
      });

      it("should add a Heading to an array that doesn't contain it", () => {
        const heading: IHeading = sampleWithRequiredData;
        const headingCollection: IHeading[] = [sampleWithPartialData];
        expectedResult = service.addHeadingToCollectionIfMissing(headingCollection, heading);
        expect(expectedResult).toHaveLength(2);
        expect(expectedResult).toContain(heading);
      });

      it('should add only unique Heading to an array', () => {
        const headingArray: IHeading[] = [sampleWithRequiredData, sampleWithPartialData, sampleWithFullData];
        const headingCollection: IHeading[] = [sampleWithRequiredData];
        expectedResult = service.addHeadingToCollectionIfMissing(headingCollection, ...headingArray);
        expect(expectedResult).toHaveLength(3);
      });

      it('should accept varargs', () => {
        const heading: IHeading = sampleWithRequiredData;
        const heading2: IHeading = sampleWithPartialData;
        expectedResult = service.addHeadingToCollectionIfMissing([], heading, heading2);
        expect(expectedResult).toHaveLength(2);
        expect(expectedResult).toContain(heading);
        expect(expectedResult).toContain(heading2);
      });

      it('should accept null and undefined values', () => {
        const heading: IHeading = sampleWithRequiredData;
        expectedResult = service.addHeadingToCollectionIfMissing([], null, heading, undefined);
        expect(expectedResult).toHaveLength(1);
        expect(expectedResult).toContain(heading);
      });

      it('should return initial array if no Heading is added', () => {
        const headingCollection: IHeading[] = [sampleWithRequiredData];
        expectedResult = service.addHeadingToCollectionIfMissing(headingCollection, undefined, null);
        expect(expectedResult).toEqual(headingCollection);
      });
    });

    describe('compareHeading', () => {
      it('Should return true if both entities are null', () => {
        const entity1 = null;
        const entity2 = null;

        const compareResult = service.compareHeading(entity1, entity2);

        expect(compareResult).toEqual(true);
      });

      it('Should return false if one entity is null', () => {
        const entity1 = { id: 123 };
        const entity2 = null;

        const compareResult1 = service.compareHeading(entity1, entity2);
        const compareResult2 = service.compareHeading(entity2, entity1);

        expect(compareResult1).toEqual(false);
        expect(compareResult2).toEqual(false);
      });

      it('Should return false if primaryKey differs', () => {
        const entity1 = { id: 123 };
        const entity2 = { id: 456 };

        const compareResult1 = service.compareHeading(entity1, entity2);
        const compareResult2 = service.compareHeading(entity2, entity1);

        expect(compareResult1).toEqual(false);
        expect(compareResult2).toEqual(false);
      });

      it('Should return false if primaryKey matches', () => {
        const entity1 = { id: 123 };
        const entity2 = { id: 123 };

        const compareResult1 = service.compareHeading(entity1, entity2);
        const compareResult2 = service.compareHeading(entity2, entity1);

        expect(compareResult1).toEqual(true);
        expect(compareResult2).toEqual(true);
      });
    });
  });

  afterEach(() => {
    httpMock.verify();
  });
});
