import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import {
  InterviewFunding,
  PlanAudience,
  PlanRequest,
  PlanResponse,
} from '../../../core/models';

export interface PlanFormDialogData {
  /** null = tạo mới; có giá trị = sửa gói đó. */
  plan: PlanResponse | null;
}

export type PlanFormDialogResult = PlanRequest;

/**
 * Hộp thoại tạo/sửa gói thuê bao (S11 tiering).
 *
 * ⚠ PUT là REPLACE TOÀN BỘ: backend gán đè mọi field từ body, field bỏ sót nhận giá trị mặc
 * định của nó và ghi đè giá trị đang có. Nên form sửa nạp ĐỦ gói hiện tại vào state rồi gửi lại
 * nguyên vẹn — kể cả những field không hiện ra ô nhập.
 *
 * ⚠ `entitlementsJson` KHÔNG có trong `PlanResponse` (chỉ lộ `entitlementsVersion`), nên khi sửa
 * ta không biết giá trị cũ và buộc phải gửi mặc định `"[]"`. Đây là mất mát có thật của hợp đồng
 * hiện tại, không phải quên: muốn giữ được thì backend phải trả field đó ra.
 */
@Component({
  selector: 'app-plan-form-dialog',
  imports: [
    FormsModule,
    MatButtonModule,
    MatCheckboxModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
  ],
  template: `
    <h2 mat-dialog-title>
      <mat-icon class="ico">layers</mat-icon>
      {{ data.plan ? 'Sửa gói ' + data.plan.code : 'Tạo gói thuê bao' }}
    </h2>
    <mat-dialog-content>
      <div class="grid">
        <mat-form-field appearance="outline">
          <mat-label>Catalog *</mat-label>
          <mat-select [(ngModel)]="m.audience" name="audience" [disabled]="!!data.plan">
            <mat-option [value]="PlanAudience.B2C">B2C (cá nhân)</mat-option>
            <mat-option [value]="PlanAudience.B2B">B2B (tổ chức)</mat-option>
          </mat-select>
          <mat-hint>
            {{
              data.plan
                ? 'Không đổi catalog của gói đã tạo — ví đang dùng gói sẽ lệch audience.'
                : 'Ví cá nhân chỉ nhận gói B2C, ví tổ chức chỉ nhận gói B2B.'
            }}
          </mat-hint>
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Mã gói (code) *</mat-label>
          <input matInput maxlength="50" [(ngModel)]="m.code" name="code" placeholder="plus" />
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Tên hiển thị *</mat-label>
          <input matInput maxlength="100" [(ngModel)]="m.name" name="name" placeholder="Plus" />
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Bậc (rank)</mat-label>
          <input matInput type="number" min="0" [(ngModel)]="m.rank" name="rank" />
          <mat-hint>Tăng dần trong cùng catalog; 0 là thấp nhất.</mat-hint>
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Buổi phỏng vấn tính kiểu</mat-label>
          <mat-select [(ngModel)]="m.interviewFunding" name="interviewFunding">
            <mat-option [value]="InterviewFunding.Credit">Trừ credit</mat-option>
            <mat-option [value]="InterviewFunding.Metered">Quota tháng</mat-option>
            <mat-option [value]="InterviewFunding.Unlimited">Không giới hạn</mat-option>
          </mat-select>
          <mat-hint>Chọn "Không giới hạn" là gói không bao giờ thu tiền buổi thi.</mat-hint>
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Quota tháng</mat-label>
          <input matInput type="number" min="0" [(ngModel)]="m.monthlyQuota" name="monthlyQuota" />
          <mat-hint>Bỏ trống nếu không dùng quota.</mat-hint>
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Trần câu hỏi mỗi buổi</mat-label>
          <input matInput type="number" min="1" [(ngModel)]="m.maxQuestionsCap" name="maxQuestionsCap" />
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Số lần chấm lặp (self-consistency)</mat-label>
          <input matInput type="number" min="1" [(ngModel)]="m.selfConsistencyN" name="selfConsistencyN" />
          <mat-hint>Mỗi lần chấm thêm là một lần gọi AI có tính tiền.</mat-hint>
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Trần câu hỏi thích ứng</mat-label>
          <input
            matInput
            type="number"
            min="0"
            [(ngModel)]="m.adaptiveMaxQuestions"
            name="adaptiveMaxQuestions"
          />
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Trần câu đào sâu</mat-label>
          <input
            matInput
            type="number"
            min="0"
            [(ngModel)]="m.adaptiveMaxFollowups"
            name="adaptiveMaxFollowups"
          />
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Trần chiến dịch đang chạy (B2B)</mat-label>
          <input
            matInput
            type="number"
            min="0"
            [(ngModel)]="m.maxActiveCampaigns"
            name="maxActiveCampaigns"
          />
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Trần ứng viên (B2B)</mat-label>
          <input
            matInput
            type="number"
            min="0"
            [(ngModel)]="m.maxCandidatesCap"
            name="maxCandidatesCap"
          />
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Số chỗ ngồi (B2B)</mat-label>
          <input matInput type="number" min="0" [(ngModel)]="m.seatCount" name="seatCount" />
        </mat-form-field>
      </div>

      <div class="flags">
        <mat-checkbox [(ngModel)]="m.adaptiveEnabled" name="adaptiveEnabled">
          Phỏng vấn thích ứng
        </mat-checkbox>
        <mat-checkbox [(ngModel)]="m.groundingEnabled" name="groundingEnabled">
          Trích nguồn (grounding)
        </mat-checkbox>
        <mat-checkbox [(ngModel)]="m.cvAnalysisIncluded" name="cvAnalysisIncluded">
          Phân tích CV
        </mat-checkbox>
        <mat-checkbox [(ngModel)]="m.repoAnalysisIncluded" name="repoAnalysisIncluded">
          Phân tích repository
        </mat-checkbox>
        <mat-checkbox [(ngModel)]="m.roadmapEnabled" name="roadmapEnabled">
          Lộ trình ôn tập
        </mat-checkbox>
        <mat-checkbox [(ngModel)]="m.postpaidEligible" name="postpaidEligible">
          Được dùng trả sau (Postpaid)
        </mat-checkbox>
        <mat-checkbox [(ngModel)]="m.isActive" name="isActive">Đang bán</mat-checkbox>
      </div>

      @if (error(); as e) {
        <p class="err"><mat-icon inline>error</mat-icon> {{ e }}</p>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton mat-dialog-close>Huỷ</button>
      <button matButton="filled" (click)="confirm()">
        {{ data.plan ? 'Lưu gói' : 'Tạo gói' }}
      </button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      .ico {
        vertical-align: middle;
        margin-right: 6px;
      }
      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
        gap: 8px 12px;
      }
      .flags {
        display: flex;
        flex-wrap: wrap;
        gap: 4px 20px;
        margin-top: 8px;
      }
      .err {
        margin-top: 10px;
        padding: 8px 12px;
        border-radius: 8px;
        background: var(--mat-sys-error-container);
        color: var(--mat-sys-on-error-container);
        font-size: 13px;
      }
    `,
  ],
})
export class PlanFormDialog {
  readonly data = inject<PlanFormDialogData>(MAT_DIALOG_DATA);
  private ref = inject(MatDialogRef<PlanFormDialog, PlanFormDialogResult>);

  protected readonly PlanAudience = PlanAudience;
  protected readonly InterviewFunding = InterviewFunding;

  readonly error = signal<string | null>(null);

  /**
   * State là một `PlanRequest` ĐẦY ĐỦ — không phải "các field đã sửa". Đó là điều kiện để PUT
   * (replace toàn bộ) không âm thầm xoá cấu hình không hiện trên form.
   */
  m: PlanRequest = this.data.plan ? fromPlan(this.data.plan) : blankPlan();

  confirm(): void {
    const code = this.m.code?.trim() ?? '';
    const name = this.m.name?.trim() ?? '';
    if (!code) {
      this.error.set('Mã gói không được để trống.');
      return;
    }
    if (!name) {
      this.error.set('Tên hiển thị không được để trống.');
      return;
    }
    if (!this.m.selfConsistencyN || this.m.selfConsistencyN < 1) {
      this.error.set('Số lần chấm lặp phải ≥ 1.');
      return;
    }
    this.error.set(null);
    this.ref.close({
      ...this.m,
      code,
      name,
      rank: this.m.rank ?? 0,
      monthlyQuota: nullIfBlank(this.m.monthlyQuota),
      adaptiveMaxQuestions: nullIfBlank(this.m.adaptiveMaxQuestions),
      adaptiveMaxFollowups: nullIfBlank(this.m.adaptiveMaxFollowups),
      maxQuestionsCap: nullIfBlank(this.m.maxQuestionsCap),
      maxActiveCampaigns: nullIfBlank(this.m.maxActiveCampaigns),
      maxCandidatesCap: nullIfBlank(this.m.maxCandidatesCap),
      seatCount: nullIfBlank(this.m.seatCount),
    });
  }
}

/** Ô số để trống trả chuỗi rỗng chứ không phải null → chuẩn hoá trước khi gửi. */
function nullIfBlank(v: number | null | undefined): number | null {
  return v === null || v === undefined || (v as unknown as string) === '' ? null : Number(v);
}

/** Mặc định KHỚP mặc định C# của `PlanRequest` để tạo mới không lệch hợp đồng. */
export function blankPlan(): PlanRequest {
  return {
    audience: PlanAudience.B2C,
    code: '',
    name: '',
    rank: 0,
    interviewFunding: InterviewFunding.Credit,
    monthlyQuota: null,
    adaptiveEnabled: false,
    adaptiveMaxQuestions: null,
    adaptiveMaxFollowups: null,
    groundingEnabled: false,
    selfConsistencyN: 1,
    cvAnalysisIncluded: false,
    repoAnalysisIncluded: false,
    roadmapEnabled: false,
    maxQuestionsCap: null,
    maxActiveCampaigns: null,
    maxCandidatesCap: null,
    postpaidEligible: false,
    seatCount: null,
    entitlementsJson: '[]',
    entitlementsVersion: 1,
    isActive: true,
  };
}

/**
 * Dựng request từ gói đang có — chép MỌI field, kể cả field không có ô nhập trên form. Chép
 * thiếu ở đây là ghi mặc định đè lên cấu hình thật của gói đang bán.
 */
export function fromPlan(p: PlanResponse): PlanRequest {
  return {
    audience: p.audience,
    code: p.code,
    name: p.name,
    rank: p.rank,
    interviewFunding: p.interviewFunding,
    monthlyQuota: p.monthlyQuota ?? null,
    adaptiveEnabled: p.adaptiveEnabled,
    adaptiveMaxQuestions: p.adaptiveMaxQuestions ?? null,
    adaptiveMaxFollowups: p.adaptiveMaxFollowups ?? null,
    groundingEnabled: p.groundingEnabled,
    selfConsistencyN: p.selfConsistencyN,
    cvAnalysisIncluded: p.cvAnalysisIncluded,
    repoAnalysisIncluded: p.repoAnalysisIncluded,
    roadmapEnabled: p.roadmapEnabled,
    maxQuestionsCap: p.maxQuestionsCap ?? null,
    maxActiveCampaigns: p.maxActiveCampaigns ?? null,
    maxCandidatesCap: p.maxCandidatesCap ?? null,
    postpaidEligible: p.postpaidEligible,
    seatCount: p.seatCount ?? null,
    // `entitlementsJson` không có trong response ⇒ không giữ lại được giá trị cũ.
    entitlementsJson: '[]',
    entitlementsVersion: p.entitlementsVersion,
    isActive: p.isActive,
  };
}
