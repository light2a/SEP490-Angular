import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, inject, input, signal } from '@angular/core';
import {
  FormArray,
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { extractErrorMessage } from '../../../core/api/http-utils';
import { CampaignApi } from '../../../core/api/campaign.api';
import { NotifyService } from '../../../core/notify.service';
import {
  CampaignResponse,
  CreateCampaignRequest,
  CriterionItem,
  QuestionItem,
  UpdateCampaignRequest,
} from '../../../core/models';
import { Spinner } from '../../../shared/ui/spinner';

/** ISO → giá trị datetime-local (theo giờ máy). */
function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

/** datetime-local → ISO string (UTC) hoặc null. */
function toIso(local: string | null | undefined): string | null {
  if (!local) return null;
  const d = new Date(local);
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}

@Component({
  selector: 'app-campaign-form',
  imports: [
    ReactiveFormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatSlideToggleModule,
    MatCheckboxModule,
    Spinner,
  ],
  template: `
    <div class="head">
      <button mat-icon-button (click)="cancel()" aria-label="Quay lại">
        <mat-icon>arrow_back</mat-icon>
      </button>
      <h1>{{ campaignId() ? 'Sửa chiến dịch' : 'Tạo chiến dịch' }}</h1>
    </div>

    @if (loading()) {
      <app-spinner message="Đang tải..." />
    } @else {
      @if (readOnly()) {
        <mat-card class="notice">
          <mat-icon>lock</mat-icon>
          <span
            >Chiến dịch không ở trạng thái Nháp nên không thể chỉnh sửa tiêu chí/câu hỏi. Chỉ có thể
            xem.</span
          >
        </mat-card>
      }

      <form [formGroup]="form" (ngSubmit)="submit()">
        <mat-card class="section">
          <h2>Thông tin chung</h2>
          <mat-form-field appearance="outline" class="full">
            <mat-label>Tiêu đề *</mat-label>
            <input matInput formControlName="title" maxlength="200" />
          </mat-form-field>

          <mat-form-field appearance="outline" class="full">
            <mat-label>Lĩnh vực / vị trí</mat-label>
            <input matInput formControlName="domain" />
          </mat-form-field>

          <mat-form-field appearance="outline" class="full">
            <mat-label>Mô tả công việc (JD)</mat-label>
            <textarea matInput formControlName="jdText" rows="5"></textarea>
          </mat-form-field>

          <div class="two">
            <mat-form-field appearance="outline">
              <mat-label>Số ứng viên tối đa</mat-label>
              <input matInput type="number" formControlName="maxCandidates" min="1" />
            </mat-form-field>
            <mat-form-field appearance="outline">
              <mat-label>Thời gian mỗi câu (phút) *</mat-label>
              <input matInput type="number" formControlName="timeLimitMinutes" min="1" />
            </mat-form-field>
          </div>

          <div class="two">
            <mat-form-field appearance="outline">
              <mat-label>Điểm đạt (%)</mat-label>
              <input matInput type="number" formControlName="passScorePct" min="0" max="100" />
            </mat-form-field>
          </div>

          <div class="two">
            <mat-form-field appearance="outline">
              <mat-label>Bắt đầu</mat-label>
              <input matInput type="datetime-local" formControlName="startsAt" />
            </mat-form-field>
            <mat-form-field appearance="outline">
              <mat-label>Kết thúc</mat-label>
              <input matInput type="datetime-local" formControlName="expiresAt" />
            </mat-form-field>
          </div>

          <div class="toggles">
            <mat-slide-toggle formControlName="antiCheatEnabled">Bật chống gian lận</mat-slide-toggle>
            <mat-slide-toggle formControlName="faceVerifyEnabled"
              >Bật xác thực khuôn mặt</mat-slide-toggle
            >
          </div>
        </mat-card>

        <mat-card class="section">
          <div class="section-head">
            <h2>Tiêu chí đánh giá</h2>
            <div class="w-total" [class.bad]="criteria.length > 0 && !weightOk()">
              Σ trọng số: {{ totalWeight().toFixed(2) }}
            </div>
          </div>
          <p class="hint">Tổng trọng số nên xấp xỉ 1.00 (backend chuẩn hoá về 1).</p>

          <div formArrayName="criteria">
            @for (g of criteria.controls; track $index; let i = $index) {
              <div class="crit-row" [formGroupName]="i">
                <mat-form-field appearance="outline" class="c-name">
                  <mat-label>Tên tiêu chí *</mat-label>
                  <input matInput formControlName="name" />
                </mat-form-field>
                <mat-form-field appearance="outline" class="c-num">
                  <mat-label>Trọng số</mat-label>
                  <input matInput type="number" formControlName="weight" step="0.05" min="0" />
                </mat-form-field>
                <mat-form-field appearance="outline" class="c-num">
                  <mat-label>Điểm tối đa</mat-label>
                  <input matInput type="number" formControlName="maxScore" min="1" />
                </mat-form-field>
                <mat-form-field appearance="outline" class="c-desc">
                  <mat-label>Mô tả</mat-label>
                  <input matInput formControlName="description" />
                </mat-form-field>
                <button
                  mat-icon-button
                  type="button"
                  (click)="removeCriterion(i)"
                  aria-label="Xoá tiêu chí"
                >
                  <mat-icon>delete</mat-icon>
                </button>
              </div>
            }
          </div>
          <button mat-stroked-button type="button" (click)="addCriterion()">
            <mat-icon>add</mat-icon>
            Thêm tiêu chí
          </button>
        </mat-card>

        <mat-card class="section">
          <h2>Câu hỏi phỏng vấn *</h2>
          <p class="hint">Cần ít nhất 1 câu hỏi.</p>

          <div formArrayName="questions">
            @for (g of questions.controls; track $index; let i = $index) {
              <div class="q-row" [formGroupName]="i">
                <mat-form-field appearance="outline" class="q-text">
                  <mat-label>Câu hỏi #{{ i + 1 }} *</mat-label>
                  <textarea matInput formControlName="questionText" rows="2"></textarea>
                </mat-form-field>
                <mat-checkbox formControlName="isRequired">Bắt buộc</mat-checkbox>
                <button
                  mat-icon-button
                  type="button"
                  (click)="removeQuestion(i)"
                  aria-label="Xoá câu hỏi"
                >
                  <mat-icon>delete</mat-icon>
                </button>
              </div>
            }
          </div>
          <button mat-stroked-button type="button" (click)="addQuestion()">
            <mat-icon>add</mat-icon>
            Thêm câu hỏi
          </button>
        </mat-card>

        <div class="actions">
          <button mat-button type="button" (click)="cancel()">Huỷ</button>
          <button
            mat-flat-button
            color="primary"
            type="submit"
            [disabled]="saving() || readOnly()"
          >
            @if (saving()) {
              <mat-icon class="spin">progress_activity</mat-icon>
            }
            {{ campaignId() ? 'Lưu thay đổi' : 'Tạo chiến dịch' }}
          </button>
        </div>
      </form>
    }
  `,
  styles: [
    `
      .head {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 16px;
      }
      h1 {
        margin: 0;
      }
      h2 {
        margin: 0 0 12px;
        font-size: 18px;
      }
      .section {
        padding: 20px;
        margin-bottom: 16px;
      }
      .section-head {
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      .notice {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 14px 20px;
        margin-bottom: 16px;
        background: var(--mat-sys-tertiary-container);
        color: var(--mat-sys-on-tertiary-container);
      }
      .full {
        width: 100%;
      }
      .two {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: 12px;
      }
      .toggles {
        display: flex;
        gap: 24px;
        flex-wrap: wrap;
        margin-top: 8px;
      }
      .hint {
        color: var(--mat-sys-on-surface-variant);
        font-size: 13px;
        margin: 0 0 12px;
      }
      .w-total {
        font-weight: 600;
      }
      .w-total.bad {
        color: var(--mat-sys-error);
      }
      .crit-row {
        display: flex;
        gap: 8px;
        align-items: flex-start;
        flex-wrap: wrap;
      }
      .c-name {
        flex: 2;
        min-width: 160px;
      }
      .c-num {
        flex: 1;
        min-width: 90px;
      }
      .c-desc {
        flex: 2;
        min-width: 160px;
      }
      .q-row {
        display: flex;
        gap: 12px;
        align-items: flex-start;
      }
      .q-text {
        flex: 1;
      }
      .actions {
        display: flex;
        justify-content: flex-end;
        gap: 12px;
        margin-top: 8px;
      }
      .spin {
        animation: spin 1s linear infinite;
      }
      @keyframes spin {
        to {
          transform: rotate(360deg);
        }
      }
    `,
  ],
})
export class CampaignForm implements OnInit {
  private fb = inject(FormBuilder);
  private api = inject(CampaignApi);
  private notify = inject(NotifyService);
  private router = inject(Router);

  /** Có param → chế độ sửa. */
  readonly campaignId = input<string>();

  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly readOnly = signal(false);
  private original = signal<CampaignResponse | null>(null);

  readonly form = this.fb.group({
    title: ['', [Validators.required]],
    domain: [''],
    jdText: [''],
    maxCandidates: [null as number | null],
    timeLimitMinutes: [15 as number | null, [Validators.required, Validators.min(1)]],
    passScorePct: [null as number | null],
    startsAt: [''],
    expiresAt: [''],
    antiCheatEnabled: [false],
    faceVerifyEnabled: [false],
    criteria: this.fb.array<FormGroup>([]),
    questions: this.fb.array<FormGroup>([]),
  });

  get criteria(): FormArray<FormGroup> {
    return this.form.get('criteria') as FormArray<FormGroup>;
  }
  get questions(): FormArray<FormGroup> {
    return this.form.get('questions') as FormArray<FormGroup>;
  }

  ngOnInit(): void {
    const id = this.campaignId();
    if (!id) {
      // Tạo mới — mặc định 1 câu hỏi + startsAt = bây giờ + 5 phút để tránh 400 "quá khứ".
      const start = new Date(Date.now() + 5 * 60000);
      const end = new Date(Date.now() + 7 * 24 * 60 * 60000);
      this.form.patchValue({
        startsAt: toLocalInput(start.toISOString()),
        expiresAt: toLocalInput(end.toISOString()),
      });
      this.addQuestion();
      return;
    }

    this.loading.set(true);
    this.api.getCampaign(id).subscribe({
      next: (c) => {
        this.original.set(c);
        this.hydrate(c);
        this.readOnly.set(c.status !== 'Draft');
        if (this.readOnly()) this.form.disable();
        this.loading.set(false);
      },
      error: (e: HttpErrorResponse) => {
        this.loading.set(false);
        this.notify.error(extractErrorMessage(e) ?? 'Không tải được chiến dịch.');
        this.router.navigate(['/employer/campaigns']);
      },
    });
  }

  private hydrate(c: CampaignResponse): void {
    this.form.patchValue({
      title: c.title,
      domain: c.domain ?? '',
      jdText: c.jdText ?? '',
      maxCandidates: c.maxCandidates ?? null,
      timeLimitMinutes: c.timeLimitMinutes ?? 15,
      passScorePct: c.passScorePct ?? null,
      startsAt: toLocalInput(c.startsAt),
      expiresAt: toLocalInput(c.expiresAt),
      antiCheatEnabled: c.antiCheatEnabled,
      faceVerifyEnabled: c.faceVerifyEnabled,
    });
    this.criteria.clear();
    c.criteria.forEach((cr) =>
      this.criteria.push(this.critRow(cr.name, cr.weight, cr.maxScore, cr.description ?? '')),
    );
    this.questions.clear();
    c.questions.forEach((q) => this.questions.push(this.questionRow(q.questionText, q.isRequired)));
    if (this.questions.length === 0) this.addQuestion();
  }

  // ── Criteria ───────────────────────────────────────────────────────────────
  private critRow(name = '', weight = 0.25, maxScore = 10, description = ''): FormGroup {
    return this.fb.group({
      name: [name, [Validators.required]],
      weight: [weight, [Validators.required, Validators.min(0)]],
      maxScore: [maxScore, [Validators.required, Validators.min(1)]],
      description: [description],
    });
  }
  addCriterion(): void {
    this.criteria.push(this.critRow());
  }
  removeCriterion(i: number): void {
    this.criteria.removeAt(i);
  }
  totalWeight(): number {
    return this.criteria.controls.reduce((s, g) => s + Number(g.get('weight')?.value || 0), 0);
  }
  weightOk(): boolean {
    const t = this.totalWeight();
    return t >= 0.99 && t <= 1.01;
  }

  // ── Questions ────────────────────────────────────────────────────────────────
  private questionRow(questionText = '', isRequired = true): FormGroup {
    return this.fb.group({
      questionText: [questionText, [Validators.required]],
      isRequired: [isRequired],
    });
  }
  addQuestion(): void {
    this.questions.push(this.questionRow());
  }
  removeQuestion(i: number): void {
    this.questions.removeAt(i);
  }

  // ── Submit ───────────────────────────────────────────────────────────────────
  private buildCriteria(): CriterionItem[] {
    return this.criteria.controls.map((g) => ({
      name: g.get('name')!.value,
      weight: Number(g.get('weight')!.value),
      maxScore: Number(g.get('maxScore')!.value),
      description: g.get('description')!.value || null,
    }));
  }
  private buildQuestions(): QuestionItem[] {
    return this.questions.controls.map((g) => ({
      questionText: g.get('questionText')!.value,
      source: 'CustomHr' as const,
      isRequired: !!g.get('isRequired')!.value,
    }));
  }

  submit(): void {
    if (this.readOnly()) {
      this.notify.warn('Chiến dịch đã xuất bản — không thể sửa.');
      return;
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.notify.warn('Vui lòng điền đủ các trường bắt buộc.');
      return;
    }
    if (this.questions.length === 0) {
      this.notify.warn('Cần ít nhất 1 câu hỏi.');
      return;
    }
    if (this.criteria.length > 0 && !this.weightOk()) {
      this.notify.warn(`Tổng trọng số tiêu chí phải ≈ 1 (hiện tại ${this.totalWeight().toFixed(2)}).`);
      return;
    }

    const v = this.form.getRawValue();
    const criteria = this.buildCriteria();
    this.saving.set(true);

    const id = this.campaignId();
    if (!id) {
      const body: CreateCampaignRequest = {
        title: v.title!,
        domain: v.domain || null,
        jdText: v.jdText || null,
        maxCandidates: v.maxCandidates ?? null,
        timeLimitMinutes: v.timeLimitMinutes ?? null,
        passScorePct: v.passScorePct ?? null,
        antiCheatEnabled: !!v.antiCheatEnabled,
        faceVerifyEnabled: !!v.faceVerifyEnabled,
        startsAt: toIso(v.startsAt),
        expiresAt: toIso(v.expiresAt),
        criteria: criteria.length ? criteria : undefined,
        questions: this.buildQuestions(),
      };
      this.api.createCampaign(body).subscribe({
        next: (c) => {
          this.saving.set(false);
          this.notify.success('Đã tạo chiến dịch.');
          this.router.navigate(['/employer/campaigns', c.id]);
        },
        error: (e: HttpErrorResponse) => {
          this.saving.set(false);
          this.notify.error(extractErrorMessage(e) ?? 'Tạo chiến dịch thất bại.');
        },
      });
      return;
    }

    // Sửa: cập nhật metadata trước, câu hỏi sau.
    const body: UpdateCampaignRequest = {
      title: v.title!,
      domain: v.domain || null,
      jdText: v.jdText || null,
      maxCandidates: v.maxCandidates ?? null,
      timeLimitMinutes: v.timeLimitMinutes ?? null,
      passScorePct: v.passScorePct ?? null,
      antiCheatEnabled: !!v.antiCheatEnabled,
      faceVerifyEnabled: !!v.faceVerifyEnabled,
      startsAt: toIso(v.startsAt),
      expiresAt: toIso(v.expiresAt),
      criteria: criteria.length ? criteria : undefined,
    };
    this.api.updateCampaign(id, body).subscribe({
      next: () => {
        this.api.updateQuestions(id, this.buildQuestions()).subscribe({
          next: () => {
            this.saving.set(false);
            this.notify.success('Đã lưu thay đổi.');
            this.router.navigate(['/employer/campaigns', id]);
          },
          error: (e: HttpErrorResponse) => {
            this.saving.set(false);
            this.notify.error(extractErrorMessage(e) ?? 'Lưu câu hỏi thất bại.');
          },
        });
      },
      error: (e: HttpErrorResponse) => {
        this.saving.set(false);
        this.notify.error(extractErrorMessage(e) ?? 'Lưu thay đổi thất bại.');
      },
    });
  }

  cancel(): void {
    const id = this.campaignId();
    if (id) this.router.navigate(['/employer/campaigns', id]);
    else this.router.navigate(['/employer/campaigns']);
  }
}
