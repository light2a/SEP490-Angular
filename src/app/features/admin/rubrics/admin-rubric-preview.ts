import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, effect, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { AdminRubricApi } from '../../../core/api/admin-rubric.api';
import { extractErrorMessage } from '../../../core/api/http-utils';
import { NotifyService } from '../../../core/notify.service';
import {
  AdminRubricPreviewRun,
  JobCategory,
  RubricLanguage,
  RunAdminRubricPreviewRequest,
  SampleQuestion,
} from '../../../core/models';
import { RubricScaleStrip, ScalePoint } from '../../../shared/rubric/rubric-scale-strip';

/**
 * Trần cứng lượt chấm thử của một phiên bản. Chỉ dùng khi CHƯA có lượt nào để đọc
 * `freeRunsRemaining` — sau lượt đầu thì con số thật luôn đến từ backend.
 */
export const DEFAULT_FREE_RUNS = 5;

const BAND_LABEL: Record<string, string> = {
  Weak: 'Yếu',
  Good: 'Khá',
  Excellent: 'Xuất sắc',
  Custom: 'Bài bạn dán',
};

/**
 * CHẤM THỬ BỘ CHUẨN — AI viết 3 bài mẫu (yếu / khá / xuất sắc) rồi **chấm thật** cả 3 bằng đúng bộ
 * chấm dùng cho người luyện.
 *
 * Thứ tự đọc là **HÌNH TRƯỚC, SỐ SAU** — giữ nguyên luật của bản dành cho nhà tuyển dụng: `Δ = 0`
 * mà ba chấm chồng nhau là hỏng NẶNG (thước đo không tách được ai với ai), còn `Δ = ±1` mà ba chấm
 * trải đều lại là khoẻ. Đọc số trước sẽ dẫn tới kết luận ngược.
 *
 * KHÔNG tái dùng nguyên panel của nhà tuyển dụng: panel đó gắn chặt `CampaignApi`, hạn mức theo
 * chiến dịch và việc trừ credit ví tổ chức — ba thứ admin đều không có. Phần dùng chung thật sự là
 * `RubricScaleStrip` (đã chuyển sang `shared/rubric`).
 */
@Component({
  selector: 'app-admin-rubric-preview',
  imports: [
    DatePipe,
    FormsModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
    MatSelectModule,
    MatTooltipModule,
    RubricScaleStrip,
  ],
  template: `
    <mat-card class="section">
      <div class="head">
        <div>
          <h2>Chấm thử bộ chuẩn</h2>
          <p class="hint">
            AI viết 3 câu trả lời mẫu cho một câu hỏi rồi <strong>chấm thật</strong> cả 3 bằng đúng
            bộ chấm của người luyện. Xem thước đo có tách được ba mức không, trước khi nó áp cho
            mọi người.
          </p>
        </div>
        <span class="quota" [class.out]="outOfQuota()" data-testid="admin-quota-chip">
          <mat-icon>science</mat-icon>
          @if (outOfQuota()) {
            Hết lượt cho phiên bản này
          } @else {
            Còn {{ freeLeft() }} lượt cho phiên bản {{ rubricVersion() }}
          }
        </span>
      </div>

      @if (sampleQuestions().length > 0) {
        <mat-form-field appearance="outline" class="full">
          <mat-label>Câu hỏi gợi ý</mat-label>
          <mat-select
            [value]="selectedSampleId()"
            (valueChange)="pickSample($event)"
            [disabled]="running()"
            data-testid="sample-select"
          >
            @for (q of sampleQuestions(); track q.id) {
              <mat-option [value]="q.id">{{ q.text }}</mat-option>
            }
          </mat-select>
          <mat-hint>
            Câu gợi ý cố ý không lấy từ buổi luyện thật — câu thật sinh từ CV/JD của người dùng nên
            chứa tên công ty, dự án của họ.
          </mat-hint>
        </mat-form-field>
      }

      <!--
        Chọn câu gợi ý và tự gõ LOẠI TRỪ nhau **về cấu trúc**: chọn thì xoá ô gõ, gõ thì bỏ chọn.
        Để cả hai cùng có giá trị là đẩy việc chọn hộ sang backend, mà lựa chọn đó quyết định bài
        mẫu được viết cho câu nào.
      -->
      <mat-form-field appearance="outline" class="full">
        <mat-label>Hoặc tự gõ câu hỏi</mat-label>
        <textarea
          matInput
          rows="2"
          [ngModel]="question()"
          (ngModelChange)="typeQuestion($event)"
          [disabled]="running()"
          data-testid="own-question"
        ></textarea>
      </mat-form-field>

      <div class="run-row">
        <button
          mat-flat-button
          color="primary"
          type="button"
          [disabled]="!canRun()"
          [matTooltip]="blockedReason()"
          (click)="run()"
          data-testid="run-admin-preview"
        >
          <mat-icon>play_arrow</mat-icon>
          {{ running() ? 'Đang chấm thử…' : 'Chấm thử' }}
        </button>
      </div>

      @if (running()) {
        <div class="waiting" data-testid="admin-preview-waiting">
          <mat-progress-bar mode="indeterminate" />
          <p class="hint">Đang viết và chấm 3 bài mẫu — thường mất 20–40 giây.</p>
        </div>
      }

      @if (error(); as e) {
        <p class="err" data-testid="admin-preview-error">{{ e }}</p>
      }

      @if (current(); as run) {
        <div class="result" data-testid="admin-preview-result">
          <!-- ① HÌNH -->
          <h3>Thước đo có tách được ba mức không?</h3>
          <p class="legend">
            <span class="dot filled"></span> điểm thật &nbsp;
            <span class="dot hollow"></span> mức kỳ vọng
          </p>
          @for (c of run.rubric; track c.criterionId) {
            <app-rubric-scale-strip
              [criterionName]="c.name"
              [weight]="c.weight"
              [maxScore]="c.maxScore"
              [levels]="c.levels"
              [points]="pointsFor(run, c.criterionId)"
            />
          }

          <!-- ② SỐ -->
          <div class="cols">
            @for (s of run.samples; track s.band) {
              <mat-card class="col">
                <div class="col-head">
                  <span class="band">{{ bandLabel(s.band) }}</span>
                  <strong class="tot">Tổng {{ round(s.actualWeightedPct) }}%</strong>
                </div>
                <p class="sub">
                  Kỳ vọng {{ round(s.expectedWeightedPct) }}% → Thật
                  {{ round(s.actualWeightedPct) }}% · {{ s.wordCount }} từ
                </p>
                <details>
                  <summary>Xem bài mẫu</summary>
                  <p class="answer">{{ s.answerText }}</p>
                </details>
                <table class="crit-tbl">
                  <tbody>
                    @for (sc of s.scores; track sc.criterionId) {
                      <tr>
                        <td class="c-nm">{{ sc.criterionName }}</td>
                        <td class="c-num">{{ sc.expectedLevel }}</td>
                        <td class="c-num">
                          <strong>{{ sc.actualScore }}</strong
                          >/{{ sc.maxScore }}
                        </td>
                        <td class="c-why">{{ sc.reasoning || '—' }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              </mat-card>
            }
          </div>

          @if (run.lengthParityWarning) {
            <p class="warn-band" data-testid="admin-length-warn">
              Ba bài mẫu lệch nhau khá nhiều về số từ. Khi đó dải điểm đẹp có thể chỉ phản ánh
              <strong>độ dài</strong> chứ không phải thước đo phân biệt được nội dung.
            </p>
          }

          <!-- ③ Băng cảnh báo LUÔN hiện: hai giới hạn này không giấu được, kể cả khi số đẹp. -->
          <p class="warn-band always" data-testid="admin-preview-caveat">
            Bài mẫu là <strong>văn bản</strong> nên hệ thống không có số đo cách nói (tốc độ, khoảng
            lặng, từ đệm) — điểm thật của người luyện có ghi âm sẽ khác. Bài mẫu cũng do
            <strong>chính AI chấm điểm</strong> viết ra.
          </p>

          <p class="meta">
            Phiên bản {{ run.rubricVersion }} · dấu vân tay
            <span class="mono" [matTooltip]="run.rubricFingerprint">{{
              short(run.rubricFingerprint)
            }}</span>
            @if (run.promptVersion != null) {
              · prompt v{{ run.promptVersion }}
            }
            · {{ run.createdAt | date: 'short' }}
          </p>
        </div>
      }

      @if (history().length > 0) {
        <details class="history">
          <summary>Lịch sử chấm thử ({{ history().length }})</summary>
          <ul>
            @for (r of history(); track r.id) {
              <li>
                <button mat-button type="button" (click)="select(r)">
                  {{ r.createdAt | date: 'short' }}
                </button>
                <span class="st" [class.bad]="r.status === 'Failed'">{{
                  statusLabel(r.status)
                }}</span>
                <span class="mono">v{{ r.rubricVersion }}</span>
                @if (current(); as cur) {
                  @if (r.id !== cur.id) {
                    <span class="cmp" [class.same]="sameRuler(r, cur)">
                      {{ sameRuler(r, cur) ? 'cùng thước đo' : 'khác thước đo' }}
                    </span>
                  }
                }
              </li>
            }
          </ul>
        </details>
      }
    </mat-card>
  `,
  styles: [
    `
      .section {
        padding: 20px;
        margin-top: 16px;
      }
      .head {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 12px;
        flex-wrap: wrap;
      }
      h2 {
        margin: 0 0 4px;
        font-size: 18px;
      }
      h3 {
        margin: 12px 0 4px;
        font-size: 15px;
      }
      .hint {
        color: var(--mat-sys-on-surface-variant);
        font-size: 13px;
        margin: 0 0 12px;
        max-width: 70ch;
      }
      .quota {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 4px 10px;
        border-radius: 12px;
        font-size: 12px;
        white-space: nowrap;
        background: var(--mat-sys-tertiary-container);
        color: var(--mat-sys-on-tertiary-container);
      }
      .quota.out {
        background: var(--mat-sys-error-container);
        color: var(--mat-sys-on-error-container);
      }
      .quota mat-icon {
        font-size: 16px;
        width: 16px;
        height: 16px;
      }
      .samples {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
        margin-bottom: 10px;
      }
      .lbl {
        font-size: 12px;
        color: var(--mat-sys-on-surface-variant);
      }
      .full {
        width: 100%;
      }
      .run-row {
        margin-bottom: 8px;
      }
      .err {
        padding: 8px 12px;
        border-radius: 8px;
        background: var(--mat-sys-error-container);
        color: var(--mat-sys-on-error-container);
        font-size: 13px;
      }
      .legend {
        font-size: 12px;
        color: var(--mat-sys-on-surface-variant);
      }
      .dot {
        display: inline-block;
        width: 10px;
        height: 10px;
        border-radius: 50%;
        border: 2px solid var(--mat-sys-on-surface-variant);
        vertical-align: middle;
      }
      .dot.filled {
        background: var(--mat-sys-on-surface-variant);
      }
      .cols {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
        gap: 12px;
        margin-top: 8px;
      }
      .col {
        padding: 12px;
      }
      .col-head {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
      }
      .band {
        font-weight: 600;
      }
      .sub {
        margin: 2px 0 8px;
        font-size: 12px;
        color: var(--mat-sys-on-surface-variant);
      }
      .answer {
        white-space: pre-wrap;
        font-size: 13px;
        margin: 6px 0 0;
      }
      .crit-tbl {
        width: 100%;
        border-collapse: collapse;
        margin-top: 8px;
        font-size: 12px;
      }
      .crit-tbl td {
        padding: 4px 6px;
        vertical-align: top;
      }
      .c-num {
        text-align: right;
        white-space: nowrap;
      }
      .c-why {
        color: var(--mat-sys-on-surface-variant);
      }
      .warn-band {
        margin: 12px 0 0;
        padding: 10px 12px;
        border-radius: 8px;
        font-size: 12px;
        background: var(--mat-sys-surface-container);
        color: var(--mat-sys-on-surface-variant);
      }
      .warn-band.always {
        background: var(--mat-sys-tertiary-container);
        color: var(--mat-sys-on-tertiary-container);
      }
      .meta {
        font-size: 12px;
        color: var(--mat-sys-on-surface-variant);
      }
      .mono {
        font-family: monospace;
      }
      .history ul {
        margin: 6px 0 0;
        padding-left: 12px;
        list-style: none;
      }
      .history li {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
        font-size: 12px;
      }
      .st {
        padding: 1px 8px;
        border-radius: 8px;
        background: var(--mat-sys-surface-variant);
      }
      .st.bad {
        background: var(--mat-sys-error-container);
        color: var(--mat-sys-on-error-container);
      }
      .cmp {
        padding: 1px 8px;
        border-radius: 8px;
        background: var(--mat-sys-error-container);
        color: var(--mat-sys-on-error-container);
      }
      .cmp.same {
        background: var(--mat-sys-primary-container);
        color: var(--mat-sys-on-primary-container);
      }
    `,
  ],
})
export class AdminRubricPreview {
  private api = inject(AdminRubricApi);
  private notify = inject(NotifyService);

  readonly jobCategory = input.required<JobCategory>();
  readonly language = input.required<RubricLanguage>();
  readonly rubricVersion = input<number | null>(null);
  /**
   * Bộ chuẩn đang sửa dở. Backend chấm trên bộ **ĐÃ LƯU**, nên chạy lúc này là kiểm chứng một
   * thước đo khác với thứ admin đang nhìn trên màn.
   */
  readonly dirty = input(false);
  /**
   * Câu hỏi gợi ý do BACKEND cấp (`SystemRubricResponse.sampleQuestions`), đúng nghề + ngôn ngữ
   * đang xem. KHÔNG có bản dự phòng phía client: một bản sao thứ hai nghĩa là sửa câu ở backend mà
   * màn vẫn hiện câu cũ, và không gì báo. Rỗng ⇒ chỉ còn đường tự gõ, vẫn dùng được.
   */
  readonly sampleQuestions = input<SampleQuestion[]>([]);


  /** Câu mẫu đang chọn; `null` = admin đang dùng ô tự gõ. Hai thứ loại trừ nhau. */
  readonly selectedSampleId = signal<string | null>(null);
  readonly question = signal('');

  readonly history = signal<AdminRubricPreviewRun[]>([]);
  readonly current = signal<AdminRubricPreviewRun | null>(null);
  readonly running = signal(false);
  readonly error = signal<string | null>(null);
  /** Hết trần: giữ riêng vì đó là trạng thái BÌNH THƯỜNG (sửa mốc rồi lưu là có lượt mới), không phải lỗi. */
  readonly quotaExhausted = signal(false);

  constructor() {
    // Đổi ô (nghề, ngôn ngữ) → lịch sử của ô cũ không còn liên quan gì tới bộ đang xem.
    effect(() => {
      const job = this.jobCategory();
      const lang = this.language();
      this.current.set(null);
      this.error.set(null);
      this.quotaExhausted.set(false);
      this.selectedSampleId.set(null);
      this.question.set('');
      this.loadHistory(job, lang);
    });
  }

  private loadHistory(job: JobCategory, lang: RubricLanguage): void {
    this.api.previewRuns(job, lang).subscribe({
      next: (runs) => {
        this.history.set(runs ?? []);
        this.current.set((runs ?? []).find((r) => r.status === 'Succeeded') ?? null);
      },
      // Không có lịch sử chỉ mất phần so sánh, không chặn việc chấm thử → im lặng.
      error: () => this.history.set([]),
    });
  }

  /** Chọn câu mẫu ⇒ bỏ ô tự gõ, để payload chỉ có thể mang MỘT trong hai. */
  pickSample(id: string | null): void {
    this.selectedSampleId.set(id || null);
    if (id) this.question.set('');
  }

  /** Gõ câu riêng ⇒ bỏ câu mẫu đang chọn (chiều ngược lại của cùng một luật). */
  typeQuestion(text: string): void {
    this.question.set(text);
    if (text.trim()) this.selectedSampleId.set(null);
  }

  /**
   * Thân request — **đúng một** trong hai trường. Ưu tiên câu mẫu vì nó chỉ được đặt bởi thao tác
   * chọn tường minh, còn ô gõ có thể còn sót chữ từ lần trước.
   */
  buildBody(): RunAdminRubricPreviewRequest | null {
    const id = this.selectedSampleId();
    if (id) return { sampleQuestionId: id };
    const q = this.question().trim();
    return q ? { question: q } : null;
  }

  /**
   * Lượt miễn phí còn lại của đúng phiên bản đang xem.
   *
   * Đọc từ lượt chạy GẦN NHẤT của phiên bản này (backend là nơi giữ hạn mức thật), chứ không tự
   * đếm số dòng lịch sử — đếm ở client sẽ lệch ngay khi backend đổi cách tính hoặc khi có lượt
   * hỏng không bị tính.
   */
  freeLeft(): number {
    const v = this.rubricVersion();
    const latest = this.history().find((r) => v == null || r.rubricVersion === v);
    return latest ? Math.max(0, latest.freeRunsRemaining) : DEFAULT_FREE_RUNS;
  }

  outOfQuota(): boolean {
    return this.quotaExhausted() || this.freeLeft() <= 0;
  }

  canRun(): boolean {
    return !this.running() && !!this.buildBody() && !this.dirty() && !this.outOfQuota();
  }

  blockedReason(): string {
    if (this.dirty()) return 'Lưu bộ chuẩn trước khi chấm thử — máy chủ chấm trên bản đã lưu.';
    if (!this.buildBody()) return 'Chọn câu gợi ý hoặc tự gõ một câu hỏi để chấm thử.';
    if (this.outOfQuota())
      return 'Hết lượt cho phiên bản này — sửa mốc rồi lưu thì có lượt mới.';
    return '';
  }

  run(): void {
    if (!this.canRun()) {
      const why = this.blockedReason();
      if (why) this.notify.warn(why);
      return;
    }
    this.running.set(true);
    this.error.set(null);

    const body = this.buildBody()!;
    this.api
      .runPreview(this.jobCategory(), this.language(), body)
      .subscribe({
        next: (run) => {
          this.running.set(false);
          this.current.set(run);
          this.loadHistory(this.jobCategory(), this.language());
        },
        error: (e: HttpErrorResponse) => {
          this.running.set(false);
          this.fail(e);
        },
      });
  }

  /**
   * 429 KHÔNG phải lỗi hệ thống mà là hạn mức — nói đúng cách thoát ra. Gộp nó vào câu lỗi chung
   * ("thử lại sau ít phút") sẽ khiến admin bấm lại mãi mà không bao giờ hết trần.
   */
  private fail(e: HttpErrorResponse): void {
    if (e.status === 429) {
      this.quotaExhausted.set(true);
      this.error.set(
        'Đã dùng hết lượt chấm thử miễn phí cho phiên bản thước đo này — sửa mốc rồi lưu thì có lượt mới.',
      );
      return;
    }
    this.error.set(
      extractErrorMessage(e) ?? 'Không chạy được chấm thử. Vui lòng thử lại sau ít phút.',
    );
  }

  select(run: AdminRubricPreviewRun): void {
    if (run.status === 'Succeeded') this.current.set(run);
  }

  /** Chấm đặc = điểm thật, vòng rỗng = mức kỳ vọng — của mọi bài mẫu trên cùng một thang. */
  pointsFor(run: AdminRubricPreviewRun, criterionId: string): ScalePoint[] {
    const out: ScalePoint[] = [];
    for (const s of run.samples ?? []) {
      const sc = s.scores?.find((x) => x.criterionId === criterionId);
      if (!sc) continue;
      out.push({
        value: sc.expectedLevel,
        label: `${this.bandLabel(s.band)} — kỳ vọng`,
        kind: 'expected',
        band: s.band,
      });
      out.push({
        value: sc.actualScore,
        label: `${this.bandLabel(s.band)} — thật`,
        kind: 'actual',
        band: s.band,
      });
    }
    return out;
  }

  sameRuler(a: AdminRubricPreviewRun, b: AdminRubricPreviewRun): boolean {
    return (
      a.rubricFingerprint === b.rubricFingerprint &&
      a.rubricVersion === b.rubricVersion &&
      a.promptVersion === b.promptVersion
    );
  }

  bandLabel(band: string): string {
    return BAND_LABEL[band] ?? band;
  }
  statusLabel(s: string): string {
    return s === 'Succeeded' ? 'Xong' : s === 'Failed' ? 'Lỗi' : 'Đang chạy';
  }
  round(n: number): number {
    return Math.round(Number(n) * 10) / 10;
  }
  short(s: string): string {
    return s ? s.slice(0, 8) : '';
  }
}
