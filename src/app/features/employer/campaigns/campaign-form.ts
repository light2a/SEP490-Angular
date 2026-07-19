import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
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
  JD_TEXT_MAX_CHARS,
  QuestionItem,
  QuestionSource,
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
            <!-- maxlength + bộ đếm: cho HR thấy giới hạn TRƯỚC khi gửi, thay vì ăn 400 từ BE
                 (BE mới là nơi enforce thật — xem TextInputLimits.JdTextMaxChars). -->
            <textarea
              matInput
              formControlName="jdText"
              rows="5"
              [maxlength]="jdTextMaxChars"
            ></textarea>
            <mat-hint align="end">{{ jdTextLength() }} / {{ jdTextMaxChars }}</mat-hint>
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
            <mat-slide-toggle formControlName="adaptiveEnabled"
              >Bật phỏng vấn thích ứng</mat-slide-toggle
            >
          </div>

          @if (form.controls.adaptiveEnabled.value) {
            <p class="hint-adaptive">
              Mọi ứng viên vẫn nhận đủ bộ câu hỏi bạn đã soạn. Sau khi trả lời hết, AI hỏi thêm vài
              câu bám theo câu trả lời của từng người — vẫn chấm theo đúng tiêu chí của chiến dịch.
            </p>
            <div class="two">
              <mat-form-field appearance="outline">
                <mat-label>Số câu AI hỏi thêm tối đa</mat-label>
                <input matInput type="number" min="0" formControlName="maxFollowUps" />
                <mat-hint>Để trống = dùng mặc định hệ thống</mat-hint>
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>Tổng số câu tối đa</mat-label>
                <input matInput type="number" min="0" formControlName="maxQuestions" />
                <mat-hint>Gồm cả câu bạn soạn + câu AI hỏi thêm</mat-hint>
              </mat-form-field>
            </div>
          }
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
                <!-- F10: nguồn gốc câu hỏi do BE giữ — HR thấy được câu nào AI sinh (F9). -->
                @if (questionSource(i) === 'AiGenerated') {
                  <span class="q-src" title="Câu hỏi do AI sinh từ JD">AI sinh</span>
                }
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
      .hint-adaptive {
        color: var(--mat-sys-on-surface-variant);
        font-size: 13px;
        background: var(--mat-sys-surface-container);
        border-radius: 8px;
        padding: 10px 12px;
        margin: 12px 0;
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
      /* F10 — nhãn "AI sinh" (F9). */
      .q-src {
        flex: none;
        margin-top: 18px;
        padding: 2px 8px;
        border-radius: 10px;
        background: #ede7f6;
        color: #4527a0;
        font-size: 12px;
        white-space: nowrap;
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

  /** Giới hạn ký tự JD nhập tay — khớp hằng số BE (vượt → 400). */
  readonly jdTextMaxChars = JD_TEXT_MAX_CHARS;

  /** Độ dài JD hiện tại cho bộ đếm dưới textarea (theo dõi cả patchValue lúc load bản nháp). */
  readonly jdTextLength = signal(0);

  readonly form = this.fb.group({
    title: ['', [Validators.required]],
    domain: [''],
    jdText: ['', [Validators.maxLength(JD_TEXT_MAX_CHARS)]],
    maxCandidates: [null as number | null],
    timeLimitMinutes: [15 as number | null, [Validators.required, Validators.min(1)]],
    passScorePct: [null as number | null],
    startsAt: [''],
    expiresAt: [''],
    antiCheatEnabled: [false],
    faceVerifyEnabled: [false],
    // INT-17: phỏng vấn thích ứng — AI hỏi thêm ở ĐUÔI sau khi ứng viên trả lời hết câu seed.
    // Trần để trống = dùng mặc định phía backend. form.disable() (ngoài Draft) tự cascade xuống.
    adaptiveEnabled: [false],
    maxFollowUps: [null as number | null, [Validators.min(0)]],
    maxQuestions: [null as number | null, [Validators.min(0)]],
    criteria: this.fb.array<FormGroup>([]),
    questions: this.fb.array<FormGroup>([]),
  });

  constructor() {
    // Đồng bộ bộ đếm ký tự với control (bắt cả gõ tay lẫn patchValue khi load campaign để sửa).
    this.form.controls.jdText.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((v) => this.jdTextLength.set(v?.length ?? 0));
  }

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
      adaptiveEnabled: c.adaptiveEnabled,   // INT-17
      maxFollowUps: c.maxFollowUps ?? null,
      maxQuestions: c.maxQuestions ?? null,
    });
    this.criteria.clear();
    c.criteria.forEach((cr) =>
      this.criteria.push(this.critRow(cr.name, cr.weight, cr.maxScore, cr.description ?? '')),
    );
    this.questions.clear();
    // F10 — mang theo id + source của câu đang có; thiếu id thì lần Lưu kế sẽ xoá-và-tạo-lại.
    c.questions.forEach((q) =>
      this.questions.push(this.questionRow(q.questionText, q.isRequired, q.id, q.source)),
    );
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
  // F10 — id + source đi kèm mỗi dòng câu hỏi (không hiện trên form, nhưng phải sống sót qua
  // vòng đọc→sửa→lưu): id để BE sửa đúng row, source để badge hiển thị câu nào do AI sinh.
  private questionRow(
    questionText = '',
    isRequired = true,
    id: string | null = null,
    source: QuestionSource | null = null,
  ): FormGroup {
    return this.fb.group({
      id: [id],
      source: [source],
      questionText: [questionText, [Validators.required]],
      isRequired: [isRequired],
    });
  }

  /** F10 — nhãn nguồn để HR phân biệt câu AI sinh (F9) với câu mình gõ. Câu mới → chưa có nguồn. */
  questionSource(i: number): QuestionSource | null {
    return this.questions.at(i).get('source')!.value ?? null;
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
    return this.questions.controls.map((g) => {
      const id: string | null = g.get('id')!.value;
      return {
        // F10 — echo id để BE sửa TẠI CHỖ. Trước F10 chỗ này gửi `source:'CustomHr'` cứng và
        // không gửi id ⇒ mỗi lần Lưu là BE xoá sạch rồi tạo lại: câu do AI sinh mất nhãn
        // `AiGenerated` và đổi id. `source` nay không gửi — nguồn gốc do BE giữ.
        ...(id ? { id } : {}),
        questionText: g.get('questionText')!.value,
        isRequired: !!g.get('isRequired')!.value,
      };
    });
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
        adaptiveEnabled: !!v.adaptiveEnabled,   // INT-17
        maxFollowUps: v.maxFollowUps ?? null,
        maxQuestions: v.maxQuestions ?? null,
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
      adaptiveEnabled: !!v.adaptiveEnabled,   // INT-17
      maxFollowUps: v.maxFollowUps ?? null,
      maxQuestions: v.maxQuestions ?? null,
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
