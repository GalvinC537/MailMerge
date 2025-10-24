import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpResponse } from '@angular/common/http';
import { Observable, map } from 'rxjs';

import dayjs from 'dayjs/esm';

import { isPresent } from 'app/core/util/operators';
import { ApplicationConfigService } from 'app/core/config/application-config.service';
import { createRequestOption } from 'app/core/request/request-util';
import { IEmail, NewEmail } from '../email.model';

export type PartialUpdateEmail = Partial<IEmail> & Pick<IEmail, 'id'>;

type RestOf<T extends IEmail | NewEmail> = Omit<T, 'sentAt'> & {
  sentAt?: string | null;
};

export type RestEmail = RestOf<IEmail>;

export type NewRestEmail = RestOf<NewEmail>;

export type PartialUpdateRestEmail = RestOf<PartialUpdateEmail>;

export type EntityResponseType = HttpResponse<IEmail>;
export type EntityArrayResponseType = HttpResponse<IEmail[]>;

@Injectable({ providedIn: 'root' })
export class EmailService {
  protected readonly http = inject(HttpClient);
  protected readonly applicationConfigService = inject(ApplicationConfigService);

  protected resourceUrl = this.applicationConfigService.getEndpointFor('api/emails');

  create(email: NewEmail): Observable<EntityResponseType> {
    const copy = this.convertDateFromClient(email);
    return this.http.post<RestEmail>(this.resourceUrl, copy, { observe: 'response' }).pipe(map(res => this.convertResponseFromServer(res)));
  }

  update(email: IEmail): Observable<EntityResponseType> {
    const copy = this.convertDateFromClient(email);
    return this.http
      .put<RestEmail>(`${this.resourceUrl}/${this.getEmailIdentifier(email)}`, copy, { observe: 'response' })
      .pipe(map(res => this.convertResponseFromServer(res)));
  }

  partialUpdate(email: PartialUpdateEmail): Observable<EntityResponseType> {
    const copy = this.convertDateFromClient(email);
    return this.http
      .patch<RestEmail>(`${this.resourceUrl}/${this.getEmailIdentifier(email)}`, copy, { observe: 'response' })
      .pipe(map(res => this.convertResponseFromServer(res)));
  }

  find(id: number): Observable<EntityResponseType> {
    return this.http
      .get<RestEmail>(`${this.resourceUrl}/${id}`, { observe: 'response' })
      .pipe(map(res => this.convertResponseFromServer(res)));
  }

  query(req?: any): Observable<EntityArrayResponseType> {
    const options = createRequestOption(req);
    return this.http
      .get<RestEmail[]>(this.resourceUrl, { params: options, observe: 'response' })
      .pipe(map(res => this.convertResponseArrayFromServer(res)));
  }

  delete(id: number): Observable<HttpResponse<{}>> {
    return this.http.delete(`${this.resourceUrl}/${id}`, { observe: 'response' });
  }

  getEmailIdentifier(email: Pick<IEmail, 'id'>): number {
    return email.id;
  }

  compareEmail(o1: Pick<IEmail, 'id'> | null, o2: Pick<IEmail, 'id'> | null): boolean {
    return o1 && o2 ? this.getEmailIdentifier(o1) === this.getEmailIdentifier(o2) : o1 === o2;
  }

  addEmailToCollectionIfMissing<Type extends Pick<IEmail, 'id'>>(
    emailCollection: Type[],
    ...emailsToCheck: (Type | null | undefined)[]
  ): Type[] {
    const emails: Type[] = emailsToCheck.filter(isPresent);
    if (emails.length > 0) {
      const emailCollectionIdentifiers = emailCollection.map(emailItem => this.getEmailIdentifier(emailItem));
      const emailsToAdd = emails.filter(emailItem => {
        const emailIdentifier = this.getEmailIdentifier(emailItem);
        if (emailCollectionIdentifiers.includes(emailIdentifier)) {
          return false;
        }
        emailCollectionIdentifiers.push(emailIdentifier);
        return true;
      });
      return [...emailsToAdd, ...emailCollection];
    }
    return emailCollection;
  }

  protected convertDateFromClient<T extends IEmail | NewEmail | PartialUpdateEmail>(email: T): RestOf<T> {
    return {
      ...email,
      sentAt: email.sentAt?.toJSON() ?? null,
    };
  }

  protected convertDateFromServer(restEmail: RestEmail): IEmail {
    return {
      ...restEmail,
      sentAt: restEmail.sentAt ? dayjs(restEmail.sentAt) : undefined,
    };
  }

  protected convertResponseFromServer(res: HttpResponse<RestEmail>): HttpResponse<IEmail> {
    return res.clone({
      body: res.body ? this.convertDateFromServer(res.body) : null,
    });
  }

  protected convertResponseArrayFromServer(res: HttpResponse<RestEmail[]>): HttpResponse<IEmail[]> {
    return res.clone({
      body: res.body ? res.body.map(item => this.convertDateFromServer(item)) : null,
    });
  }
}
