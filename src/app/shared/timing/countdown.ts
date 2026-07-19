import { Signal, computed, signal } from '@angular/core';

export interface CountdownOptions {
  /** Đồng hồ đứng yên khi hàm này trả true (dùng cho lúc avatar đang đọc đề). */
  paused?: () => boolean;
  /** Gọi ĐÚNG MỘT LẦN cho mỗi lượt `start()`, tại giây chạm 0. */
  onExpire: () => void;
}

export interface Countdown {
  readonly remainingSec: Signal<number>;
  /** % thời gian còn lại (0–100) — để bind thẳng vào thanh progress. */
  readonly timePct: Signal<number>;
  /** `limitSec <= 0` = KHÔNG giới hạn: đặt lại số hiển thị nhưng không chạy đồng hồ. */
  start(limitSec: number): void;
  stop(): void;
}

/**
 * Đồng hồ đếm ngược từng câu, dạng factory hàm thuần (không `@Injectable`) — mỗi màn hình tự giữ một
 * cái, không có state dùng chung, nên test được mà không cần TestBed.
 *
 * Ngữ nghĩa copy từ màn thi B2B (`campaign-interview.ts`), giữ nguyên 3 điểm dễ mất khi viết lại:
 *  - `limitSec <= 0` nghĩa là không giới hạn, KHÔNG phải hết giờ ngay;
 *  - đang `paused` thì không trừ giây (ứng viên không mất thời gian vì máy đọc đề);
 *  - `onExpire` chỉ bắn một lần — `stop()` chạy TRƯỚC callback nên callback có gọi lại `start()`
 *    cũng không bị đúp.
 *
 * ⚠ B2B hiện VẪN dùng bản copy riêng của nó. Muốn chuyển B2B sang đây thì phải viết test timer cho
 * `campaign-interview.spec.ts` TRƯỚC (hiện 0 test nào chạm timer) — đó là điều kiện tiên quyết, không
 * phải gợi ý: refactor màn thi đang chạy tốt mà không có lưới an toàn là đổi chút DRY lấy rủi ro
 * hỏng luồng doanh thu.
 */
export function createCountdown(opts: CountdownOptions): Countdown {
  const remainingSec = signal(0);
  const totalSec = signal(0);
  let timer: ReturnType<typeof setInterval> | undefined;

  function stop(): void {
    if (timer) {
      clearInterval(timer);
      timer = undefined;
    }
  }

  function start(limitSec: number): void {
    stop();
    const limit = Math.max(0, limitSec);
    totalSec.set(limit);
    remainingSec.set(limit);
    if (limit <= 0) return; // không giới hạn → không chạy đồng hồ

    timer = setInterval(() => {
      if (opts.paused?.()) return;
      const left = remainingSec() - 1;
      remainingSec.set(Math.max(0, left));
      if (left <= 0) {
        stop(); // dừng TRƯỚC callback → onExpire không bao giờ bắn 2 lần
        opts.onExpire();
      }
    }, 1000);
  }

  const timePct = computed(() => {
    const total = totalSec();
    return total > 0 ? (remainingSec() / total) * 100 : 0;
  });

  return { remainingSec, timePct, start, stop };
}
