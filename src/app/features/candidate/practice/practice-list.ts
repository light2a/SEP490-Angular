import { DatePipe, DecimalPipe } from '@angular/common';
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
import { PracticeApi } from '../../../core/api/practice.api';
import { NotifyService } from '../../../core/notify.service';
import {
  FileRecord,
  JOB_CATEGORIES,
  JobCategory,
  PracticeSessionSummary,
} from '../../../core/models';
import { JobCategoryPipe, SessionStatusPipe } from '../../../shared/pipes';
import { EmptyState } from '../../../shared/ui/empty-state';
import { Spinner } from '../../../shared/ui/spinner';

@Component({
  selector: 'app-practice-list',
  imports: [
    DatePipe,
    DecimalPipe,
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
    SessionStatusPipe,
    Spinner,
    EmptyState,
  ],
  templateUrl: './practice-list.html',
})
export class PracticeList {
  private fb = inject(FormBuilder);
  private filesApi = inject(FilesApi);
  private api = inject(PracticeApi);
  private notify = inject(NotifyService);
  private router = inject(Router);

  readonly jobCategories = JOB_CATEGORIES;
  readonly cvFiles = signal<FileRecord[]>([]);
  readonly jdFiles = signal<FileRecord[]>([]);
  readonly history = signal<PracticeSessionSummary[]>([]);
  readonly loading = signal(true);
  readonly creating = signal(false);

  readonly form = this.fb.nonNullable.group({
    jobCategory: ['BA', [Validators.required]],
    cvId: [''],
    jdId: [''],
  });

  constructor() {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.filesApi.list().subscribe({
      next: (all) => {
        this.cvFiles.set(all.filter((f) => f.fileType === 'cv'));
        this.jdFiles.set(all.filter((f) => f.fileType === 'jd'));
      },
    });
    this.api.history().subscribe({
      next: (h) => {
        this.history.set(h);
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
      .create({ jobCategory: v.jobCategory as JobCategory, cvId: v.cvId || null, jdId: v.jdId || null })
      .subscribe({
        next: (s) => {
          this.creating.set(false);
          this.router.navigate(['/candidate/practice', s.id]);
        },
        error: (e: HttpErrorResponse) => {
          this.creating.set(false);
          if (e.status !== 402) this.notify.error(extractErrorMessage(e) ?? 'Không tạo được buổi luyện.');
        },
      });
  }
}
