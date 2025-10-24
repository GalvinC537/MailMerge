import { inject } from '@angular/core';
import { HttpResponse } from '@angular/common/http';
import { ActivatedRouteSnapshot, Router } from '@angular/router';
import { EMPTY, Observable, of } from 'rxjs';
import { mergeMap } from 'rxjs/operators';

import { IAttachment } from '../attachment.model';
import { AttachmentService } from '../service/attachment.service';

const attachmentResolve = (route: ActivatedRouteSnapshot): Observable<null | IAttachment> => {
  const id = route.params.id;
  if (id) {
    return inject(AttachmentService)
      .find(id)
      .pipe(
        mergeMap((attachment: HttpResponse<IAttachment>) => {
          if (attachment.body) {
            return of(attachment.body);
          }
          inject(Router).navigate(['404']);
          return EMPTY;
        }),
      );
  }
  return of(null);
};

export default attachmentResolve;
