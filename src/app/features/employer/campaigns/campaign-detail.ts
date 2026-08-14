import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatInputModule } from '@angular/material/input';
import { MatTooltipModule } from '@angular/material/tooltip';
import { extractErrorMessage } from '../../../core/api/http-utils';
import { CampaignApi } from '../../../core/api/campaign.api';
import { NotifyService } from '../../../core/notify.service';
import {
  CAMPAIGN_LANGUAGE_OPTIONS,
  CAMPAIGN_SENIORITY_OPTIONS,
  CampaignResponse,
  CampaignLanguage,
  CampaignSeniority,
  CampaignStatus,
  CreateInvitationsResponse,
  CriterionLevelItem,
  JOB_NEED_CATEGORY_LABELS,
  JobNeedCategory,
  JobNeedInput,
} from '../../../core/models';
import { Spinner } from '../../../shared/ui/spinner';
import { RubricScaleStrip } from '../../../shared/rubric/rubric-scale-strip';

const STATUS_LABEL: Record<CampaignStatus, string> = {
  Draft: 'Nháp',
  Active: 'Đang chạy',
  Closed: 'Đã đóng',
  Archived: 'Lưu trữ',
};

@Component({
  selector: 'app-campaign-detail',
  imports: [
    RouterLink,
    FormsModule,
    DatePipe,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatChipsModule,
    MatDividerModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatTooltipModule,
    Spinner,
    RubricScaleStrip,
  ],
  template: `
    <div class="head">
      <button mat-icon-button routerLink="/employer/campaigns" aria-label="Quay lại">
        <mat-icon>arrow_back</mat-icon>
      </button>
      <h1>Chi tiết chiến dịch</h1>
    </div>

    @if (loading()) {
      <app-spinner message="Đang tải..." />
    } @else if (campaign(); as c) {
      <mat-card class="section">
        <div class="title-line">
          <h2>{{ c.title }}</h2>
          <span class="chip" [class]="c.status.toLowerCase()">{{ statusLabel(c.status) }}</span>
        </div>
        @if (c.domain) {
          <p class="domain"><mat-icon>work</mat-icon>{{ c.domain }}</p>
        }

        <div class="grid">
          <div class="item">
            <span class="k">Cấp độ ứng viên</span>
            <span class="v">{{ seniorityLabel(c.seniority) }}</span>
          </div>
          <div class="item">
            <span class="k">Ngôn ngữ bài phỏng vấn</span>
            <span class="v">{{ languageLabel(c.language) }}</span>
          </div>
          <div class="item">
            <span class="k">Số ứng viên tối đa</span>
            <span class="v">{{ c.maxCandidates ?? '—' }}</span>
          </div>
          <div class="item">
            <span class="k">Thi cùng lúc tối đa</span>
            <span class="v">{{ c.maxConcurrentInterviews ?? 'Không giới hạn' }}</span>
          </div>
          <div class="item">
            <span class="k">Thời gian mỗi câu</span>
            <span class="v">{{ c.timeLimitMinutes ? c.timeLimitMinutes + ' phút' : '—' }}</span>
          </div>
          <div class="item">
            <span class="k">Điểm đạt</span>
            <span class="v">{{ c.passScorePct != null ? c.passScorePct + '%' : '—' }}</span>
          </div>
          <div class="item">
            <span class="k">Chống gian lận</span>
            <span class="v">{{ c.antiCheatEnabled ? 'Bật' : 'Tắt' }}</span>
          </div>
          <div class="item">
            <span class="k">Xác thực khuôn mặt</span>
            <span class="v">{{ c.faceVerifyEnabled ? 'Bật' : 'Tắt' }}</span>
          </div>
          <div class="item">
            <span class="k">Phỏng vấn thích ứng</span>
            <span class="v">
              {{ c.adaptiveEnabled ? 'Bật' : 'Tắt' }}
              @if (c.adaptiveEnabled) {
                · tối đa {{ c.maxFollowUps ?? '—' }} câu hỏi thêm, {{ c.maxQuestions ?? '—' }} tổng
              }
            </span>
          </div>
          <div class="item">
            <span class="k">Bắt đầu</span>
            <span class="v">{{ c.startsAt ? (c.startsAt | date: 'dd/MM/yyyy HH:mm') : '—' }}</span>
          </div>
          <div class="item">
            <span class="k">Kết thúc</span>
            <span class="v">{{ c.expiresAt ? (c.expiresAt | date: 'dd/MM/yyyy HH:mm') : '—' }}</span>
          </div>
          <div class="item">
            <span class="k">Tạo lúc</span>
            <span class="v">{{ c.createdAt | date: 'dd/MM/yyyy HH:mm' }}</span>
          </div>
        </div>

        @if (c.jdText) {
          <mat-divider />
          <h3>Mô tả công việc (JD)</h3>
          <p class="jd">{{ c.jdText }}</p>
        }

        @if (c.criteriaText) {
          <mat-divider />
          <h3>Mô tả tiêu chí</h3>
          <p class="jd">{{ c.criteriaText }}</p>
        }
      </mat-card>

      <!--
        Tài liệu PDF. Chỉ có đường tải lên/tải về — CampaignResponse KHÔNG trả tên hay đường dẫn
        file, nên FE không biết trước slot nào đã có file; bấm tải mà chưa có thì backend trả 404
        và ta hiện thông báo tử tế thay vì "lỗi hệ thống".
      -->
      <mat-card class="section">
        <h3>Tài liệu đính kèm (PDF)</h3>
        <p class="muted">
          Tối đa 10MB mỗi file. <strong>Đã nhập nội dung dạng chữ ở trên thì phần chữ được ưu
          tiên</strong> — hệ thống sẽ bỏ qua file gửi kèm cho đúng mục đó (JD hoặc Tiêu chí), chứ
          không báo lỗi.
        </p>

        <div class="file-row">
          <span class="file-lbl">Mô tả công việc (JD)</span>
          <input
            #jdInput
            type="file"
            accept="application/pdf,.pdf"
            (change)="pickJd($any($event.target).files)"
          />
          <button mat-button [disabled]="busy()" (click)="download('jd')">
            <mat-icon>download</mat-icon> Tải file hiện có
          </button>
        </div>

        <div class="file-row">
          <span class="file-lbl">Tiêu chí đánh giá</span>
          <input
            #critInput
            type="file"
            accept="application/pdf,.pdf"
            (change)="pickCriteria($any($event.target).files)"
          />
          <button mat-button [disabled]="busy()" (click)="download('criteria')">
            <mat-icon>download</mat-icon> Tải file hiện có
          </button>
        </div>

        <div class="file-actions">
          <button
            mat-flat-button
            color="primary"
            [disabled]="busy() || !hasPickedFile()"
            (click)="uploadFiles(false)"
          >
            <mat-icon>upload_file</mat-icon> Tải lên
          </button>
          <!--
            Thay file chỉ chạy khi Draft (backend 409 với trạng thái khác) → ẩn hẳn nút cho các
            trạng thái kia thay vì để HR bấm rồi ăn lỗi.
          -->
          @if (c.status === 'Draft') {
            <button
              mat-stroked-button
              [disabled]="busy() || !hasPickedFile()"
              (click)="uploadFiles(true)"
            >
              <mat-icon>find_replace</mat-icon> Thay file đã có
            </button>
          }
        </div>
      </mat-card>

      <mat-card class="section">
        <div class="sec-head">
          <h3>Tiêu chí đánh giá ({{ c.criteria.length }})</h3>
          @if (c.rubricVersion; as v) {
            <span class="ruler-chip" [matTooltip]="rulerTooltip(c)" data-testid="ruler-chip"
              >Thước đo v{{ v }}</span
            >
          }
        </div>

        @if (c.status === 'Active') {
          <p class="ruler-note" data-testid="active-ruler-banner">
            Chiến dịch đang chạy. Sửa mốc điểm sẽ tạo
            <strong>thước đo v{{ nextRubricVersion(c) }}</strong> và chỉ áp cho ứng viên thi
            <strong>SAU khi lưu</strong> — người đã chấm bằng thước đo v{{ currentRubricVersion(c) }}
            giữ nguyên điểm.
          </p>
        }

        @if (c.criteria.length === 0) {
          <p class="muted">Chưa có tiêu chí.</p>
        } @else {
          <div class="crit-list">
            @for (cr of c.criteria; track cr.id) {
              <div class="crit">
                <div class="crit-main">
                  <strong>{{ cr.name }}</strong>
                  @if (cr.description) {
                    <span class="muted">{{ cr.description }}</span>
                  }
                </div>
                <div class="crit-meta">
                  <span class="pct">{{ (cr.weight * 100).toFixed(0) }}%</span>
                  <span class="muted">tối đa {{ cr.maxScore }}</span>
                </div>
              </div>
              <!--
                Mốc điểm chỉ ĐỌC ở đây. Không có mốc là trạng thái hợp lệ nhưng đáng nêu: lúc đó
                bộ chấm không có mô tả nào để bám, nên không phân biệt được 3 với 6 điểm.
              -->
              <app-rubric-scale-strip
                [maxScore]="cr.maxScore"
                [levels]="levelsOf(cr)"
                [criterionName]="''"
              />
              @if (levelsOf(cr).length > 0) {
                <ul class="lv-list">
                  @for (l of sortedLevels(levelsOf(cr)); track l.score) {
                    <li><strong>{{ l.score }}</strong> — {{ l.descriptor }}</li>
                  }
                </ul>
              }
            }
          </div>
        }
      </mat-card>

      <!--
        NHU CẦU CÔNG VIỆC — thước đo dùng để SÀNG CV, khác hẳn "Tiêu chí đánh giá" ở trên (thước
        chấm buổi phỏng vấn). Tách hai thứ vì CV là giấy: không quan sát được "giao tiếp" hay
        "tư duy phân tích" từ một trang PDF, ép chấm thì mô hình chỉ đoán.

        Chốt MỘT LẦN cho cả chiến dịch (không suy lại theo từng CV) để mọi ứng viên được đo bằng
        cùng một thước — cùng lý do CAMP-10 bắt mọi người nhận cùng bộ câu hỏi.
      -->
      <mat-card class="section" data-testid="job-needs-section">
        <div class="sec-head">
          <h3>Nhu cầu công việc — dùng để sàng CV ({{ c.jobNeeds.length }})</h3>
          @if (c.status === 'Draft' && !editingNeeds()) {
            <button mat-stroked-button (click)="startEditNeeds(c)" data-testid="edit-job-needs">
              <mat-icon>edit</mat-icon> Sửa
            </button>
          }
        </div>

        @if (c.status === 'Draft') {
          <p class="ruler-note">
            Hệ thống đọc JD và đề xuất sẵn khi xuất bản; bạn sửa lại cho đúng nhu cầu thật. Sau khi
            xuất bản thì <strong>không sửa được nữa</strong> — đổi thước giữa chừng thì ứng viên
            sàng trước và sàng sau không so sánh được với nhau.
          </p>
        }

        @if (editingNeeds()) {
          <div class="need-edit">
            @for (n of needDrafts(); track $index) {
              <div class="need-row">
                <mat-form-field appearance="outline" class="n-cat">
                  <mat-label>Nhóm</mat-label>
                  <mat-select [(ngModel)]="n.category">
                    @for (opt of needCategories; track opt.value) {
                      <mat-option [value]="opt.value">{{ opt.label }}</mat-option>
                    }
                  </mat-select>
                </mat-form-field>
                <mat-form-field appearance="outline" class="n-text">
                  <mat-label>Nhu cầu</mat-label>
                  <input matInput [(ngModel)]="n.text" placeholder="vd: Thạo .NET ở mức làm production" />
                </mat-form-field>
                <button mat-icon-button (click)="removeNeed($index)" [attr.aria-label]="'Xoá dòng'">
                  <mat-icon>delete</mat-icon>
                </button>
              </div>
            }
            <div class="need-actions">
              <button mat-button (click)="addNeed()"><mat-icon>add</mat-icon> Thêm nhu cầu</button>
              <span class="spacer"></span>
              <button mat-button (click)="cancelEditNeeds()">Huỷ</button>
              <button mat-flat-button color="primary" [disabled]="busy()" (click)="saveNeeds()">
                Lưu
              </button>
            </div>
          </div>
        } @else if (c.jobNeeds.length === 0) {
          <p class="muted">
            Chưa chốt nhu cầu công việc — chưa sàng CV được. Xuất bản chiến dịch để hệ thống đề xuất
            từ JD, hoặc tự khai bằng nút “Sửa”.
          </p>
        } @else {
          <ul class="need-view">
            @for (n of c.jobNeeds; track n.needId) {
              <li>
                <span class="n-tag">{{ needCategoryLabel(n.category) }}</span>
                {{ n.text }}
              </li>
            }
          </ul>
        }
      </mat-card>

      <mat-card class="section">
        <h3>Câu hỏi ({{ c.questions.length }})</h3>
        @if (c.questions.length === 0) {
          <p class="muted">Chưa có câu hỏi.</p>
        } @else {
          <ol class="q-list">
            @for (q of c.questions; track q.id) {
              <li>
                {{ q.questionText }}
                @if (q.isRequired) {
                  <span class="req">Bắt buộc</span>
                }
              </li>
            }
          </ol>
        }
      </mat-card>

      <mat-card class="section actions-card">
        <a mat-stroked-button [routerLink]="['/employer/campaigns', c.id, 'slots']">
          <mat-icon>schedule</mat-icon>
          Khung giờ phỏng vấn
        </a>
        <a mat-stroked-button [routerLink]="['/employer/campaigns', c.id, 'invitations']">
          <mat-icon>mail</mat-icon>
          Lời mời đã gửi
        </a>
      </mat-card>

      <!--
        Chiến dịch đang chạy vẫn phải có đường vào biểu mẫu: backend nay cho sửa tiêu chí + mốc
        điểm ở trạng thái này (câu hỏi thì không). Thiếu lối vào ở đây thì cả quyền vừa mở ra
        không ai dùng được — đúng kiểu tính năng "có mà không tới được".
      -->
      @if (c.status === 'Active') {
        <mat-card class="section actions-card">
          <a
            mat-stroked-button
            color="primary"
            [routerLink]="['/employer/campaigns', c.id, 'edit']"
            data-testid="edit-ruler-link"
          >
            <mat-icon>tune</mat-icon>
            Sửa tiêu chí & mốc điểm
          </a>
          <span class="muted">Câu hỏi đã chốt, không sửa được nữa.</span>
        </mat-card>
      }

      <!-- Actions theo trạng thái -->
      @if (c.status === 'Draft') {
        <mat-card class="section actions-card">
          <a mat-flat-button color="primary" [routerLink]="['/employer/campaigns', c.id, 'edit']">
            <mat-icon>edit</mat-icon>
            Sửa
          </a>
          @if (confirmPublish()) {
            <span class="confirm">
              Xuất bản chiến dịch? Sau khi xuất bản, CÂU HỎI không sửa được nữa (mọi ứng viên phải nhận cùng bộ đề). Tiêu chí và mốc điểm vẫn sửa được, nhưng mỗi lần sửa sẽ tạo một phiên bản thước đo mới.
              <button mat-flat-button color="primary" [disabled]="busy()" (click)="publish()">
                Xác nhận
              </button>
              <button mat-button (click)="confirmPublish.set(false)">Huỷ</button>
            </span>
          } @else {
            <button mat-stroked-button color="primary" (click)="confirmPublish.set(true)">
              <mat-icon>publish</mat-icon>
              Xuất bản
            </button>
          }
          @if (confirmDelete()) {
            <span class="confirm">
              Xoá chiến dịch này?
              <button mat-flat-button color="warn" [disabled]="busy()" (click)="remove()">
                Xoá
              </button>
              <button mat-button (click)="confirmDelete.set(false)">Huỷ</button>
            </span>
          } @else {
            <button mat-stroked-button color="warn" (click)="confirmDelete.set(true)">
              <mat-icon>delete</mat-icon>
              Xoá
            </button>
          }
        </mat-card>
      }

      @if (c.status === 'Active') {
        <mat-card class="section">
          <h3>Mời ứng viên</h3>
          <p class="muted">Nhập danh sách email, mỗi email 1 dòng hoặc cách nhau bởi dấu phẩy.</p>
          <mat-form-field appearance="outline" class="full">
            <mat-label>Email ứng viên</mat-label>
            <textarea
              matInput
              rows="3"
              [(ngModel)]="emailsText"
              placeholder="a@example.com&#10;b@example.com"
            ></textarea>
          </mat-form-field>
          <button mat-flat-button color="primary" [disabled]="busy()" (click)="invite()">
            <mat-icon>send</mat-icon>
            Gửi lời mời
          </button>

          @if (inviteResult(); as r) {
            @if (r.created.length > 0) {
              <div class="res-block">
                <strong>Đã mời ({{ r.created.length }})</strong>
                @for (inv of r.created; track inv.id) {
                  <div class="res-row">
                    <span>{{ inv.email }}</span>
                    <button
                      mat-button
                      [disabled]="busy()"
                      (click)="reissue(c.id, inv.id)"
                    >
                      Gửi lại
                    </button>
                  </div>
                }
              </div>
            }
            @if (r.failed.length > 0) {
              <div class="res-block fail">
                <strong>Thất bại ({{ r.failed.length }})</strong>
                @for (f of r.failed; track f.email) {
                  <div class="res-row">
                    <span>{{ f.email }}</span>
                    <span class="muted">{{ f.reason }}</span>
                  </div>
                }
              </div>
            }
          }
        </mat-card>

        <mat-card class="section actions-card">
          <a mat-stroked-button [routerLink]="['/employer/campaigns', c.id, 'results']">
            <mat-icon>leaderboard</mat-icon>
            Xem kết quả
          </a>
          <a mat-stroked-button [routerLink]="['/employer/campaigns', c.id, 'candidates']">
            <mat-icon>filter_alt</mat-icon>
            Lọc CV
          </a>
          @if (confirmClose()) {
            <span class="confirm">
              Đóng chiến dịch?
              <button mat-flat-button color="warn" [disabled]="busy()" (click)="transition('Closed')">
                Đóng
              </button>
              <button mat-button (click)="confirmClose.set(false)">Huỷ</button>
            </span>
          } @else {
            <button mat-stroked-button color="warn" (click)="confirmClose.set(true)">
              <mat-icon>lock</mat-icon>
              Đóng chiến dịch
            </button>
          }
        </mat-card>
      }

      @if (c.status === 'Closed') {
        <mat-card class="section actions-card">
          <a mat-stroked-button [routerLink]="['/employer/campaigns', c.id, 'results']">
            <mat-icon>leaderboard</mat-icon>
            Xem kết quả
          </a>
          @if (confirmArchive()) {
            <span class="confirm">
              Lưu trữ chiến dịch?
              <button
                mat-flat-button
                color="primary"
                [disabled]="busy()"
                (click)="transition('Archived')"
              >
                Lưu trữ
              </button>
              <button mat-button (click)="confirmArchive.set(false)">Huỷ</button>
            </span>
          } @else {
            <button mat-stroked-button (click)="confirmArchive.set(true)">
              <mat-icon>inventory_2</mat-icon>
              Lưu trữ
            </button>
          }
        </mat-card>
      }

      @if (c.status === 'Archived') {
        <mat-card class="section actions-card">
          <a mat-stroked-button [routerLink]="['/employer/campaigns', c.id, 'results']">
            <mat-icon>leaderboard</mat-icon>
            Xem kết quả
          </a>
        </mat-card>
      }
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
      .section {
        padding: 20px;
        margin-bottom: 16px;
      }
      h2 {
        margin: 0;
      }
      h3 {
        margin: 16px 0 12px;
        font-size: 16px;
      }
      .section h3:first-child {
        margin-top: 0;
      }
      .title-line {
        display: flex;
        align-items: center;
        gap: 12px;
        flex-wrap: wrap;
      }
      .domain {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        color: var(--mat-sys-on-surface-variant);
        margin: 8px 0 0;
      }
      .domain mat-icon {
        font-size: 18px;
        height: 18px;
        width: 18px;
      }
      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
        gap: 16px;
        margin-top: 16px;
      }
      .item {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .k {
        font-size: 12px;
        color: var(--mat-sys-on-surface-variant);
      }
      .v {
        font-weight: 500;
      }
      .jd {
        white-space: pre-wrap;
        color: var(--mat-sys-on-surface-variant);
        margin: 0;
      }
      .muted {
        color: var(--mat-sys-on-surface-variant);
        font-size: 14px;
      }
      .sec-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        flex-wrap: wrap;
      }
      .ruler-chip {
        padding: 3px 10px;
        border-radius: 12px;
        font-size: 12px;
        background: var(--mat-sys-secondary-container);
        color: var(--mat-sys-on-secondary-container);
      }
      .ruler-note {
        margin: 4px 0 12px;
        padding: 8px 12px;
        border-radius: 8px;
        font-size: 12px;
        background: var(--mat-sys-secondary-container);
        color: var(--mat-sys-on-secondary-container);
      }
      .lv-list {
        margin: 0 0 14px;
        padding-left: 18px;
        font-size: 12px;
        color: var(--mat-sys-on-surface-variant);
      }
      .lv-list li {
        margin-bottom: 3px;
      }
      .need-view {
        margin: 0;
        padding-left: 18px;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .n-tag {
        display: inline-block;
        margin-right: 8px;
        padding: 1px 8px;
        border-radius: 999px;
        font-size: 12px;
        border: 1px solid var(--mat-sys-outline-variant);
        color: var(--mat-sys-on-surface-variant);
      }
      .need-edit {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .need-row {
        display: flex;
        gap: 12px;
        align-items: center;
      }
      .n-cat {
        width: 170px;
      }
      .n-text {
        flex: 1;
      }
      .need-actions {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .crit-list {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .crit {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 12px;
        padding: 10px 12px;
        border-radius: 8px;
        background: var(--mat-sys-surface-variant);
      }
      .crit-main {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .crit-meta {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .pct {
        font-weight: 600;
        color: var(--mat-sys-primary);
      }
      .q-list {
        margin: 0;
        padding-left: 20px;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .req {
        font-size: 11px;
        margin-left: 8px;
        padding: 1px 8px;
        border-radius: 10px;
        background: var(--mat-sys-primary-container);
        color: var(--mat-sys-on-primary-container);
      }
      .actions-card {
        display: flex;
        gap: 12px;
        flex-wrap: wrap;
        align-items: center;
      }
      .confirm {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
        font-size: 14px;
        color: var(--mat-sys-on-surface-variant);
      }
      .full {
        width: 100%;
      }
      .file-row {
        display: flex;
        align-items: center;
        gap: 12px;
        flex-wrap: wrap;
        padding: 8px 0;
      }
      .file-lbl {
        min-width: 180px;
        font-weight: 500;
      }
      .file-actions {
        display: flex;
        gap: 12px;
        flex-wrap: wrap;
        margin-top: 12px;
      }
      .res-block {
        margin-top: 16px;
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .res-block.fail strong {
        color: var(--mat-sys-error);
      }
      .res-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 12px;
        padding: 4px 0;
        border-bottom: 1px solid var(--mat-sys-outline-variant);
      }
      .chip {
        font-size: 12px;
        font-weight: 500;
        padding: 2px 10px;
        border-radius: 12px;
        white-space: nowrap;
      }
      .chip.draft {
        background: var(--mat-sys-surface-variant);
        color: var(--mat-sys-on-surface-variant);
      }
      .chip.active {
        background: var(--mat-sys-primary-container);
        color: var(--mat-sys-on-primary-container);
      }
      .chip.closed {
        background: var(--mat-sys-tertiary-container);
        color: var(--mat-sys-on-tertiary-container);
      }
      .chip.archived {
        background: var(--mat-sys-surface-variant);
        color: var(--mat-sys-outline);
      }
    `,
  ],
})
export class CampaignDetail implements OnInit {
  private api = inject(CampaignApi);
  private notify = inject(NotifyService);
  private router = inject(Router);

  readonly campaignId = input.required<string>();

  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly campaign = signal<CampaignResponse | null>(null);

  readonly confirmPublish = signal(false);
  readonly confirmDelete = signal(false);
  readonly confirmClose = signal(false);
  readonly confirmArchive = signal(false);

  emailsText = '';
  readonly inviteResult = signal<CreateInvitationsResponse | null>(null);

  // ── Nhu cầu công việc (thước sàng CV) ──────────────────────────────────────
  readonly editingNeeds = signal(false);
  readonly needDrafts = signal<JobNeedInput[]>([]);
  readonly needCategories = (Object.keys(JOB_NEED_CATEGORY_LABELS) as JobNeedCategory[]).map(
    (value) => ({ value, label: JOB_NEED_CATEGORY_LABELS[value] }),
  );

  needCategoryLabel(category: string): string {
    return JOB_NEED_CATEGORY_LABELS[category as JobNeedCategory] ?? category;
  }

  startEditNeeds(c: CampaignResponse): void {
    // Chép cả `needId` sang bản nháp: gửi lại id đang có thì kết quả sàng đã lưu còn trỏ đúng dòng
    // (mẫu F10 giữ id câu hỏi qua vòng đọc→sửa→lưu). Không chép thì mỗi lần Lưu là thay id mới.
    this.needDrafts.set(
      c.jobNeeds.map((n) => ({ needId: n.needId, category: n.category, text: n.text })),
    );
    this.editingNeeds.set(true);
  }

  cancelEditNeeds(): void {
    this.editingNeeds.set(false);
    this.needDrafts.set([]);
  }

  addNeed(): void {
    this.needDrafts.update((list) => [...list, { category: 'Technical', text: '' }]);
  }

  removeNeed(index: number): void {
    this.needDrafts.update((list) => list.filter((_, i) => i !== index));
  }

  saveNeeds(): void {
    const needs = this.needDrafts()
      .map((n) => ({ ...n, text: n.text.trim() }))
      .filter((n) => n.text.length > 0);
    this.busy.set(true);
    this.api.updateJobNeeds(this.campaignId(), needs).subscribe({
      next: (c) => {
        this.campaign.set(c);
        this.busy.set(false);
        this.cancelEditNeeds();
        this.notify.success('Đã lưu nhu cầu công việc.');
      },
      error: (e: HttpErrorResponse) => {
        this.busy.set(false);
        this.notify.error(extractErrorMessage(e) ?? 'Lưu nhu cầu công việc thất bại.');
      },
    });
  }

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.loading.set(true);
    this.api.getCampaign(this.campaignId()).subscribe({
      next: (c) => {
        this.campaign.set(c);
        this.loading.set(false);
      },
      error: (e: HttpErrorResponse) => {
        this.loading.set(false);
        this.notify.error(extractErrorMessage(e) ?? 'Không tải được chiến dịch.');
        this.router.navigate(['/employer/campaigns']);
      },
    });
  }

  statusLabel(s: CampaignStatus): string {
    return STATUS_LABEL[s];
  }

  /**
   * Mốc điểm của một tiêu chí, đọc PHÒNG THỦ.
   *
   * Kiểu khai `levels` là bắt buộc theo hợp đồng backend, nhưng chiến dịch tạo trước tính năng
   * này (hoặc deploy backend cũ hơn) trả về `undefined` lúc chạy — và `undefined.length` ở template
   * làm trắng cả trang chi tiết. Bọc trong hàm thay vì `?? []` ngay trong template để trình biên
   * dịch không báo "toán tử ?? thừa" (nó tin kiểu, còn ta phải sống với dữ liệu thật).
   */
  levelsOf(cr: { levels: CriterionLevelItem[] }): CriterionLevelItem[] {
    return cr.levels ?? [];
  }

  /** Mốc điểm đọc theo thứ tự TĂNG DẦN — ở màn chỉ-đọc thì đọc như một cái thang là tự nhiên nhất. */
  sortedLevels(levels: CriterionLevelItem[]): CriterionLevelItem[] {
    return [...levels].sort((a, b) => a.score - b.score);
  }

  /**
   * Phiên bản thước đo đang dùng. Kiểu khai là bắt buộc nhưng chiến dịch cũ trả `undefined` lúc
   * chạy — bọc trong hàm để trình biên dịch không coi `?? 1` là thừa (nó tin kiểu, ta tin dữ liệu).
   */
  currentRubricVersion(c: CampaignResponse): number {
    return c.rubricVersion ?? 1;
  }

  /** Số phiên bản sẽ nhận nếu sửa mốc bây giờ. */
  nextRubricVersion(c: CampaignResponse): number {
    return this.currentRubricVersion(c) + 1;
  }

  rulerTooltip(c: CampaignResponse): string {
    if (!c.rubricVersionUpdatedAt) return 'Thước đo gốc — chưa ai sửa mốc điểm.';
    const when = new Date(c.rubricVersionUpdatedAt).toLocaleString('vi-VN');
    return c.rubricVersionUpdatedBy
      ? `Sửa lần cuối ${when} bởi ${c.rubricVersionUpdatedBy}`
      : `Sửa lần cuối ${when}`;
  }

  /** Chiến dịch cũ (trước khi có cột) không trả seniority → nói rõ mặc định, không hiện ô trống. */
  seniorityLabel(s: CampaignSeniority | null | undefined): string {
    if (!s) return 'Junior (mặc định)';
    return CAMPAIGN_SENIORITY_OPTIONS.find((o) => o.value === s)?.label ?? s;
  }

  /** Cùng lý do như seniority: chiến dịch cũ không trả language → nói rõ mặc định backend. */
  languageLabel(l: CampaignLanguage | null | undefined): string {
    if (!l) return 'Tiếng Việt (mặc định)';
    return CAMPAIGN_LANGUAGE_OPTIONS.find((o) => o.value === l)?.label ?? l;
  }

  // ── Tài liệu PDF ────────────────────────────────────────────────────────────
  private jdFile: File | null = null;
  private criteriaFile: File | null = null;
  readonly picked = signal<string[]>([]);

  pickJd(files: FileList | null): void {
    this.jdFile = files?.[0] ?? null;
    this.syncPicked();
  }
  pickCriteria(files: FileList | null): void {
    this.criteriaFile = files?.[0] ?? null;
    this.syncPicked();
  }
  private syncPicked(): void {
    const names: string[] = [];
    if (this.jdFile) names.push(this.jdFile.name);
    if (this.criteriaFile) names.push(this.criteriaFile.name);
    this.picked.set(names);
  }
  hasPickedFile(): boolean {
    return this.picked().length > 0;
  }

  /** `replace = true` → PUT (chỉ Draft); false → POST (đính kèm lần đầu). */
  uploadFiles(replace: boolean): void {
    const files = { jdFile: this.jdFile, criteriaFile: this.criteriaFile };
    if (!files.jdFile && !files.criteriaFile) {
      this.notify.warn('Chọn ít nhất 1 file PDF.');
      return;
    }
    this.busy.set(true);
    const req = replace
      ? this.api.updateCampaignFiles(this.campaignId(), files)
      : this.api.uploadCampaignFiles(this.campaignId(), files);

    req.subscribe({
      next: (c) => {
        this.busy.set(false);
        this.jdFile = null;
        this.criteriaFile = null;
        this.syncPicked();
        this.campaign.set(c);
        this.notify.success(replace ? 'Đã thay file.' : 'Đã tải file lên.');
      },
      error: (e: HttpErrorResponse) => {
        this.busy.set(false);
        if (e.status === 409) {
          this.notify.warn(
            extractErrorMessage(e) ??
              'Chỉ thay được file khi chiến dịch còn ở trạng thái Nháp.',
          );
          return;
        }
        this.notify.error(extractErrorMessage(e) ?? 'Tải file thất bại.');
      },
    });
  }

  /**
   * Tải file đã đính kèm. Endpoint đòi JWT và trả thẳng bytes PDF ⇒ phải lấy blob qua HttpClient
   * (mở URL trần bằng thẻ a sẽ 401 vì thiếu header).
   */
  download(fileType: 'jd' | 'criteria'): void {
    this.busy.set(true);
    this.api.downloadCampaignFile(this.campaignId(), fileType).subscribe({
      next: (blob) => {
        this.busy.set(false);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `campaign-${this.campaignId()}-${fileType}.pdf`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      },
      error: (e: HttpErrorResponse) => {
        this.busy.set(false);
        // 404 = chưa đính kèm file cho mục này. Đây là trạng thái BÌNH THƯỜNG (JD nhập tay là
        // đủ), không phải hỏng hóc → thông báo nhẹ, không dùng error đỏ.
        if (e.status === 404) {
          this.notify.warn(
            fileType === 'jd'
              ? 'Chiến dịch chưa đính kèm file JD.'
              : 'Chiến dịch chưa đính kèm file tiêu chí.',
          );
          return;
        }
        this.notify.error(extractErrorMessage(e) ?? 'Tải file thất bại.');
      },
    });
  }

  publish(): void {
    this.busy.set(true);
    this.api.publishCampaign(this.campaignId()).subscribe({
      next: (c) => {
        this.busy.set(false);
        this.confirmPublish.set(false);
        this.campaign.set(c);
        this.notify.success('Đã xuất bản chiến dịch.');
      },
      error: (e: HttpErrorResponse) => {
        this.busy.set(false);
        this.notify.error(extractErrorMessage(e) ?? 'Xuất bản thất bại.');
      },
    });
  }

  remove(): void {
    this.busy.set(true);
    this.api.deleteCampaign(this.campaignId()).subscribe({
      next: () => {
        this.busy.set(false);
        this.notify.success('Đã xoá chiến dịch.');
        this.router.navigate(['/employer/campaigns']);
      },
      error: (e: HttpErrorResponse) => {
        this.busy.set(false);
        this.notify.error(extractErrorMessage(e) ?? 'Xoá thất bại.');
      },
    });
  }

  transition(status: 'Closed' | 'Archived'): void {
    this.busy.set(true);
    this.api.transitionStatus(this.campaignId(), { status }).subscribe({
      next: (c) => {
        this.busy.set(false);
        this.confirmClose.set(false);
        this.confirmArchive.set(false);
        this.campaign.set(c);
        this.notify.success(status === 'Closed' ? 'Đã đóng chiến dịch.' : 'Đã lưu trữ chiến dịch.');
      },
      error: (e: HttpErrorResponse) => {
        this.busy.set(false);
        this.notify.error(extractErrorMessage(e) ?? 'Đổi trạng thái thất bại.');
      },
    });
  }

  private parseEmails(): string[] {
    return this.emailsText
      .split(/[\n,;]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }

  invite(): void {
    const emails = this.parseEmails();
    if (emails.length === 0) {
      this.notify.warn('Nhập ít nhất 1 email.');
      return;
    }
    this.busy.set(true);
    this.api.createInvitations(this.campaignId(), { emails }).subscribe({
      next: (r) => {
        this.busy.set(false);
        this.inviteResult.set(r);
        this.emailsText = '';
        if (r.created.length > 0) this.notify.success(`Đã mời ${r.created.length} ứng viên.`);
        if (r.failed.length > 0) this.notify.warn(`${r.failed.length} email không mời được.`);
      },
      error: (e: HttpErrorResponse) => {
        this.busy.set(false);
        this.notify.error(extractErrorMessage(e) ?? 'Gửi lời mời thất bại.');
      },
    });
  }

  reissue(campaignId: string, invitationId: string): void {
    this.busy.set(true);
    this.api.reissueInvitation(campaignId, invitationId).subscribe({
      next: () => {
        this.busy.set(false);
        this.notify.success('Đã gửi lại lời mời.');
      },
      error: (e: HttpErrorResponse) => {
        this.busy.set(false);
        this.notify.error(extractErrorMessage(e) ?? 'Gửi lại thất bại.');
      },
    });
  }
}
