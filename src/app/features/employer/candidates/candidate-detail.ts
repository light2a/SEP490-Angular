import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { CampaignApi } from '../../../core/api/campaign.api';
import { extractErrorMessage } from '../../../core/api/http-utils';
import { NotifyService } from '../../../core/notify.service';
import { CandidateDetailResponse, NeedLevel, VerificationRisk } from '../../../core/models';
import { EmptyState } from '../../../shared/ui/empty-state';
import { Spinner } from '../../../shared/ui/spinner';

/** Nhãn tiếng Việt cho trạng thái ứng viên. */
const STATUS_LABEL: Record<string, string> = {
  Filtered: 'Qua sàng',
  Rejected: 'Bị loại',
  Analyzing: 'Đang chấm',
  Analyzed: 'Đã chấm',
  AnalysisFailed: 'Lỗi chấm',
  Invited: 'Đã mời',
};

/** Chi tiết 1 ứng viên CV: điểm khớp + điểm/dẫn chứng từng tiêu chí + sửa email/họ tên (C13–C15). */
@Component({
  selector: 'app-candidate-detail',
  imports: [
    FormsModule,
    RouterLink,
    MatButtonModule,
    MatCardModule,
    MatChipsModule,
    MatDividerModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    Spinner,
    EmptyState,
  ],
  template: `
    <div class="page">
      <a mat-button [routerLink]="['/employer/campaigns', campaignId(), 'candidates']">
        <mat-icon>arrow_back</mat-icon> Quay lại danh sách ứng viên
      </a>

      @if (loading()) {
        <app-spinner [diameter]="36" message="Đang tải chi tiết ứng viên..." />
      } @else if (candidate(); as c) {
        <!-- Thông tin chung -->
        <mat-card class="card">
          <mat-card-content>
            <div class="title-line">
              <h1>{{ c.fullName || '(chưa có tên)' }}</h1>
              <span class="status-chip" [class]="'st-' + c.status">{{ statusLabel(c.status) }}</span>
            </div>
            @if (c.email) {
              <p class="email"><mat-icon>mail</mat-icon>{{ c.email }}</p>
            }

            <div class="grid">
              <div class="item">
                <span class="k">Điểm khớp CV</span>
                <span class="v">{{ c.overallMatchScore != null ? c.overallMatchScore : '—' }}</span>
              </div>
              <div class="item">
                <span class="k">Số năm KN</span>
                <span class="v">{{ c.yearsExperience != null ? c.yearsExperience : '—' }}</span>
              </div>
              @if (c.verificationRisk) {
                <div class="item">
                  <span class="k">Cần kiểm chứng</span>
                  <span class="v risk" [class]="'risk-' + c.verificationRisk">
                    {{ riskLabel(c.verificationRisk) }}
                  </span>
                </div>
              }
            </div>

            <!--
              Điểm cũ (screeningVersion 1) do mô hình tự phán trên thước chấm buổi phỏng vấn; điểm
              mới tính từ mức bằng chứng. Hai thang KHÔNG so sánh được với nhau, nên phải nói ra
              thay vì để HR xếp chung một bảng mà không biết.
            -->
            @if (c.overallMatchScore != null && c.screeningVersion !== 2) {
              <p class="muted stale-note">
                <mat-icon>history</mat-icon>
                Điểm này chấm bằng cách cũ, không so sánh trực tiếp được với ứng viên sàng lại sau
                này. Bấm “Đẩy lại sàng CV” để chấm theo bằng chứng.
              </p>
            }

            @if (c.verificationRisk === 'High') {
              <div class="callout warn">
                <mat-icon>report</mat-icon>
                <div>
                  <strong>CV liệt kê nhiều kỹ năng nhưng thiếu dự án chống lưng</strong>
                  <p>Điểm khớp cao vẫn nên soi kỹ ở vòng phỏng vấn.</p>
                </div>
              </div>
            }

            @if (c.skills?.length) {
              <mat-divider />
              <h3>Kỹ năng</h3>
              <mat-chip-set>
                @for (s of c.skills; track s) {
                  <mat-chip>{{ s }}</mat-chip>
                }
              </mat-chip-set>
            }

            @if (c.fitSummary || c.summary) {
              <mat-divider />
              <h3>Hợp / không hợp ở đâu</h3>
              <p class="summary">{{ c.fitSummary || c.summary }}</p>
            }

            @if (c.rejectReason) {
              <div class="callout warn">
                <mat-icon>warning</mat-icon>
                <div>
                  <strong>Lý do loại</strong>
                  <p>{{ c.rejectReason }}</p>
                </div>
              </div>
            }

            @if (c.cvFileUrl) {
              <mat-divider />
              <div class="cv-row">
                <button mat-flat-button color="primary" [disabled]="downloading()" (click)="downloadCv()">
                  <mat-icon>download</mat-icon>
                  {{ downloading() ? 'Đang tải…' : 'Tải CV gốc (PDF)' }}
                </button>
                <span class="cv-key muted" [title]="c.cvFileUrl">{{ c.cvFileUrl }}</span>
              </div>
            }

            <!--
              Đẩy lại sàng CV: dùng khi CV không tách được tên/điểm, hoặc lần chấm trước hỏng.
              Chỉ mở với 3 trạng thái backend cho phép — Invited (kết quả đã chốt, chạy tiếp chỉ
              đốt token rồi vứt) và Analyzing (job đang bay) đều bị từ chối bằng 409.
            -->
            <mat-divider />
            <div class="cv-row">
              <button
                mat-stroked-button
                [disabled]="busy() || rescreening() || !canRescreen(c.status)"
                (click)="rescreen()"
              >
                <mat-icon>refresh</mat-icon>
                {{ rescreening() ? 'Đang gửi…' : 'Đẩy lại sàng CV' }}
              </button>
              <span class="muted">{{ rescreenHint(c.status) }}</span>
            </div>
          </mat-card-content>
        </mat-card>

        <!--
          Đối chiếu CV với NHU CẦU CÔNG VIỆC của chiến dịch. Mỗi dòng phải kèm trích dẫn từ CV —
          đó là thứ HR dùng để trả lời "vì sao loại người này", nên nó phải kiểm chứng được chứ
          không phải một câu mô hình tự viết.
        -->
        <mat-card class="card">
          <mat-card-header>
            <mat-card-title>Đáp ứng nhu cầu công việc ({{ c.strengths.length }})</mat-card-title>
          </mat-card-header>
          <mat-card-content>
            @if (!c.strengths.length) {
              <p class="muted">Chưa thấy nhu cầu nào có bằng chứng rõ trong CV.</p>
            } @else {
              <div class="need-list">
                @for (a of c.strengths; track a.needId) {
                  <div class="need">
                    <div class="need-head">
                      <strong>{{ a.area }}</strong>
                      <span class="level" [class]="'lv-' + a.level">{{ levelLabel(a.level) }}</span>
                    </div>
                    @if (a.evidence) {
                      <p class="evidence">“{{ a.evidence }}”</p>
                    }
                  </div>
                }
              </div>
            }
          </mat-card-content>
        </mat-card>

        <!--
          Nhóm chưa thấy bằng chứng CHÍNH LÀ danh sách việc cần kiểm ở vòng phỏng vấn — chứ không
          phải "ứng viên không có". CV không nhắc ≠ không biết.
        -->
        <mat-card class="card">
          <mat-card-header>
            <mat-card-title>Chưa thấy bằng chứng ({{ c.gaps.length }})</mat-card-title>
            <mat-card-subtitle>
              CV không nhắc tới không có nghĩa ứng viên không có — đây là chỗ nên hỏi khi phỏng vấn.
            </mat-card-subtitle>
          </mat-card-header>
          <mat-card-content>
            @if (!c.gaps.length) {
              <p class="muted">Mọi nhu cầu đều có bằng chứng trong CV.</p>
            } @else {
              <div class="need-list">
                @for (a of c.gaps; track a.needId) {
                  <div class="need">
                    <div class="need-head">
                      <strong>{{ a.area }}</strong>
                      <span class="level lv-Weak">{{ levelLabel(a.level) }}</span>
                    </div>
                    @if (a.evidence) {
                      <p class="evidence muted">{{ a.evidence }}</p>
                    }
                  </div>
                }
              </div>
            }
          </mat-card-content>
        </mat-card>

        @if (c.bonusSignals.length) {
          <mat-card class="card">
            <mat-card-header>
              <mat-card-title>Điểm cộng ngoài yêu cầu</mat-card-title>
            </mat-card-header>
            <mat-card-content>
              <mat-chip-set>
                @for (b of c.bonusSignals; track b) {
                  <mat-chip>{{ b }}</mat-chip>
                }
              </mat-chip-set>
            </mat-card-content>
          </mat-card>
        }

        @if (c.verifyQuestions.length) {
          <mat-card class="card">
            <mat-card-header>
              <mat-card-title>Nên hỏi để xác minh</mat-card-title>
              <!--
                Gợi ý riêng cho hồ sơ này, KHÔNG đưa vào bộ câu hỏi của chiến dịch: bộ đó là bộ
                CHUNG cho mọi ứng viên — chính điều đó khiến bảng xếp hạng so sánh được với nhau.
              -->
              <mat-card-subtitle>
                Gợi ý riêng cho ứng viên này; không nằm trong bộ câu hỏi chung của chiến dịch.
              </mat-card-subtitle>
            </mat-card-header>
            <mat-card-content>
              <ol class="verify-list">
                @for (q of c.verifyQuestions; track q) {
                  <li>{{ q }}</li>
                }
              </ol>
            </mat-card-content>
          </mat-card>
        }

        <!-- Sửa email / họ tên -->
        <mat-card class="card">
          <mat-card-header>
            <mat-card-title>Sửa email/họ tên</mat-card-title>
            <mat-card-subtitle>Bổ sung khi CV không tách được thông tin.</mat-card-subtitle>
          </mat-card-header>
          <mat-card-content>
            <div class="form-row">
              <mat-form-field appearance="outline">
                <mat-label>Họ tên</mat-label>
                <input matInput [(ngModel)]="editFullName" />
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>Email</mat-label>
                <input matInput type="email" [(ngModel)]="editEmail" />
              </mat-form-field>
            </div>
            <button mat-flat-button color="primary" [disabled]="busy()" (click)="save()">
              <mat-icon>save</mat-icon> Lưu
            </button>
          </mat-card-content>
        </mat-card>
      } @else {
        <app-empty-state icon="person_off" message="Không tìm thấy ứng viên." />
      }
    </div>
  `,
  styles: [
    `
      .page {
        display: flex;
        flex-direction: column;
        gap: 16px;
        padding: 8px;
      }
      .card {
        width: 100%;
      }
      .title-line {
        display: flex;
        align-items: center;
        gap: 12px;
        flex-wrap: wrap;
      }
      h1 {
        margin: 0;
        font-size: 22px;
      }
      h3 {
        margin: 16px 0 8px;
        font-size: 15px;
      }
      .email {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        color: var(--mat-sys-on-surface-variant);
        margin: 8px 0 0;
      }
      .email mat-icon,
      .cv-key mat-icon {
        font-size: 18px;
        height: 18px;
        width: 18px;
      }
      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
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
        font-weight: 600;
        font-size: 18px;
      }
      .summary {
        white-space: pre-wrap;
        color: var(--mat-sys-on-surface-variant);
        margin: 0;
      }
      .muted {
        color: var(--mat-sys-on-surface-variant);
        font-size: 14px;
      }
      .callout {
        display: flex;
        gap: 10px;
        margin-top: 16px;
        padding: 12px 14px;
        border-radius: 8px;
      }
      .callout.warn {
        background: var(--mat-sys-error-container);
        color: var(--mat-sys-on-error-container);
      }
      .callout p {
        margin: 4px 0 0;
      }
      .cv-row {
        display: flex;
        align-items: center;
        gap: 12px;
        flex-wrap: wrap;
        margin-top: 12px;
      }
      .cv-key {
        font-size: 12px;
        color: var(--mat-sys-on-surface-variant);
        word-break: break-all;
      }
      .need-list {
        display: flex;
        flex-direction: column;
        gap: 14px;
      }
      .need {
        padding: 12px 14px;
        border-radius: 8px;
        background: var(--mat-sys-surface-variant);
      }
      .need-head {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 12px;
        margin-bottom: 8px;
      }
      .level {
        font-weight: 600;
        white-space: nowrap;
        font-size: 13px;
        padding: 2px 10px;
        border-radius: 999px;
        border: 1px solid var(--mat-sys-outline-variant);
      }
      .lv-Strong {
        color: var(--mat-sys-primary);
      }
      .lv-Partial {
        color: var(--mat-sys-tertiary);
      }
      .lv-Weak {
        color: var(--mat-sys-on-surface-variant);
      }
      /* Trích dẫn từ CV — in nghiêng để phân biệt rõ với chữ do hệ thống viết ra. */
      .evidence {
        margin: 10px 0 0;
        font-size: 14px;
        font-style: italic;
        color: var(--mat-sys-on-surface-variant);
        white-space: pre-wrap;
      }
      .risk-High {
        color: var(--mat-sys-error);
      }
      .stale-note {
        display: flex;
        align-items: flex-start;
        gap: 8px;
        margin-top: 12px;
        font-size: 13px;
      }
      .stale-note mat-icon {
        font-size: 18px;
        width: 18px;
        height: 18px;
      }
      .verify-list {
        margin: 0;
        padding-left: 20px;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .form-row {
        display: flex;
        gap: 12px;
        flex-wrap: wrap;
      }
      .form-row mat-form-field {
        flex: 1 1 220px;
      }
      .status-chip {
        padding: 2px 10px;
        border-radius: 12px;
        font-size: 12px;
        background: var(--mat-sys-surface-variant);
        color: var(--mat-sys-on-surface-variant);
      }
      .status-chip.st-Analyzed,
      .status-chip.st-Invited {
        background: var(--mat-sys-primary-container);
        color: var(--mat-sys-on-primary-container);
      }
      .status-chip.st-Rejected,
      .status-chip.st-AnalysisFailed {
        background: var(--mat-sys-error-container);
        color: var(--mat-sys-on-error-container);
      }
    `,
  ],
})
export class CandidateDetail implements OnInit {
  private api = inject(CampaignApi);
  private notify = inject(NotifyService);

  readonly campaignId = input.required<string>();
  readonly candidateId = input.required<string>();

  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly downloading = signal(false);
  readonly candidate = signal<CandidateDetailResponse | null>(null);

  editFullName = '';
  editEmail = '';

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.loading.set(true);
    this.api.getCandidate(this.campaignId(), this.candidateId()).subscribe({
      next: (c) => {
        this.candidate.set(c);
        this.editFullName = c.fullName ?? '';
        this.editEmail = c.email ?? '';
        this.loading.set(false);
      },
      error: (e: HttpErrorResponse) => {
        this.loading.set(false);
        this.candidate.set(null);
        this.notify.error(extractErrorMessage(e) ?? 'Không tải được thông tin ứng viên.');
      },
    });
  }

  /**
   * Tải CV gốc. Endpoint trả thẳng bytes PDF và đòi JWT → phải lấy blob qua HttpClient rồi tạo
   * object URL để trình duyệt lưu file (mở tab mới bằng URL trần sẽ 401 vì thiếu header).
   */
  downloadCv(): void {
    this.downloading.set(true);
    this.api.downloadCandidateCv(this.campaignId(), this.candidateId()).subscribe({
      next: (blob) => {
        this.downloading.set(false);
        const name = (this.candidate()?.fullName ?? '').trim();
        // Tên file theo họ tên cho HR dễ tra; không có tên → lùi về id (bám tên backend đặt).
        const safe = name ? name.replace(/[^\p{L}\p{N}]+/gu, '_') : `candidate_${this.candidateId()}`;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${safe}.pdf`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      },
      error: (e: HttpErrorResponse) => {
        this.downloading.set(false);
        this.notify.error(
          e.status === 404
            ? 'Không tìm thấy file CV gốc (chưa lưu trữ được lúc tải lên).'
            : (extractErrorMessage(e) ?? 'Tải CV thất bại.'),
        );
      },
    });
  }

  statusLabel(status: string): string {
    return STATUS_LABEL[status] ?? status;
  }

  // ── Đẩy lại sàng CV ─────────────────────────────────────────────────────────
  readonly rescreening = signal(false);

  /** Đúng 3 trạng thái backend chấp nhận; các trạng thái khác trả 409. */
  canRescreen(status: string): boolean {
    return status === 'Filtered' || status === 'Analyzed' || status === 'AnalysisFailed';
  }

  /** Nói LÝ DO nút bị khoá — nút xám không giải thích là thứ khiến HR tưởng hệ thống hỏng. */
  rescreenHint(status: string): string {
    if (this.canRescreen(status)) {
      return 'AI đọc lại CV để điền tên và điểm còn thiếu.';
    }
    if (status === 'Analyzing') return 'Đang chấm — chờ lượt hiện tại xong đã.';
    if (status === 'Invited') return 'Đã mời phỏng vấn nên kết quả sàng CV được giữ nguyên.';
    return 'Trạng thái này không đẩy lại được.';
  }

  rescreen(): void {
    this.rescreening.set(true);
    this.api.rescreenCandidate(this.campaignId(), this.candidateId()).subscribe({
      next: () => {
        this.rescreening.set(false);
        this.notify.success('Đã gửi yêu cầu — AI đang chấm lại CV, xem lại sau ít phút.');
        this.load();
      },
      error: (e: HttpErrorResponse) => {
        this.rescreening.set(false);
        // 409 ở đây phần lớn là "đang chạy rồi" (bấm hai lần) — cảnh báo nhẹ, không phải lỗi đỏ.
        if (e.status === 409) {
          this.notify.warn(extractErrorMessage(e) ?? 'Trạng thái hiện tại không đẩy lại được.');
          this.load();
          return;
        }
        this.notify.error(extractErrorMessage(e) ?? 'Đẩy lại sàng CV thất bại.');
      },
    });
  }

  levelLabel(level?: NeedLevel | null): string {
    switch (level) {
      case 'Strong':
        return 'Bằng chứng rõ';
      case 'Partial':
        return 'Có dấu hiệu';
      default:
        return 'Chưa thấy';
    }
  }

  riskLabel(risk?: VerificationRisk | null): string {
    switch (risk) {
      case 'Low':
        return 'Thấp';
      case 'High':
        return 'Cao';
      default:
        return 'Trung bình';
    }
  }

  save(): void {
    const body = {
      fullName: this.editFullName.trim() || undefined,
      email: this.editEmail.trim() || undefined,
    };
    this.busy.set(true);
    this.api.patchCandidate(this.campaignId(), this.candidateId(), body).subscribe({
      next: () => {
        this.busy.set(false);
        this.notify.success('Đã cập nhật thông tin ứng viên.');
        this.load();
      },
      error: (e: HttpErrorResponse) => {
        this.busy.set(false);
        if (e.status === 409) {
          this.notify.warn(
            extractErrorMessage(e) ?? 'Ứng viên đã được mời, không sửa được.',
          );
          return;
        }
        this.notify.error(extractErrorMessage(e) ?? 'Cập nhật thất bại.');
      },
    });
  }
}
