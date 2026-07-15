import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { CvAnalysisApi } from '../../../core/api/cv-analysis.api';
import { FilesApi } from '../../../core/api/files.api';
import { extractErrorMessage } from '../../../core/api/http-utils';
import { NotifyService } from '../../../core/notify.service';
import { CvAnalysisResponse, FileRecord, JOB_CATEGORIES } from '../../../core/models';
import { JobCategoryPipe } from '../../../shared/pipes';
import { EmptyState } from '../../../shared/ui/empty-state';
import { Spinner } from '../../../shared/ui/spinner';

@Component({
  selector: 'app-cv-analysis',
  imports: [
    DatePipe,
    ReactiveFormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatChipsModule,
    MatExpansionModule,
    MatProgressBarModule,
    JobCategoryPipe,
    Spinner,
    EmptyState,
  ],
  templateUrl: './cv-analysis.html',
})
export class CvAnalysis {
  private fb = inject(FormBuilder);
  private filesApi = inject(FilesApi);
  private api = inject(CvAnalysisApi);
  private notify = inject(NotifyService);

  readonly jobCategories = JOB_CATEGORIES;
  readonly cvFiles = signal<FileRecord[]>([]);
  readonly jdFiles = signal<FileRecord[]>([]);
  readonly analyses = signal<CvAnalysisResponse[]>([]);
  readonly loading = signal(true);
  readonly submitting = signal(false);

  readonly form = this.fb.nonNullable.group({
    cvId: ['', [Validators.required]],
    jobCategory: ['BA', [Validators.required]],
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
    this.api.list().subscribe({
      next: (list) => {
        this.analyses.set(list);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    this.submitting.set(true);
    this.api
      .create({
        cvId: v.cvId,
        jobCategory: v.jobCategory as CvAnalysisResponse['jobCategory'],
        jdId: v.jdId || null,
      })
      .subscribe({
        next: (res) => {
          this.submitting.set(false);
          this.analyses.update((list) => [res, ...list]);
          this.notify.success('Phân tích CV hoàn tất.');
        },
        error: (e: HttpErrorResponse) => {
          this.submitting.set(false);
          if (e.status !== 402) {
            this.notify.error(extractErrorMessage(e) ?? 'Phân tích thất bại.');
          }
        },
      });
  }
}
