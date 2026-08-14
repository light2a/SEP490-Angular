import { HttpErrorResponse } from '@angular/common/http';
import { Component, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { CampaignApi } from '../../../core/api/campaign.api';
import { extractErrorMessage } from '../../../core/api/http-utils';
import {
  CAMPAIGN_LANGUAGE_OPTIONS,
  CampaignLanguage,
  JOB_CATEGORIES,
  JOB_CATEGORY_LABEL,
  JobCategory,
  SystemDefaultPreviewResponse,
} from '../../../core/models';

export interface SystemDefaultCriteriaDialogData {
  /** Số tiêu chí đang có — quyết định câu cảnh báo "sẽ THAY THẾ N tiêu chí". */
  currentCount: number;
  /** `domain` của chiến dịch (chuỗi TỰ DO do HR gõ). */
  domain?: string | null;
  /** Ngôn ngữ bài phỏng vấn của chiến dịch. */
  language?: CampaignLanguage | null;
}

export interface SystemDefaultCriteriaChoice {
  jobCategory: JobCategory;
  language: CampaignLanguage;
}

/**
 * `domain` là chuỗi TỰ DO (`"Fullstack"`, `"QA"`, `null`, `"backend dev"`…) trong khi bộ chuẩn chỉ
 * có ba nghề. Chỉ nhận khi khớp **chính xác** một mã nghề; mọi thứ khác trả `null` để hộp thoại
 * KHÔNG chọn sẵn gì.
 *
 * ⚠ Sáu chỗ khác trong hệ thống đang vá `domain` bằng `?? "BE"`. Mặc định ngầm về Backend chấp
 * nhận được khi nó chỉ ảnh hưởng prompt sinh câu hỏi; **không** chấp nhận được ở đây, vì lựa chọn
 * này quyết định cả THƯỚC ĐO mà ứng viên sẽ bị chấm.
 */
export function parseJobCategory(domain?: string | null): JobCategory | null {
  const v = (domain ?? '').trim().toUpperCase();
  return (JOB_CATEGORIES as readonly string[]).includes(v) ? (v as JobCategory) : null;
}

/**
 * Chép BỘ CHUẨN HỆ THỐNG theo nghề vào chiến dịch.
 *
 * Đây là **bản sao**, không phải tham chiếu: admin sửa bản gốc về sau sẽ không đụng tới chiến dịch
 * đang tuyển. Đổi lại, HR phải tự chọn nghề — hệ thống không đoán hộ.
 */
@Component({
  selector: 'app-system-default-criteria-dialog',
  imports: [
    FormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatProgressBarModule,
    MatSelectModule,
  ],
  template: `
    <h2 mat-dialog-title>Dùng bộ chuẩn theo nghề</h2>
    <mat-dialog-content>
      <p>
        Chép 7 tiêu chí chuẩn của hệ thống (kèm mốc điểm) vào chiến dịch này. Đây là một
        <strong>bản sao</strong> — sửa được sau khi chép, và quản trị viên đổi bộ gốc về sau cũng
        không ảnh hưởng chiến dịch của bạn.
      </p>

      <mat-form-field appearance="outline" class="full">
        <mat-label>Nhóm nghề</mat-label>
        <mat-select [(ngModel)]="jobCategory" data-testid="sd-job">
          @for (c of jobCategories; track c) {
            <mat-option [value]="c">{{ label(c) }}</mat-option>
          }
        </mat-select>
        @if (!jobCategory()) {
          <mat-hint>
            Bắt buộc chọn. Ô "Lĩnh vực" của chiến dịch là chữ tự do nên hệ thống không suy ra được
            nghề — mà lựa chọn này quyết định thước đo chấm ứng viên.
          </mat-hint>
        }
      </mat-form-field>

      <mat-form-field appearance="outline" class="full">
        <mat-label>Ngôn ngữ</mat-label>
        <mat-select [(ngModel)]="language" data-testid="sd-lang">
          @for (l of languages; track l.value) {
            <mat-option [value]="l.value">{{ l.label }}</mat-option>
          }
        </mat-select>
        <mat-hint>Lấy sẵn theo ngôn ngữ bài phỏng vấn của chiến dịch.</mat-hint>
      </mat-form-field>

      <!--
        XEM TRƯỚC: HR phải thấy mình sắp chép về cái gì. Thao tác chép GHI THẲNG DB và thay thế
        toàn bộ tiêu chí đang có, nên "bấm rồi xem" không phải một lựa chọn.
      -->
      @if (loading()) {
        <mat-progress-bar mode="indeterminate" data-testid="sd-loading" />
      }

      @if (notAvailable()) {
        <p class="warn" data-testid="sd-unavailable">
          <mat-icon>info</mat-icon>
          <span>
            Quản trị viên <strong>chưa soạn bộ chuẩn</strong> cho {{ label(jobCategory()!) }} ·
            {{ languageLabel() }}. Hãy chọn nghề hoặc ngôn ngữ khác, hoặc tự khai tiêu chí.
          </span>
        </p>
      } @else if (error(); as e) {
        <p class="warn" data-testid="sd-error"><mat-icon>error</mat-icon> <span>{{ e }}</span></p>
      } @else if (preview(); as p) {
        <div class="preview" data-testid="sd-preview">
          <p class="ptitle">
            {{ p.criteria.length }} tiêu chí sẽ được chép về (bộ chuẩn bản {{ p.version }}):
          </p>
          <ul>
            @for (c of p.criteria; track c.name) {
              <li>
                <span class="cname">{{ c.name }}</span>
                <span class="cmeta">{{ pct(c.weight) }}% · thang {{ c.maxScore }}</span>
                <!--
                  0 mốc là trạng thái HỢP LỆ (quản trị viên chưa khai) — tiêu chí đó rơi về dải mặc
                  định, vẫn chấm được. Nói ra để HR biết, KHÔNG chặn thao tác chép vì lý do này.
                -->
                @if (c.levelCount === 0) {
                  <span class="tag tag-warn" [attr.data-testid]="'sd-nolevels-' + $index"
                    >chưa có mốc</span
                  >
                } @else {
                  <span class="tag">{{ c.levelCount }} mốc</span>
                }
              </li>
            }
          </ul>
        </div>
      }

      <!--
        Bộ chuẩn sinh ra cho LUYỆN TẬP, nơi tiêu chí nội dung chỉ được chấm khi câu hỏi nhắm tới nó.
        Ở chiến dịch không có cơ chế đó ⇒ mọi tiêu chí được chấm ở mọi câu. Không nói ra thì HR sẽ
        đọc điểm B2B bằng kỳ vọng của bộ B2C.
      -->
      <p class="note" data-testid="sd-scope-note">
        <mat-icon>info</mat-icon>
        <span>
          Bộ này vốn dành cho <strong>luyện tập</strong>. Ở chiến dịch,
          <strong>mọi tiêu chí đều được chấm ở mọi câu</strong> — không có phần "chỉ chấm khi câu
          hỏi nhắm tới".
        </span>
      </p>

      @if (data.currentCount > 0) {
        <p class="warn" data-testid="sd-replace-warn">
          <mat-icon>warning</mat-icon>
          <span>
            Sẽ <strong>THAY THẾ {{ data.currentCount }} tiêu chí</strong> đang có (kèm mốc điểm của
            chúng).
          </span>
        </p>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton [mat-dialog-close]="null">Huỷ</button>
      <button
        matButton="filled"
        color="primary"
        [disabled]="!canCopy()"
        [mat-dialog-close]="choice()"
        data-testid="sd-confirm"
      >
        Chép về chiến dịch
      </button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      .full {
        width: 100%;
      }
      .note,
      .warn {
        display: flex;
        gap: 8px;
        align-items: flex-start;
        padding: 8px 12px;
        border-radius: 8px;
        font-size: 12px;
        margin: 4px 0 0;
      }
      .note {
        background: var(--mat-sys-surface-container);
        color: var(--mat-sys-on-surface-variant);
      }
      .warn {
        background: var(--mat-sys-error-container);
        color: var(--mat-sys-on-error-container);
      }
      mat-icon {
        font-size: 18px;
        width: 18px;
        height: 18px;
      }
      .preview {
        margin-top: 8px;
        padding: 8px 12px;
        border-radius: 8px;
        background: var(--mat-sys-surface-container);
      }
      .ptitle {
        margin: 0 0 6px;
        font-size: 12px;
        color: var(--mat-sys-on-surface-variant);
      }
      .preview ul {
        margin: 0;
        padding-left: 16px;
        font-size: 13px;
      }
      .preview li {
        display: flex;
        gap: 8px;
        align-items: baseline;
        flex-wrap: wrap;
        margin-bottom: 2px;
      }
      .cname {
        font-weight: 500;
      }
      .cmeta {
        font-size: 12px;
        color: var(--mat-sys-on-surface-variant);
      }
      .tag {
        padding: 0 8px;
        border-radius: 8px;
        font-size: 11px;
        background: var(--mat-sys-surface-variant);
        color: var(--mat-sys-on-surface-variant);
      }
      .tag-warn {
        background: var(--mat-sys-error-container);
        color: var(--mat-sys-on-error-container);
      }
    `,
  ],
})
export class SystemDefaultCriteriaDialog {
  private api = inject(CampaignApi);
  readonly data = inject<SystemDefaultCriteriaDialogData>(MAT_DIALOG_DATA);

  readonly jobCategories = JOB_CATEGORIES;
  readonly languages = CAMPAIGN_LANGUAGE_OPTIONS;

  /** KHÔNG chọn sẵn khi `domain` không khớp chính xác một mã nghề — xem `parseJobCategory`. */
  readonly jobCategory = signal<JobCategory | null>(parseJobCategory(this.data.domain));
  /**
   * Ngôn ngữ điền sẵn theo chiến dịch. Khác `domain` ở chỗ đây là **giá trị enum chính xác** của
   * chính buổi phỏng vấn sẽ chạy, không phải chữ tự do phải đoán.
   */
  readonly language = signal<CampaignLanguage>(this.data.language ?? 'vi');

  readonly preview = signal<SystemDefaultPreviewResponse | null>(null);
  readonly loading = signal(false);
  /** 404 = quản trị viên chưa soạn bộ này. Giữ RIÊNG khỏi `error`: đó là câu trả lời, không phải sự cố. */
  readonly notAvailable = signal(false);
  readonly error = signal<string | null>(null);

  /**
   * Số thứ tự lượt gọi. HR đổi nghề nhanh hai lần thì phản hồi có thể về ngược thứ tự ⇒ danh sách
   * của nghề CŨ đè lên nghề đang chọn, và không có gì trên màn nói ra.
   */
  private seq = 0;

  constructor() {
    effect(() => {
      const job = this.jobCategory();
      const lang = this.language();
      // Xoá kết quả cũ NGAY: giữ lại trong lúc chờ là để HR đọc danh sách của nghề khác.
      this.preview.set(null);
      this.notAvailable.set(false);
      this.error.set(null);
      if (!job) {
        this.loading.set(false);
        return;
      }
      this.fetch(job, lang, ++this.seq);
    });
  }

  private fetch(job: JobCategory, lang: CampaignLanguage, token: number): void {
    this.loading.set(true);
    this.api.previewSystemDefaultCriteria(job, lang).subscribe({
      next: (res) => {
        if (token !== this.seq) return;
        this.loading.set(false);
        this.preview.set(res);
      },
      error: (e: HttpErrorResponse) => {
        if (token !== this.seq) return;
        this.loading.set(false);
        if (e.status === 404) {
          this.notAvailable.set(true);
          return;
        }
        this.error.set(extractErrorMessage(e) ?? 'Không xem trước được bộ chuẩn.');
      },
    });
  }

  label(c: JobCategory): string {
    return JOB_CATEGORY_LABEL[c];
  }

  languageLabel(): string {
    return this.languages.find((l) => l.value === this.language())?.label ?? this.language();
  }

  pct(weight: number): number {
    return Math.round(Number(weight) * 100);
  }

  /**
   * Chỉ chép khi đã xem trước được (200).
   *
   * ⚠ **KHÔNG** xét `levelCount`: tiêu chí chưa có mốc là trạng thái hợp lệ — nó rơi về dải mặc
   * định và vẫn chấm được. Chặn vì lý do đó là hiểu một trạng thái bình thường thành hỏng, và làm
   * nghề nào admin mới soạn nửa chừng thì HR không dùng được gì cả.
   */
  canCopy(): boolean {
    return !!this.jobCategory() && !!this.preview() && !this.loading();
  }

  choice(): SystemDefaultCriteriaChoice | null {
    const job = this.jobCategory();
    return job && this.preview() ? { jobCategory: job, language: this.language() } : null;
  }
}
