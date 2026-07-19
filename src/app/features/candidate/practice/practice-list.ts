import { DatePipe, DecimalPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { FilesApi } from '../../../core/api/files.api';
import { extractErrorMessage } from '../../../core/api/http-utils';
import { PracticeApi } from '../../../core/api/practice.api';
import { NotifyService } from '../../../core/notify.service';
import {
  FileRecord,
  JD_TEXT_MAX_CHARS,
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
    MatInputModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatIconModule,
    MatListModule,
    MatProgressBarModule,
    JobCategoryPipe,
    SessionStatusPipe,
    Spinner,
    EmptyState,
  ],
  templateUrl: './practice-list.html',
  // Component chưa có file .scss riêng; vài class của F2 nên khai tại chỗ thay vì dựng file mới.
  styles: `
    .field-block {
      display: flex;
      flex-direction: column;
      gap: 6px;
      margin-bottom: 16px;
      align-items: flex-start;
    }
    .field-label {
      font-size: 14px;
      color: var(--mat-sys-on-surface-variant);
    }
    .field-hint {
      font-size: 12px;
      color: var(--mat-sys-on-surface-variant);
    }
  `,
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

  /** F2 — 3 mốc thời lượng mỗi câu (giây); phải khớp tập BE chấp nhận, lệch là 400. */
  readonly timeLimitOptions = [
    { value: 60, label: '1 phút' },
    { value: 120, label: '2 phút' },
    { value: 240, label: '4 phút' },
  ];

  readonly form = this.fb.nonNullable.group({
    jobCategory: ['BA', [Validators.required]],
    cvId: [''],
    jdId: [''],
    jdText: ['', [Validators.maxLength(JD_TEXT_MAX_CHARS)]],
    timeLimitSec: [120, [Validators.required]],
  });

  /**
   * Đang dán JD tay → BE sẽ BỎ file JD (quy ước C11 "text ưu tiên file"). Mirror lên UI để
   * người dùng thấy trước khi bấm, thay vì ngạc nhiên vì file chọn rồi mà không được dùng.
   */
  readonly usingJdText = signal(false);

  /** Giới hạn ký tự JD nhập tay + độ dài hiện tại (bộ đếm) — khớp hằng số BE (vượt → 400). */
  readonly jdTextMaxChars = JD_TEXT_MAX_CHARS;
  readonly jdTextLength = signal(0);

  constructor() {
    this.form.controls.jdText.valueChanges.subscribe((v) => {
      const using = v.trim().length > 0;
      this.usingJdText.set(using);
      this.jdTextLength.set(v.length);
      // Khoá dropdown file bằng CODE (không dùng [disabled] trong template — reactive form cảnh báo).
      // emitEvent:false để không kích lại vòng valueChanges của chính form.
      if (using) this.form.controls.jdId.disable({ emitEvent: false });
      else this.form.controls.jdId.enable({ emitEvent: false });
    });
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
    // Có jdText → gửi text và BỎ jdId luôn (đúng thứ tự ưu tiên C11, khỏi để BE phải đoán).
    const jdText = v.jdText.trim();
    this.api
      .create({
        jobCategory: v.jobCategory as JobCategory,
        cvId: v.cvId || null,
        jdId: jdText ? null : v.jdId || null,
        jdText: jdText || null,
        timeLimitSec: v.timeLimitSec,
      })
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
