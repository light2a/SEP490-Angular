import { DecimalPipe } from '@angular/common';
import { Component, computed, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { DeliveryMetrics as Metrics } from '../../../core/models';

/**
 * F11 (FR06) — hiện chỉ số CÁCH NÓI của một câu trả lời (tốc độ nói · khoảng lặng · từ đệm).
 *
 * TẠI SAO tách component riêng thay vì nhét thẳng vào `practice-session.html` như F13 đã làm với
 * câu trả lời mẫu: F13 chỉ có ĐÚNG một phép kiểm (`?.trim()`) nên template gánh được. Ở đây có
 * phân loại dải tốc độ + sắp xếp/lọc breakdown + guard khuyết — tức là có QUYẾT ĐỊNH, mà bài học
 * từ `thresholdSeriesValues` (F14) rất rõ: quyết định nằm trong chỗ private thì không khoá được
 * bằng test, và đây đúng là hạng sai KHÔNG ai thấy — màn hình vẫn đẹp, chỉ kết luận người đọc rút
 * ra là sai. Nên mọi quyết định ở dưới đều là hàm thuần, export ra để test bắn thẳng.
 */

/** Dải tham khảo cho tiếng Việt nói tự nhiên (âm tiết/phút), khớp `prompts.py` của AIService. */
export const SPEECH_RATE_REF_MIN = 180;
export const SPEECH_RATE_REF_MAX = 320;

/** Ngưỡng "dừng đáng kể" của AIService (`fluency.py: PAUSE_THRESHOLD_SEC`). */
export const PAUSE_THRESHOLD_SEC = 0.7;

export type SpeechRateBand = 'slow' | 'normal' | 'fast';

/**
 * Cụm chỉ số có mặt hay không.
 *
 * ⚠ Dùng phép kiểm null tường minh, KHÔNG dùng truthiness trên từng số: `fillerCount = 0` là một
 * SỐ ĐO THẬT (và là đúng chỗ cần nói rõ "0 không phải lời khen"), nên coi 0 là "không có" sẽ giấu
 * mất chính cái cần cảnh báo. Cùng bài học với `?? ` thay vì `||` ở `thresholdSeriesValues`.
 */
export function hasDeliveryMetrics(m: Metrics | null | undefined): m is Metrics {
  return m != null;
}

/**
 * Xếp tốc độ nói vào dải tham khảo. CHỈ để chọn chữ mô tả — đây KHÔNG phải đạt/không đạt.
 * Bản thân BE cũng gọi dải này là "THAM CHIẾU để diễn giải, KHÔNG phải công thức quy ra điểm".
 */
export function speechRateBand(wpm: number): SpeechRateBand {
  if (wpm < SPEECH_RATE_REF_MIN) return 'slow';
  if (wpm > SPEECH_RATE_REF_MAX) return 'fast';
  return 'normal';
}

/**
 * Breakdown → danh sách [từ, số lần] sắp giảm dần.
 *
 * Lọc bỏ mục ≤ 0: hiện `"ừm" ×0` là bày một thứ không xảy ra. Trả mảng rỗng → nơi gọi KHÔNG dựng
 * khung liệt kê (tiền lệ F13: khung `<details>` với thân rỗng chính là ca mà guard sinh ra để chặn).
 */
export function fillerEntries(m: Metrics): [string, number][] {
  return Object.entries(m.fillerBreakdown ?? {})
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1]);
}

const BAND_TEXT: Record<SpeechRateBand, string> = {
  slow: 'chậm hơn dải tham khảo',
  normal: 'nằm trong dải tham khảo',
  fast: 'nhanh hơn dải tham khảo',
};

@Component({
  selector: 'app-delivery-metrics',
  imports: [DecimalPipe, MatIconModule],
  template: `
    @if (metrics(); as m) {
      <div class="dm">
        <div class="dm-head"><mat-icon>graphic_eq</mat-icon> Cách nói</div>

        <div class="dm-grid">
          <div class="dm-item">
            <span class="dm-label">Tốc độ nói</span>
            <b>{{ m.speechRateWpm | number: '1.0-0' }} âm tiết/phút</b>
            <span class="dm-sub">{{ bandText() }}</span>
          </div>
          <div class="dm-item">
            <span class="dm-label">Khoảng lặng dài nhất</span>
            <b>{{ m.longestPauseSec | number: '1.0-1' }} giây</b>
          </div>
          <div class="dm-item">
            <span class="dm-label">Số lần dừng</span>
            <b>{{ m.pauseCount }} lần</b>
            <span class="dm-sub">tính lần dừng lâu hơn {{ pauseThreshold }} giây</span>
          </div>
          <div class="dm-item">
            <span class="dm-label">Tỉ lệ im lặng</span>
            <b>{{ m.silenceRatio * 100 | number: '1.0-0' }}%</b>
          </div>
          <div class="dm-item">
            <span class="dm-label">Từ đệm</span>
            <b>ít nhất {{ m.fillerCount }} lần</b>
            @if (fillers().length) {
              <span class="dm-sub">
                @for (f of fillers(); track f[0]) {
                  <span class="dm-filler">“{{ f[0] }}” ×{{ f[1] }}</span>
                }
              </span>
            }
          </div>
        </div>

        <!--
          Hai chú thích này là phần QUAN TRỌNG NHẤT của khối, không phải phần trang trí — và phải
          là chữ NHÌN THẤY ĐƯỢC, không được giấu vào tooltip: tooltip vô hình trên thiết bị chạm,
          mà đây đúng là hai chỗ người đọc dễ rút ra kết luận sai nhất.
        -->
        <p class="dm-note">
          <mat-icon>info</mat-icon>
          <span>
            Số từ đệm là mức <b>tối thiểu</b> — máy nhận dạng giọng nói thường bỏ bớt từ đệm khi ghi
            lại, nên con số thật có thể cao hơn. Vì vậy “0” ở đây không có nghĩa là bạn đã nói hoàn
            toàn trôi chảy. Các chỉ số thời gian bên trên đáng tin hơn: một tiếng ngập ngừng bị bỏ
            qua vẫn để lại khoảng lặng.
          </span>
        </p>
        <p class="dm-note">
          <mat-icon>straighten</mat-icon>
          <span>
            Tham khảo: tiếng Việt nói tự nhiên thường vào khoảng
            {{ refMin }}–{{ refMax }} âm tiết/phút. Đây là mức <b>tham khảo</b> để bạn tự soi, không
            phải mức đúng/sai — nói chậm không có nghĩa là trả lời kém. Tiếng Việt đơn âm tiết nên
            chỉ số này là nhịp nói, không quy đổi trực tiếp sang đơn vị của tiếng Anh.
          </span>
        </p>
      </div>
    } @else {
      <!--
        Khuyết thì để KHUYẾT. Điền 0 vào đây là dựng ra một buổi nói "không ngập ngừng lần nào,
        không im lặng giây nào" — sai lệch luôn nghiêng về phía khen người dùng, đúng hạng lỗi đã
        phải vá ở lớp mốc radar (F14).
      -->
      <p class="dm-absent">
        <mat-icon>hourglass_empty</mat-icon> Chưa đo được chỉ số cách nói cho câu này.
      </p>
    }
  `,
  styles: [
    `
      .dm {
        margin: 12px 0;
      }
      .dm-head {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 14px;
        font-weight: 600;
        margin-bottom: 8px;
        color: var(--mat-sys-on-surface-variant);
      }
      .dm-grid {
        display: flex;
        flex-wrap: wrap;
        gap: 8px 20px;
      }
      .dm-item {
        display: flex;
        flex-direction: column;
        min-width: 128px;
      }
      .dm-label {
        font-size: 12px;
        color: var(--mat-sys-on-surface-variant);
      }
      .dm-item b {
        font-size: 15px;
      }
      .dm-sub {
        font-size: 12px;
        color: var(--mat-sys-on-surface-variant);
      }
      .dm-filler {
        margin-right: 8px;
        white-space: nowrap;
      }
      .dm-note,
      .dm-absent {
        display: flex;
        align-items: flex-start;
        gap: 6px;
        margin: 8px 0 0;
        font-size: 12px;
        color: var(--mat-sys-on-surface-variant);
      }
      .dm-note mat-icon,
      .dm-absent mat-icon {
        font-size: 16px;
        width: 16px;
        height: 16px;
      }
    `,
  ],
})
export class DeliveryMetricsPanel {
  /** null/undefined = chưa đo được (answer trước F11 · audio rỗng · đường degrade). */
  readonly metrics = input<Metrics | null | undefined>(null);

  protected readonly refMin = SPEECH_RATE_REF_MIN;
  protected readonly refMax = SPEECH_RATE_REF_MAX;
  protected readonly pauseThreshold = PAUSE_THRESHOLD_SEC;

  protected readonly bandText = computed(() => {
    const m = this.metrics();
    return hasDeliveryMetrics(m) ? BAND_TEXT[speechRateBand(m.speechRateWpm)] : '';
  });

  protected readonly fillers = computed(() => {
    const m = this.metrics();
    return hasDeliveryMetrics(m) ? fillerEntries(m) : [];
  });
}
