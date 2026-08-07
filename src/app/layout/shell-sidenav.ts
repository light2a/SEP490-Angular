import { Signal, WritableSignal, computed, inject, linkedSignal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { BreakpointObserver } from '@angular/cdk/layout';
import { map } from 'rxjs';

/**
 * F24 — dưới ngưỡng này sidenav CHE nội dung (mode "over") thay vì chiếm chỗ ngang.
 *
 * ⚠ Ngưỡng phải khớp với media query trong 3 file .scss của shell, nếu không thì padding và
 * chế độ sidenav lật ở hai điểm khác nhau (có dải màn hình vừa bị đẩy nội dung vừa dùng
 * padding hẹp). 767.98 thay vì 768 để không trùng biên với `min-width: 768px` nếu sau này có.
 */
export const SHELL_NARROW_QUERY = '(max-width: 767.98px)';

export interface ShellSidenav {
  /** Màn hình hẹp (mobile/tablet dọc). */
  readonly isNarrow: Signal<boolean>;
  /** "over" khi hẹp (overlay + backdrop) · "side" khi rộng (giữ hành vi desktop cũ). */
  readonly mode: Signal<'over' | 'side'>;
  /**
   * Ghi được: người dùng bấm nút menu thì đổi tại chỗ, nhưng khi ngưỡng màn hình lật thì
   * `linkedSignal` **đặt lại** về mặc định của ngưỡng mới (hẹp → đóng, rộng → mở).
   */
  readonly opened: WritableSignal<boolean>;
  toggle(): void;
  /**
   * Bấm một mục nav khi đang ở mode "over" thì phải đóng drawer, không thì nó nằm che
   * đúng trang vừa điều hướng tới. Trên màn rộng đây là no-op ⇒ desktop không đổi hành vi.
   */
  closeIfNarrow(): void;
}

/**
 * Trạng thái sidenav dùng chung cho 3 shell (candidate/employer/admin) — cả 3 vốn có cấu
 * trúc y hệt nhau. Gọi trong injection context (field initializer của component).
 */
export function createShellSidenav(): ShellSidenav {
  const isNarrow = toSignal(
    inject(BreakpointObserver)
      .observe(SHELL_NARROW_QUERY)
      .pipe(map((state) => state.matches)),
    // BreakpointObserver phát trạng thái hiện tại ngay lúc subscribe, nên giá trị này chỉ
    // là kiểu-an-toàn (giữ Signal<boolean> thay vì boolean|undefined), không phải mặc định thật.
    { initialValue: false },
  );

  const opened = linkedSignal({ source: isNarrow, computation: (narrow) => !narrow });
  const mode = computed<'over' | 'side'>(() => (isNarrow() ? 'over' : 'side'));

  return {
    isNarrow,
    mode,
    opened,
    toggle: () => opened.update((v) => !v),
    closeIfNarrow: () => {
      if (isNarrow()) opened.set(false);
    },
  };
}
