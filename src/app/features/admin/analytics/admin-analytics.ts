import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { AdminOpsApi } from '../../../core/api/admin-ops.api';
import { extractErrorMessage } from '../../../core/api/http-utils';
import { NotifyService } from '../../../core/notify.service';
import {
  AnalyticsGranularity,
  AnalyticsPeriodEcho,
  AuthAnalyticsResponse,
  CampaignAnalyticsResponse,
  InterviewAnalyticsResponse,
  TrafficGranularity,
  TrafficReportResponse,
  TrafficSummary,
} from '../../../core/models/admin-ops.models';
import { EmptyState } from '../../../shared/ui/empty-state';
import { Spinner } from '../../../shared/ui/spinner';

export type AnalyticsTab = 'auth' | 'interview' | 'campaign' | 'traffic';

/**
 * Thống kê vận hành (FR18) — gom 4 endpoint analytics của 4 service vào một màn.
 *
 * **Tải theo tab, không tải cả 4 một lượt.** Đây là 4 service độc lập: một service chết thì ba
 * phần còn lại vẫn phải đọc được. Bắn cả 4 request rồi để một lỗi phủ lên toàn màn sẽ biến một
 * sự cố cục bộ thành "trang thống kê hỏng".
 *
 * **Múi giờ:** backend gom bucket cắt theo ngày **UTC** trong khi admin ngồi +07:00. FE CỐ Ý
 * không nắn biên ngày — làm vậy chỉ đúng một nửa (việc gom nhóm nằm phía server) và đẻ ra bucket
 * đầu/cuối bị hụt, một cái sai tinh vi hơn cái đang có. Thay vào đó hiện KỲ THẬT backend trả về,
 * quy chiếu UTC tường minh, để độ lệch không còn vô hình.
 */
@Component({
  selector: 'app-admin-analytics',
  imports: [
    DatePipe,
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
          <mat-card-title>Thống kê vận hành</mat-card-title>
        </mat-card-header>
        <mat-card-content>
          <div class="tabs">
            @for (t of tabs; track t.id) {
              <button
                mat-flat-button
                [color]="tab() === t.id ? 'primary' : undefined"
                [attr.data-testid]="'tab-' + t.id"
                (click)="selectTab(t.id)"
              >
                <mat-icon>{{ t.icon }}</mat-icon> {{ t.label }}
              </button>
            }
          </div>

          <form class="filters" (ngSubmit)="apply()">
            <mat-form-field appearance="outline">
              <mat-label>Từ ngày</mat-label>
              <input matInput type="date" [(ngModel)]="from" name="from" />
            </mat-form-field>
            <mat-form-field appearance="outline">
              <mat-label>Đến ngày (không tính)</mat-label>
              <input matInput type="date" [(ngModel)]="to" name="to" />
            </mat-form-field>

            <!--
              Traffic có bộ granularity RIÊNG ('hour'|'day'). Dùng chung một ô select với 3 tab kia
              sẽ gửi 'month' vào endpoint traffic → 400. Tách ô theo tab thay vì im lặng ánh xạ lại.
            -->
            @if (tab() === 'traffic') {
              <mat-form-field appearance="outline" class="f-group">
                <mat-label>Gom theo</mat-label>
                <mat-select [(ngModel)]="trafficGroupBy" name="trafficGroupBy">
                  <mat-option value="hour">Giờ</mat-option>
                  <mat-option value="day">Ngày</mat-option>
                </mat-select>
              </mat-form-field>
            } @else {
              <mat-form-field appearance="outline" class="f-group">
                <mat-label>Gom theo</mat-label>
                <mat-select [(ngModel)]="groupBy" name="groupBy">
                  <mat-option value="day">Ngày</mat-option>
                  <mat-option value="month">Tháng</mat-option>
                </mat-select>
              </mat-form-field>
            }

            <button mat-flat-button color="primary" type="submit" [disabled]="busy() !== null">
              <mat-icon>search</mat-icon> Xem
            </button>
          </form>

          <p class="hint">
            Khoảng thời gian là nửa mở: từ "Từ ngày" đến trước "Đến ngày". Bỏ trống cả hai = 30
            ngày gần nhất. <strong>Mốc ngày tính theo giờ UTC</strong>, không theo giờ máy bạn —
            xem "Kỳ đã tính" bên dưới để biết chính xác khoảng nào được cộng.
          </p>

          @if (period(); as p) {
            <p class="period" data-testid="resolved-period">
              <mat-icon inline>schedule</mat-icon>
              Kỳ đã tính: <strong>{{ p.from | date: 'dd/MM/yyyy HH:mm' : 'UTC' }}</strong> →
              <strong>{{ p.to | date: 'dd/MM/yyyy HH:mm' : 'UTC' }}</strong> (UTC, không tính mốc
              cuối).
            </p>
          }

          @if (busy() === tab()) {
            <app-spinner [diameter]="32" message="Đang tải thống kê..." />
          } @else if (activeError(); as err) {
            <app-empty-state icon="error_outline" [message]="err" />
            <div class="retry">
              <button mat-stroked-button (click)="load(tab(), true)">
                <mat-icon>refresh</mat-icon> Thử lại
              </button>
            </div>
          } @else {
            @switch (tab()) {
              @case ('auth') {
                @if (auth(); as a) {
                  <div class="kpis">
                    <div class="kpi">
                      <span class="k-label">Tổng người dùng</span>
                      <span class="k-num">{{ a.totals.totalUsers }}</span>
                      <span class="k-sub">toàn nền tảng</span>
                    </div>
                    <div class="kpi">
                      <span class="k-label">Người dùng mới</span>
                      <span class="k-num">{{ a.totals.newUsers }}</span>
                      <span class="k-sub">trong kỳ</span>
                    </div>
                    <div class="kpi">
                      <span class="k-label">Bị cấm</span>
                      <span class="k-num">{{ a.totals.bannedUsers }}</span>
                      <span class="k-sub">toàn nền tảng</span>
                    </div>
                    <div class="kpi">
                      <span class="k-label">Tổ chức</span>
                      <span class="k-num">{{ a.totals.totalOrganizations }}</span>
                      <span class="k-sub">toàn nền tảng</span>
                    </div>
                  </div>

                  <!--
                    Cửa sổ TRƯỢT tính tới hiện tại — không cắt theo kỳ đang lọc. Phải nói rõ, nếu
                    không admin sẽ đọc nó như một con số thuộc kỳ và kết luận sai.
                  -->
                  <div class="kpis">
                    <div class="kpi alt">
                      <span class="k-label">Hoạt động 7 ngày qua</span>
                      <span class="k-num">{{ a.activeUsers.last7Days }}</span>
                      <span class="k-sub">cửa sổ trượt, KHÔNG theo kỳ lọc</span>
                    </div>
                    <div class="kpi alt">
                      <span class="k-label">Hoạt động 30 ngày qua</span>
                      <span class="k-num">{{ a.activeUsers.last30Days }}</span>
                      <span class="k-sub">cửa sổ trượt, KHÔNG theo kỳ lọc</span>
                    </div>
                  </div>

                  <h3>Theo vai trò</h3>
                  @if (!a.totals.byRole.length) {
                    <app-empty-state icon="badge" message="Không có dữ liệu vai trò." />
                  } @else {
                    <table mat-table [dataSource]="a.totals.byRole" class="tbl">
                      <ng-container matColumnDef="k">
                        <th mat-header-cell *matHeaderCellDef>Vai trò</th>
                        <td mat-cell *matCellDef="let r">{{ r.role }}</td>
                      </ng-container>
                      <ng-container matColumnDef="v">
                        <th mat-header-cell *matHeaderCellDef>Số lượng</th>
                        <td mat-cell *matCellDef="let r">{{ r.count }}</td>
                      </ng-container>
                      <tr mat-header-row *matHeaderRowDef="pairCols"></tr>
                      <tr mat-row *matRowDef="let row; columns: pairCols"></tr>
                    </table>
                  }

                  <h3>Theo {{ bucketLabel(a.granularity) }}</h3>
                  @if (!a.buckets.length) {
                    <app-empty-state icon="calendar_month" message="Không có dữ liệu trong kỳ." />
                  } @else {
                    <table mat-table [dataSource]="a.buckets" class="tbl">
                      <ng-container matColumnDef="periodStart">
                        <th mat-header-cell *matHeaderCellDef>Mốc (UTC)</th>
                        <td mat-cell *matCellDef="let b">
                          {{ b.periodStart | date: bucketFormat(a.granularity) : 'UTC' }}
                        </td>
                      </ng-container>
                      <ng-container matColumnDef="newUsers">
                        <th mat-header-cell *matHeaderCellDef>Người dùng mới</th>
                        <td mat-cell *matCellDef="let b">{{ b.newUsers }}</td>
                      </ng-container>
                      <ng-container matColumnDef="logins">
                        <th mat-header-cell *matHeaderCellDef>Lượt đăng nhập</th>
                        <td mat-cell *matCellDef="let b">{{ b.logins }}</td>
                      </ng-container>
                      <ng-container matColumnDef="distinctUsers">
                        <th mat-header-cell *matHeaderCellDef>Người dùng riêng biệt</th>
                        <td mat-cell *matCellDef="let b">{{ b.distinctUsers }}</td>
                      </ng-container>
                      <tr mat-header-row *matHeaderRowDef="authCols"></tr>
                      <tr mat-row *matRowDef="let row; columns: authCols"></tr>
                    </table>
                  }
                }
              }

              @case ('interview') {
                @if (interview(); as a) {
                  <div class="kpis">
                    <div class="kpi alt">
                      <span class="k-label">Buổi đang chạy — B2C</span>
                      <span class="k-num">{{ a.activeSessions.b2c }}</span>
                      <span class="k-sub">tức thời, KHÔNG theo kỳ lọc</span>
                    </div>
                    <div class="kpi alt">
                      <span class="k-label">Buổi đang chạy — B2B</span>
                      <span class="k-num">{{ a.activeSessions.b2b }}</span>
                      <span class="k-sub">tức thời, KHÔNG theo kỳ lọc</span>
                    </div>
                    <div class="kpi">
                      <span class="k-label">Câu trả lời chờ chấm</span>
                      <span class="k-num">{{ a.totals.answersUploaded }}</span>
                      <span class="k-sub">trạng thái Uploaded</span>
                    </div>
                    <div class="kpi">
                      <span class="k-label">Cần người rà lại</span>
                      <span class="k-num">{{ a.totals.answersNeedsReview }}</span>
                      <span class="k-sub">cờ needs_review</span>
                    </div>
                  </div>

                  <h3>Buổi theo nghề</h3>
                  @if (!a.totals.byJobCategory.length) {
                    <app-empty-state icon="work" message="Không có dữ liệu theo nghề." />
                  } @else {
                    <table mat-table [dataSource]="a.totals.byJobCategory" class="tbl">
                      <ng-container matColumnDef="k">
                        <th mat-header-cell *matHeaderCellDef>Nghề</th>
                        <td mat-cell *matCellDef="let r">{{ r.jobCategory }}</td>
                      </ng-container>
                      <ng-container matColumnDef="v">
                        <th mat-header-cell *matHeaderCellDef>Số buổi</th>
                        <td mat-cell *matCellDef="let r">{{ r.count }}</td>
                      </ng-container>
                      <tr mat-header-row *matHeaderRowDef="pairCols"></tr>
                      <tr mat-row *matRowDef="let row; columns: pairCols"></tr>
                    </table>
                  }

                  <h3>Theo {{ bucketLabel(a.granularity) }}</h3>
                  @if (!a.buckets.length) {
                    <app-empty-state icon="calendar_month" message="Không có dữ liệu trong kỳ." />
                  } @else {
                    <table mat-table [dataSource]="a.buckets" class="tbl">
                      <ng-container matColumnDef="periodStart">
                        <th mat-header-cell *matHeaderCellDef>Mốc (UTC)</th>
                        <td mat-cell *matCellDef="let b">
                          {{ b.periodStart | date: bucketFormat(a.granularity) : 'UTC' }}
                        </td>
                      </ng-container>
                      <ng-container matColumnDef="created">
                        <th mat-header-cell *matHeaderCellDef>Tạo mới</th>
                        <td mat-cell *matCellDef="let b">{{ b.created }}</td>
                      </ng-container>
                      <ng-container matColumnDef="scored">
                        <th mat-header-cell *matHeaderCellDef>Đã chấm</th>
                        <td mat-cell *matCellDef="let b">{{ b.scored }}</td>
                      </ng-container>
                      <ng-container matColumnDef="failed">
                        <th mat-header-cell *matHeaderCellDef>Hỏng</th>
                        <td mat-cell *matCellDef="let b">{{ b.failed }}</td>
                      </ng-container>
                      <ng-container matColumnDef="abandoned">
                        <th mat-header-cell *matHeaderCellDef>Bỏ dở</th>
                        <td mat-cell *matCellDef="let b">{{ b.abandoned }}</td>
                      </ng-container>
                      <tr mat-header-row *matHeaderRowDef="intCols"></tr>
                      <tr mat-row *matRowDef="let row; columns: intCols"></tr>
                    </table>
                  }
                }
              }

              @case ('campaign') {
                @if (campaign(); as a) {
                  <div class="kpis">
                    <div class="kpi">
                      <span class="k-label">Lời mời đã gửi</span>
                      <span class="k-num">{{ a.totals.invitationsSent }}</span>
                      <span class="k-sub">có mốc gửi email</span>
                    </div>
                    <div class="kpi">
                      <span class="k-label">Lời mời chưa gửi</span>
                      <span class="k-num">{{ a.totals.invitationsUnsent }}</span>
                      <span class="k-sub">còn nằm hàng đợi</span>
                    </div>
                  </div>

                  <p class="note">
                    <mat-icon inline>info</mat-icon>
                    Chiến dịch đã xoá (soft-delete) <strong>không</strong> được tính ở đây — đó là
                    chủ đích, không phải số bị hụt.
                  </p>

                  <h3>Chiến dịch theo trạng thái</h3>
                  @if (!a.totals.byStatus.length) {
                    <app-empty-state icon="work" message="Chưa có chiến dịch nào." />
                  } @else {
                    <table mat-table [dataSource]="a.totals.byStatus" class="tbl">
                      <ng-container matColumnDef="k">
                        <th mat-header-cell *matHeaderCellDef>Trạng thái</th>
                        <td mat-cell *matCellDef="let r">{{ r.status }}</td>
                      </ng-container>
                      <ng-container matColumnDef="v">
                        <th mat-header-cell *matHeaderCellDef>Số lượng</th>
                        <td mat-cell *matCellDef="let r">{{ r.count }}</td>
                      </ng-container>
                      <tr mat-header-row *matHeaderRowDef="pairCols"></tr>
                      <tr mat-row *matRowDef="let row; columns: pairCols"></tr>
                    </table>
                  }

                  <h3>Cờ chống gian lận theo loại tín hiệu</h3>
                  @if (!a.totals.flagsBySignal.length) {
                    <app-empty-state icon="flag" message="Chưa có cờ nào." />
                  } @else {
                    <table mat-table [dataSource]="a.totals.flagsBySignal" class="tbl">
                      <ng-container matColumnDef="k">
                        <th mat-header-cell *matHeaderCellDef>Tín hiệu</th>
                        <td mat-cell *matCellDef="let r">{{ r.signalType }}</td>
                      </ng-container>
                      <ng-container matColumnDef="v">
                        <th mat-header-cell *matHeaderCellDef>Số lần</th>
                        <td mat-cell *matCellDef="let r">{{ r.count }}</td>
                      </ng-container>
                      <tr mat-header-row *matHeaderRowDef="pairCols"></tr>
                      <tr mat-row *matRowDef="let row; columns: pairCols"></tr>
                    </table>
                  }

                  <h3>Funnel theo {{ bucketLabel(a.granularity) }}</h3>
                  @if (!a.buckets.length) {
                    <app-empty-state icon="calendar_month" message="Không có dữ liệu trong kỳ." />
                  } @else {
                    <table mat-table [dataSource]="a.buckets" class="tbl">
                      <ng-container matColumnDef="periodStart">
                        <th mat-header-cell *matHeaderCellDef>Mốc (UTC)</th>
                        <td mat-cell *matCellDef="let b">
                          {{ b.periodStart | date: bucketFormat(a.granularity) : 'UTC' }}
                        </td>
                      </ng-container>
                      <ng-container matColumnDef="campaignsCreated">
                        <th mat-header-cell *matHeaderCellDef>Chiến dịch tạo</th>
                        <td mat-cell *matCellDef="let b">{{ b.campaignsCreated }}</td>
                      </ng-container>
                      <ng-container matColumnDef="invitationsCreated">
                        <th mat-header-cell *matHeaderCellDef>Lời mời tạo</th>
                        <td mat-cell *matCellDef="let b">{{ b.invitationsCreated }}</td>
                      </ng-container>
                      <ng-container matColumnDef="joins">
                        <th mat-header-cell *matHeaderCellDef>Tham gia</th>
                        <td mat-cell *matCellDef="let b">{{ b.joins }}</td>
                      </ng-container>
                      <ng-container matColumnDef="interviewsStarted">
                        <th mat-header-cell *matHeaderCellDef>Bắt đầu thi</th>
                        <td mat-cell *matCellDef="let b">{{ b.interviewsStarted }}</td>
                      </ng-container>
                      <tr mat-header-row *matHeaderRowDef="campCols"></tr>
                      <tr mat-row *matRowDef="let row; columns: campCols"></tr>
                    </table>
                  }
                }
              }

              @case ('traffic') {
                @if (traffic(); as a) {
                  <div class="kpis">
                    <div class="kpi">
                      <span class="k-label">Tổng request</span>
                      <span class="k-num">{{ a.totals.requests }}</span>
                      <span class="k-sub">trong kỳ</span>
                    </div>
                    <div class="kpi">
                      <span class="k-label">Lỗi 4xx</span>
                      <span class="k-num">{{ a.totals.errors4xx }}</span>
                      <span class="k-sub">phía client</span>
                    </div>
                    <div class="kpi">
                      <span class="k-label">Lỗi 5xx</span>
                      <span class="k-num" [class.negative]="a.totals.errors5xx > 0">
                        {{ a.totals.errors5xx }}
                      </span>
                      <span class="k-sub">phía server</span>
                    </div>
                    <div class="kpi">
                      <span class="k-label">Độ trễ TB</span>
                      <span class="k-num">{{ ms(a.totals.avgDurationMs) }}</span>
                      <span class="k-sub">cao nhất {{ ms(a.totals.maxDurationMs) }}</span>
                    </div>
                  </div>

                  <p class="note">
                    <mat-icon inline>info</mat-icon>
                    Gom theo <strong>route id của Gateway</strong> (vd <code>payment-route</code>),
                    không phải từng đường dẫn — mọi path dưới cùng một route nằm chung một dòng.
                  </p>

                  <h3>Theo route</h3>
                  @if (!a.byRoute.length) {
                    <app-empty-state icon="alt_route" message="Không có request nào trong kỳ." />
                  } @else {
                    <table mat-table [dataSource]="a.byRoute" class="tbl">
                      <ng-container matColumnDef="routeId">
                        <th mat-header-cell *matHeaderCellDef>Route</th>
                        <td mat-cell *matCellDef="let r">{{ r.routeId }}</td>
                      </ng-container>
                      <ng-container matColumnDef="requests">
                        <th mat-header-cell *matHeaderCellDef>Request</th>
                        <td mat-cell *matCellDef="let r">{{ r.summary.requests }}</td>
                      </ng-container>
                      <ng-container matColumnDef="errors4xx">
                        <th mat-header-cell *matHeaderCellDef>4xx</th>
                        <td mat-cell *matCellDef="let r">{{ r.summary.errors4xx }}</td>
                      </ng-container>
                      <ng-container matColumnDef="errors5xx">
                        <th mat-header-cell *matHeaderCellDef>5xx</th>
                        <td mat-cell *matCellDef="let r">{{ r.summary.errors5xx }}</td>
                      </ng-container>
                      <ng-container matColumnDef="avgDurationMs">
                        <th mat-header-cell *matHeaderCellDef>Trễ TB</th>
                        <td mat-cell *matCellDef="let r">{{ ms(r.summary.avgDurationMs) }}</td>
                      </ng-container>
                      <ng-container matColumnDef="maxDurationMs">
                        <th mat-header-cell *matHeaderCellDef>Trễ cao nhất</th>
                        <td mat-cell *matCellDef="let r">{{ ms(r.summary.maxDurationMs) }}</td>
                      </ng-container>
                      <tr mat-header-row *matHeaderRowDef="routeCols"></tr>
                      <tr mat-row *matRowDef="let row; columns: routeCols"></tr>
                    </table>
                  }

                  <h3>Theo {{ bucketLabel(a.granularity) }}</h3>
                  @if (!a.buckets.length) {
                    <app-empty-state icon="schedule" message="Không có dữ liệu trong kỳ." />
                  } @else {
                    <table mat-table [dataSource]="a.buckets" class="tbl">
                      <ng-container matColumnDef="periodStart">
                        <th mat-header-cell *matHeaderCellDef>Mốc (UTC)</th>
                        <td mat-cell *matCellDef="let b">
                          {{ b.periodStart | date: bucketFormat(a.granularity) : 'UTC' }}
                        </td>
                      </ng-container>
                      <ng-container matColumnDef="requests">
                        <th mat-header-cell *matHeaderCellDef>Request</th>
                        <td mat-cell *matCellDef="let b">{{ b.summary.requests }}</td>
                      </ng-container>
                      <ng-container matColumnDef="errors4xx">
                        <th mat-header-cell *matHeaderCellDef>4xx</th>
                        <td mat-cell *matCellDef="let b">{{ b.summary.errors4xx }}</td>
                      </ng-container>
                      <ng-container matColumnDef="errors5xx">
                        <th mat-header-cell *matHeaderCellDef>5xx</th>
                        <td mat-cell *matCellDef="let b">{{ b.summary.errors5xx }}</td>
                      </ng-container>
                      <ng-container matColumnDef="avgDurationMs">
                        <th mat-header-cell *matHeaderCellDef>Trễ TB</th>
                        <td mat-cell *matCellDef="let b">{{ ms(b.summary.avgDurationMs) }}</td>
                      </ng-container>
                      <tr mat-header-row *matHeaderRowDef="trafficBucketCols"></tr>
                      <tr mat-row *matRowDef="let row; columns: trafficBucketCols"></tr>
                    </table>
                  }
                }
              }
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
      .tabs {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        margin-bottom: 16px;
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
      .note,
      .period {
        color: var(--mat-sys-on-surface-variant);
        font-size: 13px;
      }
      .period {
        margin: 4px 0 12px;
      }
      .note {
        margin: 12px 0 4px;
        padding: 10px 12px;
        border-radius: 8px;
        background: var(--mat-sys-surface-variant);
      }
      .retry {
        display: flex;
        justify-content: center;
        padding-bottom: 16px;
      }
      .kpis {
        display: flex;
        gap: 16px;
        flex-wrap: wrap;
        margin: 12px 0;
      }
      .kpi {
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-width: 180px;
        padding: 16px 20px;
        border-radius: 12px;
        background: var(--mat-sys-surface-variant);
      }
      .kpi.alt {
        outline: 1px dashed var(--mat-sys-outline);
      }
      .k-label {
        font-size: 13px;
        color: var(--mat-sys-on-surface-variant);
      }
      .k-num {
        font-size: 24px;
        font-weight: 700;
        color: var(--mat-sys-primary);
        font-variant-numeric: tabular-nums;
      }
      .k-num.negative {
        color: var(--mat-sys-error);
      }
      .k-sub {
        font-size: 12px;
        color: var(--mat-sys-on-surface-variant);
      }
      h3 {
        margin: 20px 0 8px;
        font-size: 16px;
      }
      .tbl {
        width: 100%;
      }
    `,
  ],
})
export class AdminAnalytics implements OnInit {
  private api = inject(AdminOpsApi);
  private notify = inject(NotifyService);

  readonly tabs: { id: AnalyticsTab; icon: string; label: string }[] = [
    { id: 'auth', icon: 'group', label: 'Người dùng' },
    { id: 'interview', icon: 'record_voice_over', label: 'Phỏng vấn' },
    { id: 'campaign', icon: 'work', label: 'Chiến dịch B2B' },
    { id: 'traffic', icon: 'speed', label: 'Tải hệ thống' },
  ];

  readonly pairCols = ['k', 'v'];
  readonly authCols = ['periodStart', 'newUsers', 'logins', 'distinctUsers'];
  readonly intCols = ['periodStart', 'created', 'scored', 'failed', 'abandoned'];
  readonly campCols = [
    'periodStart',
    'campaignsCreated',
    'invitationsCreated',
    'joins',
    'interviewsStarted',
  ];
  readonly routeCols = [
    'routeId',
    'requests',
    'errors4xx',
    'errors5xx',
    'avgDurationMs',
    'maxDurationMs',
  ];
  readonly trafficBucketCols = [
    'periodStart',
    'requests',
    'errors4xx',
    'errors5xx',
    'avgDurationMs',
  ];

  readonly tab = signal<AnalyticsTab>('auth');
  readonly busy = signal<AnalyticsTab | null>(null);

  readonly auth = signal<AuthAnalyticsResponse | null>(null);
  readonly interview = signal<InterviewAnalyticsResponse | null>(null);
  readonly campaign = signal<CampaignAnalyticsResponse | null>(null);
  readonly traffic = signal<TrafficReportResponse | null>(null);

  /** Lỗi giữ RIÊNG từng tab: một service chết không được làm ba tab kia trông như cũng hỏng. */
  readonly errors = signal<Record<AnalyticsTab, string | null>>({
    auth: null,
    interview: null,
    campaign: null,
    traffic: null,
  });

  from = '';
  to = '';
  groupBy: AnalyticsGranularity = 'day';
  trafficGroupBy: TrafficGranularity = 'day';

  /** Kỳ THẬT do backend chốt cho tab đang xem (mọi response analytics đều echo `from`/`to`). */
  readonly period = computed<AnalyticsPeriodEcho | null>(() => {
    switch (this.tab()) {
      case 'auth':
        return this.auth();
      case 'interview':
        return this.interview();
      case 'campaign':
        return this.campaign();
      case 'traffic':
        return this.traffic();
    }
  });

  readonly activeError = computed<string | null>(() => this.errors()[this.tab()]);

  ngOnInit(): void {
    this.load(this.tab());
  }

  bucketLabel(granularity: string): string {
    if (granularity === 'month') return 'tháng';
    if (granularity === 'hour') return 'giờ';
    return 'ngày';
  }

  bucketFormat(granularity: string): string {
    if (granularity === 'month') return 'MM/yyyy';
    if (granularity === 'hour') return 'dd/MM HH:mm';
    return 'dd/MM/yyyy';
  }

  /**
   * `null` ở đây nghĩa là "kỳ không có request nào", KHÔNG phải 0ms — hiện `0 ms` sẽ đọc thành
   * "nhanh tuyệt đối", đúng kiểu sai lệch nghiêng về phía đẹp mà không ai đi báo.
   */
  ms(value: number | null): string {
    return value == null ? '—' : `${Math.round(value)} ms`;
  }

  selectTab(tab: AnalyticsTab): void {
    this.tab.set(tab);
    if (!this.hasData(tab)) this.load(tab);
  }

  /** Bấm "Xem": dữ liệu cũ thuộc kỳ cũ ⇒ vứt hết, tải lại tab đang xem theo kỳ mới. */
  apply(): void {
    if (this.from && this.to && this.from >= this.to) {
      this.notify.warn('"Từ ngày" phải nhỏ hơn "Đến ngày".');
      return;
    }
    this.auth.set(null);
    this.interview.set(null);
    this.campaign.set(null);
    this.traffic.set(null);
    this.errors.set({ auth: null, interview: null, campaign: null, traffic: null });
    this.load(this.tab());
  }

  load(tab: AnalyticsTab, force = false): void {
    if (this.busy() !== null) return;
    if (!force && this.hasData(tab)) return;

    this.busy.set(tab);
    this.setError(tab, null);

    const period = { from: this.from || null, to: this.to || null };
    const done = () => this.busy.set(null);
    const fail = (e: HttpErrorResponse) => {
      done();
      const msg = extractErrorMessage(e) ?? 'Không tải được thống kê.';
      this.setError(tab, msg);
      this.notify.error(msg);
    };

    switch (tab) {
      case 'auth':
        this.api.authAnalytics({ ...period, groupBy: this.groupBy }).subscribe({
          next: (r) => {
            this.auth.set(r);
            done();
          },
          error: fail,
        });
        return;
      case 'interview':
        this.api.interviewAnalytics({ ...period, groupBy: this.groupBy }).subscribe({
          next: (r) => {
            this.interview.set(r);
            done();
          },
          error: fail,
        });
        return;
      case 'campaign':
        this.api.campaignAnalytics({ ...period, groupBy: this.groupBy }).subscribe({
          next: (r) => {
            this.campaign.set(r);
            done();
          },
          error: fail,
        });
        return;
      case 'traffic':
        this.api.paymentTraffic({ ...period, groupBy: this.trafficGroupBy }).subscribe({
          next: (r) => {
            this.traffic.set(r);
            done();
          },
          error: fail,
        });
        return;
    }
  }

  private hasData(tab: AnalyticsTab): boolean {
    switch (tab) {
      case 'auth':
        return this.auth() !== null;
      case 'interview':
        return this.interview() !== null;
      case 'campaign':
        return this.campaign() !== null;
      case 'traffic':
        return this.traffic() !== null;
    }
  }

  private setError(tab: AnalyticsTab, message: string | null): void {
    this.errors.update((e) => ({ ...e, [tab]: message }));
  }
}
