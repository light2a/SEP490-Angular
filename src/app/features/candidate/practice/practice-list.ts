import { DatePipe, DecimalPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
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
  PracticeSessionOptions,
  PracticeSessionSummary,
  QUESTION_COUNT_MAX,
  QUESTION_COUNT_MIN,
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
    /* SC3 — preset độ dài buổi luyện. */
    .presets {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .preset.active {
      border-color: var(--mat-sys-primary);
      color: var(--mat-sys-primary);
    }
    .preset-seed {
      margin-left: 4px;
      opacity: 0.75;
      font-size: 12px;
    }
    .qc-field {
      width: 100%;
      max-width: 260px;
    }
    /* Cảnh báo phủ tiêu chí: đủ tương phản để đọc TRƯỚC khi bấm, không phải chữ mờ ở góc. */
    .field-warn {
      display: flex;
      align-items: flex-start;
      gap: 6px;
      font-size: 12px;
      color: var(--mat-sys-on-surface-variant);
    }
    .field-warn mat-icon {
      flex: none;
      font-size: 16px;
      width: 16px;
      height: 16px;
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

  /**
   * Ngôn ngữ BÀI PHỎNG VẤN — không phải ngôn ngữ giao diện (xem `CreatePracticeSessionRequest`).
   * Nhãn nói rõ "câu hỏi & nhận xét" để không ai tưởng bấm vào đây là đổi UI.
   */
  readonly languageOptions = [
    { value: 'vi', label: 'Tiếng Việt' },
    { value: 'en', label: 'Tiếng Anh' },
  ];

  readonly form = this.fb.nonNullable.group({
    jobCategory: ['BA', [Validators.required]],
    language: ['vi', [Validators.required]],
    cvId: [''],
    jdId: [''],
    jdText: ['', [Validators.maxLength(JD_TEXT_MAX_CHARS)]],
    timeLimitSec: [120, [Validators.required]],
    // F2b — trần 20 khớp guard BE; vượt là 400. Chặn ở form để khỏi tốn round-trip.
    // Biên thật do server trả về (`session-options`) vì trần còn phụ thuộc gói; hằng số ở đây chỉ
    // là mặc định trước khi options về.
    questionCount: [
      5,
      [Validators.required, Validators.min(QUESTION_COUNT_MIN), Validators.max(QUESTION_COUNT_MAX)],
    ],
  });

  readonly questionCountMin = QUESTION_COUNT_MIN;
  readonly questionCountMax = QUESTION_COUNT_MAX;

  // ── SC3: preset số câu do SERVER tính ─────────────────────────────────────────────────────
  /** `null` = chưa nạp được (BE cũ / lỗi) → form lùi về ô nhập số trần như trước. */
  readonly options = signal<PracticeSessionOptions | null>(null);
  /** Thông điệp BE trả khi từ chối tổ hợp nhóm nghề + ngôn ngữ (thường là cờ song ngữ đang tắt). */
  readonly optionsError = signal<string | null>(null);

  /**
   * Số câu GỐC ứng với tổng số câu đang chọn — tra bảng `preview` của server.
   *
   * Cố tình KHÔNG tự tính `ceil(total / (1 + maxDeep))` ở FE dù công thức nhìn hiển nhiên: đó là
   * luật nghiệp vụ của BE và đã đổi một lần (INT-17b). Nhân bản nó ở đây là hẹn ngày hai bên lệch
   * nhau mà không có gì báo — người dùng sẽ thấy một con số, buổi luyện chạy một con số khác.
   * Không tra được (options chưa về / ngoài dải) → `null`, UI im lặng thay vì đoán bừa.
   */
  readonly seedCount = computed<number | null>(() => {
    const opts = this.options();
    if (!opts) return null;
    const total = this.questionCountValue();
    return opts.preview.find((p) => p.questionCount === total)?.seedCount ?? null;
  });

  /** Giá trị `questionCount` hiện tại dưới dạng signal (form control không phải signal). */
  private readonly questionCountValue = signal<number>(5);

  /** Preset đang khớp đúng tổng số câu hiện tại (để tô sáng nút). */
  readonly activePresetKey = computed<string | null>(() => {
    const total = this.questionCountValue();
    return this.options()?.presets.find((p) => p.questionCount === total)?.key ?? null;
  });

  /** Buổi này có đủ khe câu gốc để chạm tới mọi tiêu chí nội dung không (điều kiện CẦN — SC1). */
  readonly coversAllCriteria = computed<boolean | null>(() => {
    const opts = this.options();
    const seeds = this.seedCount();
    if (!opts || seeds == null || opts.contentCriteriaCount <= 0) return null;
    return seeds >= opts.contentCriteriaCount;
  });

  readonly presetLabels: Record<string, string> = {
    short: 'Ngắn',
    medium: 'Vừa',
    long: 'Dài',
  };
  presetLabel(key: string): string {
    return this.presetLabels[key] ?? key;
  }

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

    // SC3 — preset phụ thuộc CẢ nhóm nghề LẪN ngôn ngữ: số tiêu chí nội dung đọc từ rubric theo
    // ngôn ngữ, nên đổi một trong hai là phải hỏi lại server.
    this.form.controls.jobCategory.valueChanges.subscribe(() => this.loadOptions());
    this.form.controls.language.valueChanges.subscribe(() => this.loadOptions());
    this.form.controls.questionCount.valueChanges.subscribe((v) =>
      this.questionCountValue.set(Number(v)),
    );

    this.load();
    this.loadOptions();
  }

  /** SC3 — nạp preset/biên số câu từ server cho tổ hợp nhóm nghề + ngôn ngữ hiện tại. */
  loadOptions(): void {
    const { jobCategory, language } = this.form.getRawValue();
    this.api.sessionOptions(jobCategory, language).subscribe({
      next: (opts) => {
        this.options.set(opts);
        this.optionsError.set(null);
        this.applyServerBounds(opts);
      },
      error: (e: HttpErrorResponse) => {
        // Không nạp được → KHÔNG chặn người dùng tạo buổi: ô nhập số vẫn hoạt động với biên mặc
        // định, BE vẫn là chốt cuối. Chỉ mất phần gợi ý số câu gốc.
        this.options.set(null);
        this.optionsError.set(extractErrorMessage(e) ?? null);
      },
    });
  }

  /**
   * Áp biên min/max THẬT của server lên control (trần còn phụ thuộc gói dịch vụ, có thể < 20).
   * Giá trị đang chọn nằm ngoài biên mới → kéo về `defaultQuestionCount` thay vì để form đỏ mà
   * người dùng không hiểu vì sao.
   */
  private applyServerBounds(opts: PracticeSessionOptions): void {
    const ctrl = this.form.controls.questionCount;
    ctrl.setValidators([
      Validators.required,
      Validators.min(opts.questionCountMin),
      Validators.max(opts.questionCountMax),
    ]);
    const current = Number(ctrl.value);
    if (current < opts.questionCountMin || current > opts.questionCountMax) {
      ctrl.setValue(opts.defaultQuestionCount);
    }
    ctrl.updateValueAndValidity({ emitEvent: false });
    this.questionCountValue.set(Number(ctrl.value));
  }

  /** Bấm preset = đặt tổng số câu (BE chỉ nhận tổng, không nhận số câu gốc). */
  applyPreset(questionCount: number): void {
    this.form.controls.questionCount.setValue(questionCount);
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
        language: v.language,
        cvId: v.cvId || null,
        jdId: jdText ? null : v.jdId || null,
        jdText: jdText || null,
        timeLimitSec: v.timeLimitSec,
        questionCount: v.questionCount,
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
