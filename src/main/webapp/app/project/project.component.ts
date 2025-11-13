import { Component, OnInit, inject } from '@angular/core';
import { RouterModule, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { ProjectService, Project } from 'app/project/project.service';

@Component({
  standalone: true,
  selector: 'jhi-project',
  templateUrl: './project.component.html',
  styleUrls: ['./project.component.scss'],
  imports: [CommonModule, RouterModule, FormsModule],
})
export class ProjectComponent implements OnInit {
  projects: Project[] = [];
  newProjectName = '';

  private readonly projectService = inject(ProjectService);
  private readonly router = inject(Router);

  // when component is intilaised the loadProjects function is called
  ngOnInit(): void {
    this.loadProjects();
  }

  // Load all user projects
  loadProjects(): void {
    this.projectService.findMy().subscribe({
      next: projects => (this.projects = projects),
      error: err => console.error('❌ Failed to load projects', err),
    });
  }

  // Function used to Create new project
  createProject(): void {
    if (!this.newProjectName.trim()) return;

    const project: Project = { name: this.newProjectName };
    this.projectService.create(project).subscribe({
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      next: created => this.router.navigate(['/mail', created.id]),
      error: err => console.error('❌ Failed to create project', err),
    });
  }

  // Open project (go to mail dashboard) - calls the app.route.ts file
  openProject(project: Project): void {
    this.router.navigate(['/mail', project.id]);
  }

  // Function to Delete project
  deleteProject(id: number): void {
    this.projectService.delete(id).subscribe(() => this.loadProjects());
  }
}
