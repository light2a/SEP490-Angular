import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { RubricApi } from '../../../core/api/rubric.api';
import { extractErrorMessage } from '../../../core/api/http-utils';
import { NotifyService } from '../../../core/notify.service';
import {
  CriterionLevelItem,
  JOB_CATEGORIES,
  JobCategory,
  RubricCriterionItem,
  RubricResponse,
} from '../../../core/models';
import {
  CriterionLevelsEditor,
  canonicalLevels,
  criterionLevelsValidator,
  levelErrorMessages,
  readLevels,
} from '../../../shared/rubric/criterion-levels-editor';
import { JobCategoryPipe } from '../../../shared/pipes';
import { Spinner } from '../../../shared/ui/spinner';

@Component({
  selector: 'app-rubrics',
  imports: [
    ReactiveFormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    CriterionLevelsEditor,
    JobCategoryPipe,
    Spinner,
  ],
  templateUrl: './rubrics.html',
  styleUrl: './rubrics.scss',
})
export class Rubrics {
  private fb = inject(FormBuilder);
  private api = inject(RubricApi);
  private notify = inject(NotifyService);

  readonly jobCategories = JOB_CATEGORIES;
  readonly category = signal<JobCategory>('BA');
  readonly rubric = signal<RubricResponse | null>(null);
  readonly loading = signal(true);
  readonly saving = signal(false);

  readonly form = this.fb.group({ criteria: this.fb.array<FormGroup>([]) });

  constructor() {
    this.load();
  }

  get criteria(): FormArray<FormGroup> {
    return this.form.get('criteria') as FormArray<FormGroup>;
  }

  load(): void {
    this.loading.set(true);
    this.api.get(this.category()).subscribe({
      next: (r) => {
        this.rubric.set(r);
        this.criteria.clear();
        r.criteria.forEach((c) => this.criteria.push(this.rowFrom(c)));
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  changeCategory(cat: JobCategory): void {
    this.category.set(cat);
    this.load();
  }

  /**
   * Nạp một tiêu chí **kèm mốc**.
   *
   * Khi đang xem bộ mặc định (`isCustom=false`), mốc do quản trị viên soạn đi theo ⇒ bấm sửa là đã
   * có sẵn mốc để chỉnh. Thiếu vế này thì *dùng mặc định được thang có mô tả, tự tuỳ chỉnh lại bị
   * thang rỗng nghĩa* — tự tuỳ chỉnh làm chất lượng chấm TỆ ĐI mà không ai biết.
   */
  private rowFrom(c: RubricCriterionItem): FormGroup {
    return this.row(c.name, c.description, c.weight, c.maxScore, c.levels ?? []);
  }

  private row(
    name = '',
    description: string | null = '',
    weight = 0.1,
    maxScore = 10,
    levels: CriterionLevelItem[] = [],
  ): FormGroup {
    return this.fb.group(
      {
        name: [name, [Validators.required]],
        description: [description ?? ''],
        weight: [weight, [Validators.required, Validators.min(0.0001)]],
        maxScore: [maxScore, [Validators.required, Validators.min(1)]],
        // Giảm dần để khớp cách đọc của editor (nghĩ từ "thế nào là điểm tối đa" rồi bóc xuống).
        levels: this.fb.array<FormGroup>(
          [...levels]
            .sort((a, b) => b.score - a.score)
            .map((l) => this.fb.group({ score: [l.score], descriptor: [l.descriptor] })),
        ),
        levelsOriginal: [canonicalLevels(levels)],
        levelsSource: [levels.length ? 'hr' : 'none'],
      },
      { validators: criterionLevelsValidator },
    );
  }

  addRow(): void {
    this.criteria.push(this.row());
  }
  removeRow(i: number): void {
    this.criteria.removeAt(i);
  }

  levelsOf(i: number): CriterionLevelItem[] {
    const g = this.criteria.at(i);
    return g ? readLevels(g) : [];
  }

  /**
   * Tiêu chí tự thêm chưa có mốc ⇒ rơi về dải mặc định. Đó là trạng thái **hợp lệ**, nhưng phải
   * hiện ra để người dùng biết mình đang đánh đổi cái gì.
   */
  hasNoLevels(i: number): boolean {
    return this.levelsOf(i).length === 0;
  }

  noLevelsCount(): number {
    return this.criteria.controls.filter((_, i) => this.hasNoLevels(i)).length;
  }

  totalWeight(): number {
    return this.criteria.controls.reduce((sum, g) => sum + Number(g.get('weight')?.value || 0), 0);
  }

  /** Lỗi mốc theo từng hàng — nói rõ hàng nào sai thay vì chỉ chặn nút Lưu. */
  levelIssues(): string[] {
    return this.criteria.controls
      .map((g) => {
        const msgs = levelErrorMessages(
          criterionLevelsValidator(g),
          Number(g.get('maxScore')?.value ?? 10),
        );
        return msgs.length ? `${g.get('name')?.value || '(chưa đặt tên)'}: ${msgs.join(' ')}` : '';
      })
      .filter(Boolean);
  }

  save(): void {
    if (this.criteria.length === 0) {
      this.form.markAllAsTouched();
      this.notify.warn('Cần ít nhất 1 tiêu chí hợp lệ.');
      return;
    }
    // Kiểm mốc TRƯỚC: `form.invalid` gộp cả lỗi mốc lẫn lỗi tên/trọng số vào một câu chung chung.
    const issues = this.levelIssues();
    if (issues.length > 0) {
      this.notify.warn(issues[0]);
      return;
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.notify.warn('Cần ít nhất 1 tiêu chí hợp lệ.');
      return;
    }
    const total = this.totalWeight();
    if (Math.abs(total - 1) > 0.01) {
      this.notify.warn(`Tổng trọng số phải ≈ 1 (hiện tại ${total.toFixed(2)}).`);
      return;
    }
    this.saving.set(true);
    const criteria = this.criteria.controls.map((g, i) => ({
      name: g.get('name')!.value,
      description: g.get('description')!.value || null,
      weight: Number(g.get('weight')!.value),
      maxScore: Number(g.get('maxScore')!.value),
      levels: this.levelsOf(i),
    }));
    this.api.upsert(this.category(), { criteria }).subscribe({
      next: (r) => {
        this.saving.set(false);
        this.rubric.set(r);
        this.notify.success('Đã lưu rubric riêng.');
      },
      error: (e: HttpErrorResponse) => {
        this.saving.set(false);
        this.notify.error(extractErrorMessage(e) ?? 'Lưu rubric thất bại.');
      },
    });
  }

  resetToSeed(): void {
    if (!confirm('Xoá rubric riêng và dùng lại mặc định?')) return;
    this.api.remove(this.category()).subscribe({
      next: () => {
        this.notify.success('Đã về rubric mặc định.');
        this.load();
      },
      error: () => this.notify.error('Không xoá được.'),
    });
  }
}
