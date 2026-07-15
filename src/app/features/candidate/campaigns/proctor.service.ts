import { Injectable, inject, signal } from '@angular/core';
import { CampaignApi } from '../../../core/api/campaign.api';
import { ProctorSignalType } from '../../../core/models';

/** Gộp các "burst" (blur + visibilitychange bắn cùng lúc khi đổi tab) trong khoảng này → 1 flag. */
const DEBOUNCE_MS = 1200;

/**
 * Giám sát client-side cho bài thi B2B (SEC-3): phát tín hiệu anti-cheat lên backend.
 *  - `visibilitychange` (tab ẩn) / `window blur` → `tab_switch` / `focus_lost`
 *  - `paste` → `paste`
 * Chỉ FLAG cho HR (CAMP-12 / D13) — KHÔNG bao giờ chặn/hủy bài. Gửi best-effort (fire-and-forget).
 *
 * Provide ở cấp component (per-interview) → mỗi buổi thi 1 instance, teardown gọn qua `stop()`.
 */
@Injectable()
export class ProctorService {
  private campaignApi = inject(CampaignApi);

  /** Số cảnh báo đã ghi nhận trong buổi — surface cho UI nếu cần. */
  readonly warnings = signal(0);
  readonly active = signal(false);

  private campaignId = '';
  private getSessionId: () => string | null = () => null;
  private lastAwayAt = 0;
  private lastPasteAt = 0;

  /** Bật giám sát: đăng ký listener document/window. Idempotent. */
  start(campaignId: string, sessionIdGetter: () => string | null): void {
    if (this.active()) return;
    this.campaignId = campaignId;
    this.getSessionId = sessionIdGetter;
    this.lastAwayAt = 0;
    this.lastPasteAt = 0;
    document.addEventListener('visibilitychange', this.onVisibility);
    window.addEventListener('blur', this.onBlur);
    window.addEventListener('focus', this.onFocus);
    window.addEventListener('paste', this.onPaste);
    this.active.set(true);
  }

  /** Tắt giám sát: gỡ toàn bộ listener. */
  stop(): void {
    document.removeEventListener('visibilitychange', this.onVisibility);
    window.removeEventListener('blur', this.onBlur);
    window.removeEventListener('focus', this.onFocus);
    window.removeEventListener('paste', this.onPaste);
    this.active.set(false);
  }

  // Arrow-field để giữ nguyên tham chiếu khi add/removeEventListener.
  private onVisibility = (): void => {
    if (document.hidden) this.reportAway('tab_switch', 'Rời khỏi tab bài thi');
  };

  private onBlur = (): void => {
    this.reportAway('focus_lost', 'Mất tiêu điểm cửa sổ bài thi');
  };

  // Quay lại → cho phép lần rời kế tiếp bắn ngay (mỗi lần rời là 1 sự kiện độc lập).
  private onFocus = (): void => {
    this.lastAwayAt = 0;
  };

  private onPaste = (): void => {
    const now = Date.now();
    if (now - this.lastPasteAt < DEBOUNCE_MS) return;
    this.lastPasteAt = now;
    this.report('paste', 'Dán nội dung vào trang thi');
  };

  /** blur + visibilitychange thường bắn cùng lúc khi đổi tab → gộp thành 1 flag. */
  private reportAway(signalType: ProctorSignalType, note: string): void {
    const now = Date.now();
    if (now - this.lastAwayAt < DEBOUNCE_MS) return;
    this.lastAwayAt = now;
    this.report(signalType, note);
  }

  private report(signalType: ProctorSignalType, note: string): void {
    const sessionId = this.getSessionId();
    if (!sessionId) return;
    this.warnings.update((n) => n + 1);
    // Fire-and-forget: lỗi mạng không được chặn bài thi (D13 / SEC-4).
    this.campaignApi.reportFlag(this.campaignId, sessionId, signalType, note).subscribe({
      error: () => {},
    });
  }
}
