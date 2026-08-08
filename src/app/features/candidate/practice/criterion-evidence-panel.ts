import { Component, input } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { CRITERION_EVIDENCE_STATE_LABEL, CriterionEvidence } from '../../../core/models';

/**
 * Evidence-Driven Interviewer — AI thu được dẫn chứng gì cho từng tiêu chí trong CẢ buổi.
 *
 * Đây là phần đáng giá nhất cho người học: nó nói RÕ còn thiếu gì để đạt tiêu chí, thay vì chỉ đưa
 * ra một con số điểm. Hiện cả khi buổi CHƯA chấm xong — biết mình hổng chỗ nào trong lúc còn câu
 * để trả lời thì mới kịp bù.
 *
 * Tách component riêng theo đúng tiền lệ `DeliveryMetricsPanel`: đây là một khối tự chứa, và
 * `practice-session.scss` vốn đã sát trần ngân sách style của dự án.
 */
@Component({
  selector: 'app-criterion-evidence-panel',
  imports: [MatCardModule, MatIconModule, MatChipsModule],
  template: `
    <!--
      Rỗng/null ⇒ KHÔNG dựng gì. null nghĩa là buổi cũ / B2B không theo dõi thứ này, khác hẳn
      "đã theo dõi mà không thu được gì" — dán nhãn "chưa có dẫn chứng" lên nhóm đầu là kết luận
      sai về một bài làm hoàn toàn bình thường.
      (Không dùng dấu backtick trong khối này: nó nằm trong template literal của TypeScript.)
    -->
    @if (evidence()?.length) {
      <mat-card class="evidence" data-testid="criterion-evidence">
        <h2>Dẫn chứng theo tiêu chí</h2>
        <p class="note">
          <mat-icon>info</mat-icon>
          AI ghi lại những gì bạn đã chứng minh được và phần còn thiếu của từng tiêu chí.
        </p>
        @for (ev of evidence(); track ev.criterionId) {
          <div class="item">
            <div class="head">
              <span class="name">{{ ev.criterionName }}</span>
              <mat-chip>{{ stateLabel(ev.state) }}</mat-chip>
            </div>
            @if (ev.evidenceFound.length) {
              <div class="block">
                <h4>Đã thể hiện được</h4>
                <ul>
                  @for (f of ev.evidenceFound; track f) {
                    <li>{{ f }}</li>
                  }
                </ul>
              </div>
            }
            @if (ev.missingEvidence.length) {
              <div class="block">
                <h4>Còn thiếu</h4>
                <ul>
                  @for (m of ev.missingEvidence; track m) {
                    <li>{{ m }}</li>
                  }
                </ul>
              </div>
            }
            @if (!ev.evidenceFound.length && !ev.missingEvidence.length) {
              <p class="empty">Chưa có câu hỏi nào chạm tới tiêu chí này.</p>
            }
          </div>
        }
      </mat-card>
    }
  `,
  styles: [
    `
      .evidence {
        padding: 20px;
        margin-top: 16px;
      }
      .note {
        display: flex;
        align-items: flex-start;
        gap: 6px;
        margin: 0 0 12px;
        font-size: 12px;
        color: var(--mat-sys-on-surface-variant);
      }
      .note mat-icon {
        flex: none;
        font-size: 16px;
        width: 16px;
        height: 16px;
      }
      .item {
        padding: 10px 0;
        border-top: 1px solid var(--mat-sys-outline-variant);
      }
      .head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      }
      .name {
        font-weight: 500;
      }
      .block {
        margin-top: 6px;
      }
      .block h4 {
        margin: 0 0 2px;
        font-size: 0.85rem;
        color: var(--mat-sys-on-surface-variant);
      }
      .block ul {
        margin: 0;
        padding-left: 1.1rem;
      }
      .empty {
        margin: 6px 0 0;
        font-size: 13px;
        color: var(--mat-sys-on-surface-variant);
      }
    `,
  ],
})
export class CriterionEvidencePanel {
  readonly evidence = input<CriterionEvidence[] | null>(null);

  /** Tra không trúng thì hiện nguyên giá trị thô — còn hơn hiện rỗng khi BE thêm trạng thái mới. */
  stateLabel(state: string): string {
    return CRITERION_EVIDENCE_STATE_LABEL[state] ?? state;
  }
}
