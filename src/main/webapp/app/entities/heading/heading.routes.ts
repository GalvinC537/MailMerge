import { Routes } from '@angular/router';

import { UserRouteAccessService } from 'app/core/auth/user-route-access.service';
import { ASC } from 'app/config/navigation.constants';
import HeadingResolve from './route/heading-routing-resolve.service';

const headingRoute: Routes = [
  {
    path: '',
    loadComponent: () => import('./list/heading.component').then(m => m.HeadingComponent),
    data: {
      defaultSort: `id,${ASC}`,
    },
    canActivate: [UserRouteAccessService],
  },
  {
    path: ':id/view',
    loadComponent: () => import('./detail/heading-detail.component').then(m => m.HeadingDetailComponent),
    resolve: {
      heading: HeadingResolve,
    },
    canActivate: [UserRouteAccessService],
  },
  {
    path: 'new',
    loadComponent: () => import('./update/heading-update.component').then(m => m.HeadingUpdateComponent),
    resolve: {
      heading: HeadingResolve,
    },
    canActivate: [UserRouteAccessService],
  },
  {
    path: ':id/edit',
    loadComponent: () => import('./update/heading-update.component').then(m => m.HeadingUpdateComponent),
    resolve: {
      heading: HeadingResolve,
    },
    canActivate: [UserRouteAccessService],
  },
];

export default headingRoute;
