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
import { JOB_CATEGORIES, JobCategory, RubricResponse } from '../../../core/models';
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
        r.criteria.forEach((c) => this.criteria.push(this.row(c.name, c.description, c.weight, c.maxScore)));
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  changeCategory(cat: JobCategory): void {
    this.category.set(cat);
    this.load();
  }

  private row(name = '', description: string | null = '', weight = 0.1, maxScore = 10): FormGroup {
    return this.fb.group({
      name: [name, [Validators.required]],
      description: [description ?? ''],
      weight: [weight, [Validators.required, Validators.min(0.0001)]],
      maxScore: [maxScore, [Validators.required, Validators.min(1)]],
    });
  }

  addRow(): void {
    this.criteria.push(this.row());
  }
  removeRow(i: number): void {
    this.criteria.removeAt(i);
  }

  totalWeight(): number {
    return this.criteria.controls.reduce((sum, g) => sum + Number(g.get('weight')?.value || 0), 0);
  }

  save(): void {
    if (this.form.invalid || this.criteria.length === 0) {
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
    const criteria = this.criteria.controls.map((g) => ({
      name: g.get('name')!.value,
      description: g.get('description')!.value || null,
      weight: Number(g.get('weight')!.value),
      maxScore: Number(g.get('maxScore')!.value),
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
