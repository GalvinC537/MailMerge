import { Routes } from '@angular/router';

const routes: Routes = [
  {
    path: 'authority',
    data: { pageTitle: 'Authorities' },
    loadChildren: () => import('./admin/authority/authority.routes'),
  },
  {
    path: 'project',
    data: { pageTitle: 'Projects' },
    loadChildren: () => import('./project/project.routes'),
  },
  {
    path: 'email',
    data: { pageTitle: 'Emails' },
    loadChildren: () => import('./email/email.routes'),
  },
  {
    path: 'attachment',
    data: { pageTitle: 'Attachments' },
    loadChildren: () => import('./attachment/attachment.routes'),
  },
  {
    path: 'heading',
    data: { pageTitle: 'Headings' },
    loadChildren: () => import('./heading/heading.routes'),
  },
  /* jhipster-needle-add-entity-route - JHipster will add entity modules routes here */
];

export default routes;
