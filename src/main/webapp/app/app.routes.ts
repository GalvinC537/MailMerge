import { Routes } from '@angular/router';

import { Authority } from 'app/config/authority.constants';
import { UserRouteAccessService } from 'app/core/auth/user-route-access.service';
import { errorRoute } from './layouts/error/error.route';

const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./home/home.component'),
    title: 'home.title',
  },

  {
    path: 'project',
    canActivate: [UserRouteAccessService],
    loadComponent: () => import('./project/project.component').then(m => m.ProjectComponent),
    data: { pageTitle: 'Projects' },
  },

  // ✅ Mail dashboard "blank state" (no project selected)
  {
    path: 'mail',
    canActivate: [UserRouteAccessService],
    loadComponent: () => import('./mail-dashboard/mail-dashboard.component').then(m => m.MailDashboardComponent),
    data: { pageTitle: 'Mail Dashboard' },
  },

  // ✅ Mail dashboard with selected project
  {
    path: 'mail/:id',
    canActivate: [UserRouteAccessService],
    loadComponent: () => import('./mail-dashboard/mail-dashboard.component').then(m => m.MailDashboardComponent),
    data: { pageTitle: 'Mail Dashboard' },
  },

  // ✅ Backwards-compat redirects (prevents 404 after login)
  {
    path: 'mail-dashboard',
    redirectTo: 'mail',
    pathMatch: 'full',
  },
  {
    path: 'mail-dashboard/:id',
    redirectTo: 'mail/:id',
    pathMatch: 'full',
  },

  {
    path: '',
    loadComponent: () => import('./layouts/navbar/navbar.component'),
    outlet: 'navbar',
  },

  {
    path: 'admin',
    data: { authorities: [Authority.ADMIN] },
    canActivate: [UserRouteAccessService],
    loadChildren: () => import('./admin/admin.routes'),
  },

  {
    path: 'privacy-policy',
    loadComponent: () => import('./privacy-policy/privacy-policy.component'),
    title: 'Privacy Policy',
  },

  {
    path: '',
    loadChildren: () => import('./entities/entity.routes'),
  },

  ...errorRoute,
];

export default routes;
