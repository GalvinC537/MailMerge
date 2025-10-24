import { Routes } from '@angular/router';

import { UserRouteAccessService } from 'app/core/auth/user-route-access.service';
import { ASC } from 'app/config/navigation.constants';
import AttachmentResolve from './route/attachment-routing-resolve.service';

const attachmentRoute: Routes = [
  {
    path: '',
    loadComponent: () => import('./list/attachment.component').then(m => m.AttachmentComponent),
    data: {
      defaultSort: `id,${ASC}`,
    },
    canActivate: [UserRouteAccessService],
  },
  {
    path: ':id/view',
    loadComponent: () => import('./detail/attachment-detail.component').then(m => m.AttachmentDetailComponent),
    resolve: {
      attachment: AttachmentResolve,
    },
    canActivate: [UserRouteAccessService],
  },
  {
    path: 'new',
    loadComponent: () => import('./update/attachment-update.component').then(m => m.AttachmentUpdateComponent),
    resolve: {
      attachment: AttachmentResolve,
    },
    canActivate: [UserRouteAccessService],
  },
  {
    path: ':id/edit',
    loadComponent: () => import('./update/attachment-update.component').then(m => m.AttachmentUpdateComponent),
    resolve: {
      attachment: AttachmentResolve,
    },
    canActivate: [UserRouteAccessService],
  },
];

export default attachmentRoute;
