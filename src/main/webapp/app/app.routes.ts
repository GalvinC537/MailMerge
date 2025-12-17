import { Routes } from '@angular/router';

import { Authority } from 'app/config/authority.constants';
import { UserRouteAccessService } from 'app/core/auth/user-route-access.service';
import { errorRoute } from './layouts/error/error.route';

const routes: Routes = [
  // Home page — redirects logged-in users to /project
  {
    path: '',
    loadComponent: () => import('./home/home.component'),
    title: 'home.title',
  },

  //  Project list page — shows user’s projects

  {
    path: 'project',
    canActivate: [UserRouteAccessService],
    loadComponent: () => import('./project/project.component').then(m => m.ProjectComponent),
    data: { pageTitle: 'Projects' },
  },

  //  Mail dashboard — open an existing project by its ID

  {
    path: 'mail/:id',
    canActivate: [UserRouteAccessService],
    loadComponent: () => import('./mail-dashboard/mail-dashboard.component').then(m => m.MailDashboardComponent),
    data: { pageTitle: 'Mail Dashboard' },
  },

  // Navbar outlet (for global navigation)
  {
    path: '',
    loadComponent: () => import('./layouts/navbar/navbar.component'),
    outlet: 'navbar',
  },

  // Admin section
  {
    path: 'admin',
    data: { authorities: [Authority.ADMIN] },
    canActivate: [UserRouteAccessService],
    loadChildren: () => import('./admin/admin.routes'),
  },

  // JHipster-generated entities (like Project, User, etc.)
  {
    path: '',
    loadChildren: () => import('./entities/entity.routes'),
  },

  {
    path: 'mail-dashboard',
    canActivate: [UserRouteAccessService],
    loadComponent: () => import('./mail-dashboard/mail-dashboard.component').then(m => m.MailDashboardComponent),
    data: { pageTitle: 'Mail Dashboard' },
  },

  // Error routes (404, access denied, etc.)
  ...errorRoute,
];

export default routes;
