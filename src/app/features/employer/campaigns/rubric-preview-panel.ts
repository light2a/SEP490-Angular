import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { CampaignApi } from '../../../core/api/campaign.api';
import { extractErrorMessage } from '../../../core/api/http-utils';
import { NotifyService } from '../../../core/notify.service';
import {
  RubricPreviewBand,
  RubricPreviewRun,
  RubricPreviewSample,
} from '../../../core/models';
import { ConfirmDialog, ConfirmDialogData } from '../../../shared/ui/confirm-dialog';
import { RubricScaleStrip, ScalePoint } from './rubric-scale-strip';

/** Số lượt chấm thử **thành công** được miễn phí trên mỗi phiên bản thước đo. */
export const FREE_PREVIEW_RUNS = 3;

const BAND_LABEL: Record<string, string> = {
  Weak: 'Yếu',
  Good: 'Khá',
  Excellent: 'Xuất sắc',
  Custom: 'Bài bạn dán',
};

/** Câu hỏi để HR chọn chấm thử (chỉ cần id + nội dung). */
export interface PreviewQuestionOption {
  id: string;
  questionText: string;
}

/**
 * CHẤM THỬ THƯỚC ĐO — AI viết 3 bài mẫu (yếu/khá/xuất sắc) cho 1 câu hỏi rồi **chấm thật** cả 3
 * bằng đúng bộ chấm dùng cho ứng viên.
 *
 * Thứ tự đọc trên màn là **HÌNH TRƯỚC, SỐ SAU**, có lý do: `Δ = 0` mà ba chấm chồng nhau là hỏng
 * nặng (thước đo không tách được ai với ai), còn `Δ = ±1` mà ba chấm trải đều lại là khoẻ. Đọc số
 * trước sẽ dẫn tới kết luận ngược.
 */
@Component({
  selector: 'app-rubric-preview-panel',
  imports: [
    DatePipe,
    FormsModule,
    RouterLink,
    MatButtonModule,
    MatCardModule,
    MatChipsModule,
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
          <h2>Chấm thử thước đo</h2>
          <p class="hint">
            AI viết 3 câu trả lời mẫu (yếu / khá / xuất sắc) cho một câu hỏi rồi
            <strong>chấm thật</strong> cả 3 bằng đúng bộ chấm của ứng viên. Xem điểm có tách được
            ba mức không, trước khi phát link cho người thật.
          </p>
        </div>
        <!--
          Hạn mức đặt CẠNH NÚT chứ không phải toast: toast biến mất trước lúc HR quyết định bấm,
          mà đây là thông tin quyết định việc có tốn credit hay không.
        -->
        <span class="quota" [class.bill]="willBill()" data-testid="quota-chip">
          @if (willBill()) {
            <mat-icon>toll</mat-icon> Chấm thử · trừ 1 credit
          } @else {
            <mat-icon>redeem</mat-icon> Còn {{ freeLeft() }} lượt miễn phí
          }
        </span>
      </div>

      <div class="pick">
        <mat-form-field appearance="outline" class="q-pick">
          <mat-label>Chấm thử trên câu hỏi</mat-label>
          <mat-select [(ngModel)]="questionId" [disabled]="running()">
            @for (q of questions(); track q.id) {
              <mat-option [value]="q.id">{{ q.questionText }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <button
          mat-flat-button
          color="primary"
          type="button"
          [disabled]="!canRun()"
          [matTooltip]="runBlockedReason()"
          (click)="run()"
          data-testid="run-preview"
        >
          <mat-icon>science</mat-icon>
          {{ running() ? 'Đang chấm thử…' : 'Chấm thử' }}
        </button>
      </div>

      <mat-form-field appearance="outline" class="full">
        <mat-label>Bài thứ 4 — bạn tự dán (tuỳ chọn)</mat-label>
        <textarea matInput rows="3" [(ngModel)]="customAnswer" [disabled]="running()"></textarea>
        <mat-hint>
          Bài DUY NHẤT không do chính bộ chấm viết ra — dùng để kiểm xem AI có tự khen văn của nó
          hay không.
        </mat-hint>
      </mat-form-field>

      @if (running()) {
        <!--
          KHÔNG có thanh tiến trình theo bước ("đang viết → đang chấm"): lời gọi là đồng bộ, phía
          giao diện KHÔNG biết đang ở bước nào, nên một stepper chạy theo đồng hồ là giao diện nói
          dối. Cũng không có nút Huỷ: huỷ ở client không dừng được máy chủ mà lượt vẫn bị tính.
        -->
        <div class="waiting" data-testid="preview-waiting">
          <mat-progress-bar mode="indeterminate" />
          <p class="hint">Đang viết và chấm 3 bài mẫu — thường mất 20–40 giây.</p>
          <div class="cols skeleton">
            @for (s of [1, 2, 3]; track s) {
              <div class="col sk"></div>
            }
          </div>
        </div>
      }

      @if (error(); as e) {
        <p class="err" data-testid="preview-error">{{ e }}</p>
        @if (showTopUp()) {
          <a mat-stroked-button routerLink="/employer/credits">
            <mat-icon>add_card</mat-icon> Nạp credit
          </a>
        }
      }

      @if (current(); as run) {
        <div class="result" data-testid="preview-result">
          <!-- ① HÌNH: dải phân biệt của từng tiêu chí -->
          <h3>Thước đo có tách được ba mức không?</h3>
          <p class="legend">
            <span class="dot filled"></span> điểm thật &nbsp;
            <span class="dot hollow"></span> mức kỳ vọng &nbsp;
            <span class="sw weak"></span> yếu
            <span class="sw good"></span> khá
            <span class="sw exc"></span> xuất sắc
            @if (hasCustom(run)) {
              <span class="sw cus"></span> bài bạn dán
            }
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

          <!-- ② SỐ: ba (bốn) cột bài mẫu -->
          <div class="tabs">
            @for (s of run.samples; track s.band) {
              <button
                mat-button
                type="button"
                [class.on]="activeBand() === s.band"
                (click)="activeBand.set(s.band)"
              >
                {{ bandLabel(s.band) }}
              </button>
            }
          </div>

          <div class="cols">
            @for (s of run.samples; track s.band) {
              <mat-card class="col" [class.active]="activeBand() === s.band">
                <div class="col-head">
                  <span class="band">{{ bandLabel(s.band) }}</span>
                  <strong class="tot">Tổng {{ round(s.actualWeightedPct) }}%</strong>
                </div>
                <p class="sub">
                  Kỳ vọng {{ round(s.expectedWeightedPct) }}% → Thật
                  {{ round(s.actualWeightedPct) }}% · {{ s.wordCount }} từ
                </p>

                <!-- Bài mẫu đóng sẵn: thứ HR cần là ĐIỂM, chữ chỉ để tra khi thấy điểm lạ. -->
                <details>
                  <summary>Xem bài mẫu</summary>
                  <p class="answer">{{ s.answerText }}</p>
                </details>

                <table class="crit-tbl">
                  <tbody>
                    @for (sc of s.scores; track sc.criterionId) {
                      <tr [class.gap]="isBigGap(sc.expectedLevel, sc.actualScore)">
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
            <p class="warn-band" data-testid="length-warn">
              Ba bài mẫu lệch nhau khá nhiều về số từ. Khi đó dải điểm đẹp có thể chỉ phản ánh
              <strong>độ dài</strong> chứ không phải thước đo phân biệt được nội dung.
            </p>
          }

          <!-- ③ Băng cảnh báo LUÔN hiện: hai giới hạn này không giấu được, kể cả khi số đẹp. -->
          <p class="warn-band always" data-testid="preview-caveat">
            Bài mẫu là <strong>văn bản</strong> nên hệ thống không có số đo cách nói (tốc độ,
            khoảng lặng, từ đệm) — điểm thật của ứng viên có ghi âm có thể khác. Bài mẫu cũng do
            <strong>chính AI chấm điểm</strong> viết ra.
          </p>

          <p class="meta">
            Thước đo v{{ run.rubricVersion }} · dấu vân tay
            <span class="mono" [matTooltip]="run.rubricFingerprint">{{
              short(run.rubricFingerprint)
            }}</span>
            @if (run.promptVersion != null) {
              · prompt v{{ run.promptVersion }}
            }
            · {{ run.createdAt | date: 'short' }}
            @if (run.billed) {
              · đã trừ 1 credit
            }
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
                <span class="st" [class]="'st-' + r.status">{{ statusLabel(r.status) }}</span>
                <span class="mono">v{{ r.rubricVersion }}</span>
                <!--
                  Cùng dấu vân tay mà điểm khác = NHIỄU CỦA MÔ HÌNH, không phải do HR sửa mốc.
                  Thiếu nhãn này thì HR quy mọi thay đổi cho việc mình vừa sửa ⇒ kết luận sai.
                -->
                @if (current(); as cur) {
                  @if (r.id !== cur.id) {
                    <span class="cmp" [class.same]="sameRuler(r, cur)">
                      {{ sameRuler(r, cur) ? 'cùng thước đo' : 'khác thước đo' }}
                    </span>
                  }
                }
                @if (r.errorReason) {
                  <span class="muted">{{ r.errorReason }}</span>
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
        margin-bottom: 16px;
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
      .quota.bill {
        background: var(--mat-sys-secondary-container);
        color: var(--mat-sys-on-secondary-container);
      }
      .quota mat-icon {
        font-size: 16px;
        width: 16px;
        height: 16px;
      }
      .pick {
        display: flex;
        gap: 12px;
        align-items: center;
        flex-wrap: wrap;
      }
      .q-pick {
        flex: 1;
        min-width: 240px;
      }
      .full {
        width: 100%;
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
      .sw {
        display: inline-block;
        width: 10px;
        height: 10px;
        border-radius: 2px;
        vertical-align: middle;
      }
      .sw.weak {
        background: #b26a00;
      }
      .sw.good {
        background: #1565c0;
      }
      .sw.exc {
        background: #2e7d32;
      }
      .sw.cus {
        background: #6a1b9a;
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
      .col.sk {
        height: 160px;
        background: var(--mat-sys-surface-variant);
        border-radius: 8px;
      }
      .col-head {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
      }
      .band {
        font-weight: 600;
      }
      .tot {
        font-size: 16px;
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
      /* Nền nhạt chứ KHÔNG đỏ: lệch nhiều chưa chắc là lỗi, có thể chỉ là bài mẫu viết tốt hơn dự tính. */
      .crit-tbl tr.gap {
        background: var(--mat-sys-surface-variant);
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
      .meta,
      .muted {
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
      .st-Failed {
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
      .tabs {
        display: none;
        gap: 4px;
        margin-top: 8px;
      }
      .tabs .on {
        background: var(--mat-sys-secondary-container);
      }
      /* Dưới 900px ba cột không đọc được cạnh nhau → chuyển thành tab. Dải phân biệt ở trên GIỮ
         NGUYÊN mọi cỡ màn: đó là thứ phải nhìn thấy đầu tiên. */
      @media (max-width: 900px) {
        .tabs {
          display: flex;
        }
        .cols .col {
          display: none;
        }
        .cols .col.active {
          display: block;
        }
        .cols.skeleton .col {
          display: block;
        }
      }
    `,
  ],
})
export class RubricPreviewPanel implements OnInit {
  private api = inject(CampaignApi);
  private notify = inject(NotifyService);
  private dialog = inject(MatDialog);

  readonly campaignId = input.required<string>();
  readonly questions = input<PreviewQuestionOption[]>([]);
  /** Phiên bản thước đo hiện tại — hạn mức miễn phí tính theo từng phiên bản. */
  readonly rubricVersion = input<number | null>(null);
  /**
   * Biểu mẫu đang có thay đổi chưa lưu. Backend chấm trên bộ tiêu chí **ĐÃ LƯU**, nên chạy lúc
   * này sẽ kiểm chứng một thước đo khác với thứ HR đang nhìn trên màn.
   */
  readonly formDirty = input(false);

  questionId = '';
  customAnswer = '';

  readonly history = signal<RubricPreviewRun[]>([]);
  readonly current = signal<RubricPreviewRun | null>(null);
  readonly running = signal(false);
  readonly error = signal<string | null>(null);
  readonly showTopUp = signal(false);
  readonly activeBand = signal<RubricPreviewBand>('Weak');

  ngOnInit(): void {
    this.questionId = this.questions()[0]?.id ?? '';
    this.loadHistory();
  }

  private loadHistory(): void {
    this.api.getRubricPreviewRuns(this.campaignId()).subscribe({
      next: (runs) => {
        this.history.set(runs ?? []);
        if (!this.current()) {
          this.current.set((runs ?? []).find((r) => r.status === 'Succeeded') ?? null);
        }
      },
      // Không có lịch sử chỉ làm mất phần so sánh, không chặn việc chấm thử → im lặng.
      error: () => this.history.set([]),
    });
  }

  /**
   * Hạn mức miễn phí đếm **CHỈ lượt `Succeeded`** của đúng phiên bản thước đo này.
   *
   * Đếm cả lượt hỏng là phạt HR vì AI của mình lỗi: ba lần máy chủ trục trặc là họ mất sạch lượt
   * miễn phí mà chưa nhìn thấy kết quả nào.
   */
  freeLeft(): number {
    const v = this.rubricVersion();
    const used = this.history().filter(
      (r) => r.status === 'Succeeded' && (v == null || r.rubricVersion === v),
    ).length;
    return Math.max(0, FREE_PREVIEW_RUNS - used);
  }

  willBill(): boolean {
    return this.freeLeft() <= 0;
  }

  canRun(): boolean {
    return !this.running() && !!this.questionId && !this.formDirty();
  }

  runBlockedReason(): string {
    if (this.formDirty()) return 'Lưu thay đổi trước khi chấm thử — máy chủ chấm trên bản đã lưu.';
    if (!this.questionId) return 'Chọn một câu hỏi để chấm thử.';
    return '';
  }

  run(): void {
    if (!this.canRun()) {
      if (this.formDirty()) this.notify.warn(this.runBlockedReason());
      return;
    }
    if (!this.willBill()) {
      this.execute();
      return;
    }
    const data: ConfirmDialogData = {
      title: 'Lượt chấm thử này sẽ trừ 1 credit',
      message:
        'Bạn đã dùng hết lượt miễn phí cho phiên bản thước đo hiện tại. Chạy tiếp sẽ trừ 1 credit của ví tổ chức.',
      bullets: [
        'Sửa mốc điểm rồi lưu sẽ tạo phiên bản thước đo mới và được cấp lại lượt miễn phí.',
        'Lượt bị lỗi KHÔNG bị tính phí.',
      ],
      confirmLabel: 'Chấm thử (trừ 1 credit)',
    };
    this.dialog
      .open(ConfirmDialog, { data, width: '520px' })
      .afterClosed()
      .subscribe((ok) => {
        if (ok) this.execute();
      });
  }

  private execute(): void {
    const knownIds = new Set(this.history().map((r) => r.id));
    this.running.set(true);
    this.error.set(null);
    this.showTopUp.set(false);

    const body = {
      questionId: this.questionId,
      ...(this.customAnswer.trim() ? { customAnswer: this.customAnswer.trim() } : {}),
    };
    this.api.runRubricPreview(this.campaignId(), body).subscribe({
      next: (run) => {
        this.running.set(false);
        this.show(run);
        this.loadHistory();
      },
      error: (e: HttpErrorResponse) => this.recoverOrFail(e, knownIds),
    });
  }

  /**
   * Mạng đứt / hết thời hạn chờ **không** có nghĩa là lượt chạy đã hỏng: nó thường đã chạy xong ở
   * máy chủ và nằm sẵn trong lịch sử. Đọc lại MỘT lần trước khi báo lỗi — thiếu bước này thì 25
   * giây chờ đợi (và có thể 1 credit) biến mất chỉ vì một cú chớp wifi.
   */
  private recoverOrFail(e: HttpErrorResponse, knownIds: Set<string>): void {
    this.api.getRubricPreviewRuns(this.campaignId()).subscribe({
      next: (runs) => {
        this.running.set(false);
        this.history.set(runs ?? []);
        const recovered = (runs ?? []).find(
          (r) => r.status === 'Succeeded' && !knownIds.has(r.id),
        );
        if (recovered) {
          this.show(recovered);
          this.notify.info('Kết nối bị gián đoạn nhưng lượt chấm thử đã chạy xong.');
          return;
        }
        this.fail(e);
      },
      error: () => {
        this.running.set(false);
        this.fail(e);
      },
    });
  }

  private fail(e: HttpErrorResponse): void {
    if (e.status === 402) {
      // Bộ chặn lỗi toàn cục cố ý không xử lý 402 của /campaign/* — phải nói rõ ví nào hết tiền.
      this.showTopUp.set(true);
      this.error.set('Tổ chức không đủ credit để chạy lượt chấm thử này.');
      return;
    }
    this.error.set(
      extractErrorMessage(e) ?? 'Không chạy được chấm thử. Vui lòng thử lại sau ít phút.',
    );
  }

  private show(run: RubricPreviewRun): void {
    this.current.set(run);
    this.activeBand.set(run.samples?.[0]?.band ?? 'Weak');
    this.error.set(null);
  }

  select(run: RubricPreviewRun): void {
    if (run.status === 'Succeeded') this.show(run);
  }

  /** Chấm đặc = điểm thật, vòng rỗng = mức kỳ vọng — của mọi bài mẫu trên cùng một thang. */
  pointsFor(run: RubricPreviewRun, criterionId: string): ScalePoint[] {
    const out: ScalePoint[] = [];
    for (const s of run.samples ?? []) {
      const sc = s.scores?.find((x) => x.criterionId === criterionId);
      if (!sc) continue;
      out.push({ value: sc.expectedLevel, label: `${this.bandLabel(s.band)} — kỳ vọng`, kind: 'expected', band: s.band });
      out.push({ value: sc.actualScore, label: `${this.bandLabel(s.band)} — thật`, kind: 'actual', band: s.band });
    }
    return out;
  }

  /** Hai lượt có cùng thước đo không: mốc (dấu vân tay) + phiên bản + prompt hệ thống. */
  sameRuler(a: RubricPreviewRun, b: RubricPreviewRun): boolean {
    return (
      a.rubricFingerprint === b.rubricFingerprint &&
      a.rubricVersion === b.rubricVersion &&
      a.promptVersion === b.promptVersion
    );
  }

  hasCustom(run: RubricPreviewRun): boolean {
    return (run.samples ?? []).some((s: RubricPreviewSample) => s.band === 'Custom');
  }

  isBigGap(expected: number, actual: number): boolean {
    return Math.abs(Number(actual) - Number(expected)) >= 2;
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
