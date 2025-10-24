import { inject } from '@angular/core';
import { HttpResponse } from '@angular/common/http';
import { ActivatedRouteSnapshot, Router } from '@angular/router';
import { EMPTY, Observable, of } from 'rxjs';
import { mergeMap } from 'rxjs/operators';

import { IHeading } from '../heading.model';
import { HeadingService } from '../service/heading.service';

const headingResolve = (route: ActivatedRouteSnapshot): Observable<null | IHeading> => {
  const id = route.params.id;
  if (id) {
    return inject(HeadingService)
      .find(id)
      .pipe(
        mergeMap((heading: HttpResponse<IHeading>) => {
          if (heading.body) {
            return of(heading.body);
          }
          inject(Router).navigate(['404']);
          return EMPTY;
        }),
      );
  }
  return of(null);
};

export default headingResolve;
