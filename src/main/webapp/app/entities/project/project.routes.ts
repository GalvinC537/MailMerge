import { Routes } from '@angular/router';

import { UserRouteAccessService } from 'app/core/auth/user-route-access.service';
import { ASC } from 'app/config/navigation.constants';
import ProjectResolve from './route/project-routing-resolve.service';

const projectRoute: Routes = [
  {
    path: '',
    loadComponent: () => import('./list/project.component').then(m => m.ProjectComponent),
    data: {
      defaultSort: `id,${ASC}`,
    },
    canActivate: [UserRouteAccessService],
  },
  {
    path: ':id/view',
    loadComponent: () => import('./detail/project-detail.component').then(m => m.ProjectDetailComponent),
    resolve: {
      project: ProjectResolve,
    },
    canActivate: [UserRouteAccessService],
  },
  {
    path: 'new',
    loadComponent: () => import('./update/project-update.component').then(m => m.ProjectUpdateComponent),
    resolve: {
      project: ProjectResolve,
    },
    canActivate: [UserRouteAccessService],
  },
  {
    path: ':id/edit',
    loadComponent: () => import('./update/project-update.component').then(m => m.ProjectUpdateComponent),
    resolve: {
      project: ProjectResolve,
    },
    canActivate: [UserRouteAccessService],
  },
];

export default projectRoute;
