import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { FilesApi } from '../../../core/api/files.api';
import { extractErrorMessage } from '../../../core/api/http-utils';
import { RoadmapApi } from '../../../core/api/roadmap.api';
import { NotifyService } from '../../../core/notify.service';
import {
  FileRecord,
  JOB_CATEGORIES,
  JobCategory,
  ROADMAP_LEVELS,
  RoadmapLevel,
  RoadmapResponse,
} from '../../../core/models';
import { JobCategoryPipe } from '../../../shared/pipes';
import { EmptyState } from '../../../shared/ui/empty-state';
import { Spinner } from '../../../shared/ui/spinner';

@Component({
  selector: 'app-roadmaps',
  imports: [
    DatePipe,
    RouterLink,
    ReactiveFormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatListModule,
    MatProgressBarModule,
    JobCategoryPipe,
    Spinner,
    EmptyState,
  ],
  templateUrl: './roadmaps.html',
})
export class Roadmaps {
  private fb = inject(FormBuilder);
  private api = inject(RoadmapApi);
  private filesApi = inject(FilesApi);
  private notify = inject(NotifyService);
  private router = inject(Router);

  readonly jobCategories = JOB_CATEGORIES;
  readonly levels = ROADMAP_LEVELS;
  readonly roadmaps = signal<RoadmapResponse[]>([]);
  readonly cvFiles = signal<FileRecord[]>([]);
  readonly loading = signal(true);
  readonly creating = signal(false);

  readonly form = this.fb.nonNullable.group({
    jobCategory: ['BA', [Validators.required]],
    level: ['Fresher', [Validators.required]],
    cvId: [''],
  });

  constructor() {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.filesApi.list().subscribe({
      next: (all) => this.cvFiles.set(all.filter((f) => f.fileType === 'cv')),
    });
    this.api.list().subscribe({
      next: (list) => {
        this.roadmaps.set(list);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  create(): void {
    if (this.form.invalid) return;
    const v = this.form.getRawValue();
    this.creating.set(true);
    this.api
      .create({
        jobCategory: v.jobCategory as JobCategory,
        level: v.level as RoadmapLevel,
        cvId: v.cvId || null,
      })
      .subscribe({
        next: (r) => {
          this.creating.set(false);
          this.router.navigate(['/candidate/roadmaps', r.id]);
        },
        error: (e: HttpErrorResponse) => {
          this.creating.set(false);
          this.notify.error(extractErrorMessage(e) ?? 'Không tạo được lộ trình.');
        },
      });
  }
}
