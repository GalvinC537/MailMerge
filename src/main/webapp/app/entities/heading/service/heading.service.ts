import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpResponse } from '@angular/common/http';
import { Observable } from 'rxjs';

import { isPresent } from 'app/core/util/operators';
import { ApplicationConfigService } from 'app/core/config/application-config.service';
import { createRequestOption } from 'app/core/request/request-util';
import { IHeading, NewHeading } from '../heading.model';

export type PartialUpdateHeading = Partial<IHeading> & Pick<IHeading, 'id'>;

export type EntityResponseType = HttpResponse<IHeading>;
export type EntityArrayResponseType = HttpResponse<IHeading[]>;

@Injectable({ providedIn: 'root' })
export class HeadingService {
  protected readonly http = inject(HttpClient);
  protected readonly applicationConfigService = inject(ApplicationConfigService);

  protected resourceUrl = this.applicationConfigService.getEndpointFor('api/headings');

  create(heading: NewHeading): Observable<EntityResponseType> {
    return this.http.post<IHeading>(this.resourceUrl, heading, { observe: 'response' });
  }

  update(heading: IHeading): Observable<EntityResponseType> {
    return this.http.put<IHeading>(`${this.resourceUrl}/${this.getHeadingIdentifier(heading)}`, heading, { observe: 'response' });
  }

  partialUpdate(heading: PartialUpdateHeading): Observable<EntityResponseType> {
    return this.http.patch<IHeading>(`${this.resourceUrl}/${this.getHeadingIdentifier(heading)}`, heading, { observe: 'response' });
  }

  find(id: number): Observable<EntityResponseType> {
    return this.http.get<IHeading>(`${this.resourceUrl}/${id}`, { observe: 'response' });
  }

  query(req?: any): Observable<EntityArrayResponseType> {
    const options = createRequestOption(req);
    return this.http.get<IHeading[]>(this.resourceUrl, { params: options, observe: 'response' });
  }

  delete(id: number): Observable<HttpResponse<{}>> {
    return this.http.delete(`${this.resourceUrl}/${id}`, { observe: 'response' });
  }

  getHeadingIdentifier(heading: Pick<IHeading, 'id'>): number {
    return heading.id;
  }

  compareHeading(o1: Pick<IHeading, 'id'> | null, o2: Pick<IHeading, 'id'> | null): boolean {
    return o1 && o2 ? this.getHeadingIdentifier(o1) === this.getHeadingIdentifier(o2) : o1 === o2;
  }

  addHeadingToCollectionIfMissing<Type extends Pick<IHeading, 'id'>>(
    headingCollection: Type[],
    ...headingsToCheck: (Type | null | undefined)[]
  ): Type[] {
    const headings: Type[] = headingsToCheck.filter(isPresent);
    if (headings.length > 0) {
      const headingCollectionIdentifiers = headingCollection.map(headingItem => this.getHeadingIdentifier(headingItem));
      const headingsToAdd = headings.filter(headingItem => {
        const headingIdentifier = this.getHeadingIdentifier(headingItem);
        if (headingCollectionIdentifiers.includes(headingIdentifier)) {
          return false;
        }
        headingCollectionIdentifiers.push(headingIdentifier);
        return true;
      });
      return [...headingsToAdd, ...headingCollection];
    }
    return headingCollection;
  }
}
