import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, inject, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { CampaignApi } from '../../../core/api/campaign.api';
import { extractErrorMessage } from '../../../core/api/http-utils';
import { SessionTranscriptResponse, TranscriptQuestion } from '../../../core/models';
import { EmptyState } from '../../../shared/ui/empty-state';
import { Spinner } from '../../../shared/ui/spinner';

/** Tham số mở hộp thoại — mở từ 1 dòng bảng xếp hạng. */
export interface SessionTranscriptDialogData {
  campaignId: string;
  sessionId: string;
  /** Hiển thị trên tiêu đề để HR biết đang xem buổi của ai (bảng chỉ có id). */
  candidateId: string;
}

/**
 * AI4 — HR xem transcript + lý do AI chấm điểm của 1 buổi (drill-down từ bảng xếp hạng).
 *
 * Dùng DIALOG thay vì route con: HR đọc transcript để *biện minh cho thứ hạng* rồi thường
 * điều chỉnh điểm ngay tại bảng — dialog giữ nguyên ngữ cảnh so sánh (thứ tự hạng, form
 * điều chỉnh đang mở), đóng lại là về đúng chỗ cũ, không phải tải lại bảng.
 */
@Component({
  selector: 'app-session-transcript-dialog',
  imports: [
    MatDialogModule,
    MatButtonModule,
    MatChipsModule,
    MatDividerModule,
    MatIconModule,
    MatTooltipModule,
    Spinner,
    EmptyState,
  ],
  template: `
    <h2 mat-dialog-title>
      <mat-icon class="title-ico">record_voice_over</mat-icon>
      Transcript & lý do chấm điểm
      <span class="sub">ứng viên {{ short(data.candidateId) }} · buổi {{ short(data.sessionId) }}</span>
    </h2>

    <mat-dialog-content>
      @if (loading()) {
        <app-spinner [diameter]="36" message="Đang tải transcript…" />
      } @else if (transcript(); as t) {
        @if (t.questions.length === 0) {
          <app-empty-state icon="voice_over_off" message="Buổi này chưa có câu hỏi/câu trả lời nào." />
        } @else {
          @if (reviewCount() > 0) {
            <div class="callout warn">
              <mat-icon>flag</mat-icon>
              <div>
                <strong>{{ reviewCount() }} câu cần HR soi lại</strong>
                <p>
                  AI chấm nhiều lần cho ra điểm lệch nhau nhiều ở những câu này → độ tin cậy thấp.
                  Điểm AI chỉ là gợi ý, HR nên đọc transcript rồi tự chốt.
                </p>
              </div>
            </div>
          }

          <p class="note">
            <mat-icon>info</mat-icon>
            Backend chưa trả tên tiêu chí ở màn này — mỗi tiêu chí hiện bằng mã rút gọn (di chuột để
            xem mã đầy đủ). Tên + trọng số xem ở phần tiêu chí của chiến dịch.
          </p>

          @for (q of t.questions; track q.questionId) {
            <div class="q" [class.needs-review]="q.needsReview">
              <div class="q-head">
                <span class="q-no">Câu {{ q.orderNo }}</span>
                @if (q.needsReview) {
                  <mat-chip class="chip-review" highlighted>
                    <mat-icon matChipAvatar>flag</mat-icon> Cần xem lại
                  </mat-chip>
                }
              </div>
              <p class="q-content">{{ q.content }}</p>

              <div class="block">
                <span class="lbl">Câu trả lời (bản ghi lời nói)</span>
                @if (q.transcript) {
                  <p class="transcript">{{ q.transcript }}</p>
                } @else {
                  <p class="muted">Ứng viên chưa trả lời câu này.</p>
                }
              </div>

              @if (q.scores.length) {
                <div class="block">
                  <span class="lbl">Điểm & lý do AI đưa ra</span>
                  <div class="crit-list">
                    @for (s of q.scores; track s.criterionId) {
                      <div class="crit">
                        <div class="crit-head">
                          <strong class="mono" [matTooltip]="s.criterionId"
                            >Tiêu chí {{ short(s.criterionId) }}</strong
                          >
                          <span class="score">{{ s.score }}</span>
                        </div>
                        @if (s.reasoning) {
                          <p class="reasoning">{{ s.reasoning }}</p>
                        } @else {
                          <p class="muted">AI không đưa ra lý do cho tiêu chí này.</p>
                        }
                      </div>
                    }
                  </div>
                </div>
              } @else if (q.transcript) {
                <p class="muted">Câu này chưa được chấm điểm.</p>
              }
            </div>
            <mat-divider />
          }
        }
      } @else {
        <app-empty-state icon="error_outline" [message]="error() || 'Không tải được transcript.'" />
      }
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button matButton mat-dialog-close>Đóng</button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      .title-ico {
        vertical-align: middle;
        margin-right: 6px;
      }
      .sub {
        display: block;
        font-size: 12px;
        font-weight: 400;
        color: var(--mat-sys-on-surface-variant);
      }
      mat-dialog-content {
        max-height: 70vh;
      }
      .callout {
        display: flex;
        gap: 10px;
        margin: 4px 0 16px;
        padding: 12px 14px;
        border-radius: 8px;
      }
      .callout.warn {
        background: var(--mat-sys-error-container);
        color: var(--mat-sys-on-error-container);
      }
      .callout p {
        margin: 4px 0 0;
        font-size: 13px;
      }
      .note {
        display: flex;
        align-items: flex-start;
        gap: 6px;
        margin: 0 0 16px;
        font-size: 12px;
        color: var(--mat-sys-on-surface-variant);
      }
      .note mat-icon {
        font-size: 16px;
        height: 16px;
        width: 16px;
      }
      .q {
        padding: 12px 0 16px;
      }
      .q.needs-review {
        border-left: 3px solid var(--mat-sys-error);
        padding-left: 12px;
      }
      .q-head {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-bottom: 4px;
      }
      .q-no {
        font-size: 12px;
        font-weight: 600;
        color: var(--mat-sys-on-surface-variant);
        text-transform: uppercase;
      }
      .q-content {
        margin: 0 0 12px;
        font-weight: 600;
      }
      .block {
        margin-bottom: 12px;
      }
      .lbl {
        display: block;
        font-size: 12px;
        color: var(--mat-sys-on-surface-variant);
        margin-bottom: 4px;
      }
      .transcript {
        margin: 0;
        padding: 10px 12px;
        border-radius: 8px;
        background: var(--mat-sys-surface-variant);
        white-space: pre-wrap;
      }
      .crit-list {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .crit {
        padding: 10px 12px;
        border-radius: 8px;
        background: var(--mat-sys-surface-variant);
      }
      .crit-head {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 12px;
      }
      .score {
        font-weight: 600;
        color: var(--mat-sys-primary);
      }
      .reasoning {
        margin: 6px 0 0;
        font-size: 14px;
        white-space: pre-wrap;
      }
      .mono {
        font-family: monospace;
        font-size: 13px;
      }
      .muted {
        margin: 0;
        color: var(--mat-sys-on-surface-variant);
        font-size: 14px;
      }
    `,
  ],
})
export class SessionTranscriptDialog implements OnInit {
  private api = inject(CampaignApi);
  readonly data = inject<SessionTranscriptDialogData>(MAT_DIALOG_DATA);
  private ref = inject(MatDialogRef<SessionTranscriptDialog>);

  readonly loading = signal(true);
  readonly transcript = signal<SessionTranscriptResponse | null>(null);
  readonly error = signal<string | null>(null);

  ngOnInit(): void {
    this.api.getSessionTranscript(this.data.campaignId, this.data.sessionId).subscribe({
      next: (t) => {
        this.transcript.set(t);
        this.loading.set(false);
      },
      error: (e: HttpErrorResponse) => {
        this.loading.set(false);
        // 404 = buổi chưa chấm/ngoài org · 502 = Interview lỗi (interceptor đã toast lỗi 5xx).
        this.error.set(
          e.status === 404
            ? 'Buổi phỏng vấn này chưa có transcript (chưa chấm xong hoặc không thuộc chiến dịch).'
            : (extractErrorMessage(e) ?? 'Không tải được transcript. Vui lòng thử lại.'),
        );
      },
    });
  }

  /** Đếm câu AI tự nhận không chắc — số này quyết định có hiện cảnh báo đầu hộp thoại hay không. */
  reviewCount(): number {
    return (this.transcript()?.questions ?? []).filter((q: TranscriptQuestion) => q.needsReview)
      .length;
  }

  short(id: string): string {
    return id ? id.slice(0, 8) : '';
  }

  close(): void {
    this.ref.close();
  }
}
