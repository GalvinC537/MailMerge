import { Routes } from '@angular/router';

import { UserRouteAccessService } from 'app/core/auth/user-route-access.service';
import { ASC } from 'app/config/navigation.constants';
import EmailResolve from './route/email-routing-resolve.service';

const emailRoute: Routes = [
  {
    path: '',
    loadComponent: () => import('./list/email.component').then(m => m.EmailComponent),
    data: {
      defaultSort: `id,${ASC}`,
    },
    canActivate: [UserRouteAccessService],
  },
  {
    path: ':id/view',
    loadComponent: () => import('./detail/email-detail.component').then(m => m.EmailDetailComponent),
    resolve: {
      email: EmailResolve,
    },
    canActivate: [UserRouteAccessService],
  },
  {
    path: 'new',
    loadComponent: () => import('./update/email-update.component').then(m => m.EmailUpdateComponent),
    resolve: {
      email: EmailResolve,
    },
    canActivate: [UserRouteAccessService],
  },
  {
    path: ':id/edit',
    loadComponent: () => import('./update/email-update.component').then(m => m.EmailUpdateComponent),
    resolve: {
      email: EmailResolve,
    },
    canActivate: [UserRouteAccessService],
  },
];

export default emailRoute;
