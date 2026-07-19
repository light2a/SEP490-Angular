import { DatePipe, DecimalPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { AdminApi } from '../../../core/api/admin.api';
import { extractErrorMessage } from '../../../core/api/http-utils';
import { NotifyService } from '../../../core/notify.service';
import { AiUsageReportResponse } from '../../../core/models';
import { EmptyState } from '../../../shared/ui/empty-state';
import { Spinner } from '../../../shared/ui/spinner';

/**
 * Tiêu thụ token + chi phí AI toàn nền tảng (F22 / FR18).
 *
 * Trước F22 hệ thống gọi Gemini ở 10 chỗ mà KHÔNG chỗ nào đọc `usage_metadata` ⇒ không ai
 * biết mình đốt bao nhiêu tiền. Màn này là chỗ trả lời câu đó — và quan trọng hơn là
 * **tiền đi đâu** (bảng "theo đường gọi"), vì đó mới là thứ quyết định được nên bật hay
 * tắt các tính năng đắt (self-consistency, thêm tiêu chí, sinh câu trả lời mẫu).
 *
 * ⚠ Tiền ở màn này là **USD** (Google niêm yết bằng USD) — cố ý KHÔNG dùng `VndPipe` như
 * các màn tiền khác của Payment. Một lượt gọi lẻ rất nhỏ (cỡ 1e-4 USD) nên hiển thị tới 4
 * chữ số thập phân; làm tròn 2 số sẽ cho ra "0.00" ở phần lớn dòng.
 */
@Component({
  selector: 'app-admin-ai-usage',
  imports: [
    DatePipe,
    DecimalPipe,
    FormsModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    MatTableModule,
    Spinner,
    EmptyState,
  ],
  template: `
    <div class="page">
      <mat-card class="card">
        <mat-card-header>
          <mat-card-title>Tiêu thụ token &amp; chi phí AI</mat-card-title>
        </mat-card-header>
        <mat-card-content>
          <form class="filters" (ngSubmit)="load()">
            <mat-form-field appearance="outline">
              <mat-label>Từ ngày</mat-label>
              <input matInput type="date" [(ngModel)]="from" name="from" />
            </mat-form-field>
            <mat-form-field appearance="outline">
              <mat-label>Đến ngày (không tính)</mat-label>
              <input matInput type="date" [(ngModel)]="to" name="to" />
            </mat-form-field>
            <mat-form-field appearance="outline" class="f-group">
              <mat-label>Gom theo</mat-label>
              <mat-select [(ngModel)]="groupBy" name="groupBy">
                <mat-option value="day">Ngày</mat-option>
                <mat-option value="month">Tháng</mat-option>
              </mat-select>
            </mat-form-field>
            <button mat-flat-button color="primary" type="submit" [disabled]="loading()">
              <mat-icon>search</mat-icon> Xem
            </button>
          </form>
          <p class="hint">
            Khoảng thời gian là nửa mở: tính từ "Từ ngày" đến trước "Đến ngày". Bỏ trống cả hai =
            30 ngày gần nhất.
          </p>

          @if (loading()) {
            <app-spinner [diameter]="32" message="Đang tổng hợp tiêu thụ token..." />
          } @else if (report(); as r) {
            <div class="kpis">
              <div class="kpi">
                <span class="k-label">Chi phí</span>
                <span class="k-num">\${{ r.totalCostUsd | number: '1.2-4' }}</span>
                <span class="k-sub">{{ r.totalCalls | number }} lượt gọi AI</span>
              </div>
              <div class="kpi">
                <span class="k-label">Tổng token</span>
                <span class="k-num">{{ r.totalTokens | number }}</span>
                <span class="k-sub">
                  vào {{ r.promptTokens | number }} · ra {{ r.outputTokens | number }}
                </span>
              </div>
              <div class="kpi">
                <span class="k-label">Trung bình / lượt</span>
                <span class="k-num">{{ avgTokens(r) | number: '1.0-0' }}</span>
                <span class="k-sub">token mỗi lượt gọi</span>
              </div>
            </div>

            <p class="note">
              <mat-icon inline>info</mat-icon>
              Chi phí tính theo <strong>đơn giá đã chốt tại thời điểm gọi</strong> (USD/1 triệu
              token), nên Google đổi giá sau này không làm sai lệch số liệu đã ghi. Số token do
              chính Gemini báo về — <strong>không phải</strong> ước lượng.
            </p>

            <h3>Theo đường gọi</h3>
            @if (!r.byOperation.length) {
              <app-empty-state icon="bolt" message="Không có lượt gọi AI nào trong kỳ." />
            } @else {
              <table mat-table [dataSource]="r.byOperation" class="tbl">
                <ng-container matColumnDef="operation">
                  <th mat-header-cell *matHeaderCellDef>Đường gọi</th>
                  <td mat-cell *matCellDef="let o">{{ operationLabel(o.operation) }}</td>
                </ng-container>
                <ng-container matColumnDef="calls">
                  <th mat-header-cell *matHeaderCellDef>Lượt</th>
                  <td mat-cell *matCellDef="let o">{{ o.calls | number }}</td>
                </ng-container>
                <ng-container matColumnDef="totalTokens">
                  <th mat-header-cell *matHeaderCellDef>Token</th>
                  <td mat-cell *matCellDef="let o">{{ o.totalTokens | number }}</td>
                </ng-container>
                <ng-container matColumnDef="costUsd">
                  <th mat-header-cell *matHeaderCellDef>Chi phí (USD)</th>
                  <td mat-cell *matCellDef="let o">{{ o.costUsd | number: '1.2-4' }}</td>
                </ng-container>
                <tr mat-header-row *matHeaderRowDef="opCols"></tr>
                <tr mat-row *matRowDef="let row; columns: opCols"></tr>
              </table>
            }

            <h3>Theo {{ r.granularity.toLowerCase() === 'month' ? 'tháng' : 'ngày' }}</h3>
            @if (!r.buckets.length) {
              <app-empty-state icon="calendar_month" message="Không có dữ liệu trong kỳ." />
            } @else {
              <table mat-table [dataSource]="r.buckets" class="tbl">
                <ng-container matColumnDef="periodStart">
                  <th mat-header-cell *matHeaderCellDef>Mốc</th>
                  <td mat-cell *matCellDef="let b">
                    {{
                      b.periodStart
                        | date: (r.granularity.toLowerCase() === 'month' ? 'MM/yyyy' : 'dd/MM/yyyy')
                    }}
                  </td>
                </ng-container>
                <ng-container matColumnDef="calls">
                  <th mat-header-cell *matHeaderCellDef>Lượt</th>
                  <td mat-cell *matCellDef="let b">{{ b.calls | number }}</td>
                </ng-container>
                <ng-container matColumnDef="totalTokens">
                  <th mat-header-cell *matHeaderCellDef>Token</th>
                  <td mat-cell *matCellDef="let b">{{ b.totalTokens | number }}</td>
                </ng-container>
                <ng-container matColumnDef="costUsd">
                  <th mat-header-cell *matHeaderCellDef>Chi phí (USD)</th>
                  <td mat-cell *matCellDef="let b">{{ b.costUsd | number: '1.2-4' }}</td>
                </ng-container>
                <tr mat-header-row *matHeaderRowDef="bucketCols"></tr>
                <tr mat-row *matRowDef="let row; columns: bucketCols"></tr>
              </table>
            }

            @if (r.resourceUrls; as u) {
              <h3>Liên kết tài liệu do AI sinh</h3>
              <p class="note">
                <mat-icon inline>link_off</mat-icon>
                AI đề xuất <strong>{{ u.proposed | number }}</strong> liên kết, bị loại
                <strong>{{ u.rejected | number }}</strong>
                ({{ u.rejectedRate * 100 | number: '1.0-1' }}%) vì tên miền không nằm trong danh
                sách nguồn tin cậy. Tỉ lệ cao = AI đang bịa tên miền, hoặc danh sách cho phép quá
                chặt — cả hai đều đáng xem lại.
              </p>
            }
          }
        </mat-card-content>
      </mat-card>
    </div>
  `,
  styles: [
    `
      .page {
        padding: 8px;
      }
      .card {
        width: 100%;
      }
      .filters {
        display: flex;
        align-items: center;
        gap: 12px;
        flex-wrap: wrap;
      }
      .f-group {
        width: 140px;
      }
      .hint,
      .note {
        color: var(--mat-sys-on-surface-variant);
        font-size: 13px;
      }
      .note {
        display: flex;
        align-items: flex-start;
        gap: 6px;
        line-height: 1.5;
        margin: 12px 0;
      }
      .kpis {
        display: flex;
        gap: 16px;
        flex-wrap: wrap;
        margin: 16px 0;
      }
      .kpi {
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-width: 180px;
        padding: 12px 16px;
        border-radius: 12px;
        background: var(--mat-sys-surface-container);
      }
      .k-label {
        font-size: 12px;
        color: var(--mat-sys-on-surface-variant);
      }
      .k-num {
        font-size: 22px;
        font-weight: 600;
      }
      .k-sub {
        font-size: 12px;
        color: var(--mat-sys-on-surface-variant);
      }
      .tbl {
        width: 100%;
        margin-bottom: 16px;
      }
      h3 {
        margin-top: 20px;
        font-size: 15px;
      }
    `,
  ],
})
export class AdminAiUsage implements OnInit {
  private readonly api = inject(AdminApi);
  private readonly notify = inject(NotifyService);

  readonly loading = signal(false);
  readonly report = signal<AiUsageReportResponse | null>(null);

  from: string | null = null;
  to: string | null = null;
  groupBy: 'day' | 'month' = 'day';

  readonly opCols = ['operation', 'calls', 'totalTokens', 'costUsd'];
  readonly bucketCols = ['periodStart', 'calls', 'totalTokens', 'costUsd'];

  /** Nhãn tiếng Việt cho tên đường gọi phía AIService. Tên lạ (endpoint mới) hiện NGUYÊN
   *  chuỗi gốc thay vì nuốt mất — thà xấu còn hơn giấu một khoản chi. */
  private readonly labels: Record<string, string> = {
    score: 'Chấm câu trả lời',
    generate_questions: 'Sinh câu hỏi',
    suggest_criteria: 'Gợi ý tiêu chí',
    analyze_cv: 'Phân tích CV',
    generate_roadmap: 'Sinh lộ trình',
    generate_lesson_theory: 'Sinh lý thuyết bài học',
    summarize_roadmap: 'Tổng kết lộ trình',
    summarize_session: 'Nhận xét buổi luyện',
    decide_next: 'Chọn câu hỏi kế (thích ứng)',
    text_to_speech: 'Đọc câu hỏi (TTS)',
  };

  ngOnInit(): void {
    this.load();
  }

  operationLabel(operation: string): string {
    return this.labels[operation] ?? operation;
  }

  avgTokens(r: AiUsageReportResponse): number {
    return r.totalCalls === 0 ? 0 : r.totalTokens / r.totalCalls;
  }

  load(): void {
    this.loading.set(true);
    this.api.aiUsage({ from: this.from, to: this.to, groupBy: this.groupBy }).subscribe({
      next: (r) => {
        this.report.set(r);
        this.loading.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.notify.error(extractErrorMessage(err) ?? 'Không tải được số liệu tiêu thụ AI.');
        this.loading.set(false);
      },
    });
  }
}
