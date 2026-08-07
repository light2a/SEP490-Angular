import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { BreakpointObserver, BreakpointState } from '@angular/cdk/layout';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { Signal, Type, WritableSignal, signal } from '@angular/core';
import { AdminShell } from './admin-shell/admin-shell';
import { EmployerShell } from './employer-shell/employer-shell';
import { CandidateShell } from './candidate-shell/candidate-shell';
import { SHELL_NARROW_QUERY } from './shell-sidenav';
import { AuthStore } from '../core/auth/auth.store';

/** Ghi lại query nào được hỏi, và cho phép lật ngưỡng giữa test. */
class FakeBreakpointObserver {
  readonly queries: string[] = [];
  private readonly state: BehaviorSubject<BreakpointState>;

  constructor(matches: boolean) {
    this.state = new BehaviorSubject<BreakpointState>({ matches, breakpoints: {} });
  }

  observe(query: string | readonly string[]): Observable<BreakpointState> {
    this.queries.push(String(query));
    return this.state;
  }

  /** Mô phỏng người dùng xoay máy / kéo cửa sổ qua ngưỡng. */
  emit(matches: boolean): void {
    this.state.next({ matches, breakpoints: {} });
  }
}

/** Bề mặt sidenav mà cả 3 shell phải có — dùng để chạy CÙNG một bộ kiểm cho cả ba. */
interface ShellLike {
  readonly opened: WritableSignal<boolean>;
  readonly sidenavMode: Signal<'over' | 'side'>;
  toggle(): void;
  onNavigate(): void;
}

const SHELLS: { name: string; cmp: Type<ShellLike> }[] = [
  { name: 'AdminShell', cmp: AdminShell },
  { name: 'EmployerShell', cmp: EmployerShell },
  { name: 'CandidateShell', cmp: CandidateShell },
];

/**
 * F24 — 3 shell trước đây luôn `mode="side"` + `opened=true`, nên ở 375px sidenav chiếm ~59%
 * chiều rộng và nội dung chỉ còn ~155px. Kiểm bằng TRẠNG THÁI (mode/opened) chứ không đo pixel:
 * jsdom không layout thật nên đo kích thước ở đây là tự lừa mình.
 */
describe('F24 — sidenav 3 shell theo bề rộng màn hình', () => {
  function setup(cmpType: Type<ShellLike>, narrow: boolean) {
    const bp = new FakeBreakpointObserver(narrow);
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: BreakpointObserver, useValue: bp },
        {
          provide: AuthStore,
          useValue: {
            displayName: signal<string | null>('Người dùng'),
            orgRole: signal<string | null>('OrgAdmin'),
            logout: () => of(true),
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(cmpType);
    fixture.detectChanges();
    return { fixture, cmp: fixture.componentInstance, bp };
  }

  afterEach(() => TestBed.resetTestingModule());

  for (const { name, cmp: cmpType } of SHELLS) {
    describe(name, () => {
      // ── Vế chính của task ────────────────────────────────────────────────────
      it('màn hẹp → mode "over" và ĐÓNG mặc định', () => {
        const { cmp } = setup(cmpType, true);
        expect(cmp.sidenavMode()).toBe('over');
        expect(cmp.opened()).toBe(false);
      });

      // Desktop KHÔNG được đổi hành vi — đây là vế bảo vệ, không phải vế tính năng.
      it('màn rộng → giữ nguyên mode "side" và MỞ như trước', () => {
        const { cmp } = setup(cmpType, false);
        expect(cmp.sidenavMode()).toBe('side');
        expect(cmp.opened()).toBe(true);
      });

      it('dùng đúng ngưỡng SHELL_NARROW_QUERY', () => {
        const { bp } = setup(cmpType, true);
        expect(bp.queries).toContain(SHELL_NARROW_QUERY);
      });

      it('nút menu mở lại được drawer trên màn hẹp', () => {
        const { cmp } = setup(cmpType, true);
        expect(cmp.opened()).toBe(false);
        cmp.toggle();
        expect(cmp.opened()).toBe(true);
        cmp.toggle();
        expect(cmp.opened()).toBe(false);
      });

      // Ở mode "over" drawer nằm CHE nội dung, nên chọn xong một mục phải tự đóng.
      it('chọn mục nav trên màn hẹp → đóng drawer', () => {
        const { cmp } = setup(cmpType, true);
        cmp.toggle();
        expect(cmp.opened()).toBe(true);
        cmp.onNavigate();
        expect(cmp.opened()).toBe(false);
      });

      it('chọn mục nav trên màn rộng → KHÔNG đóng (no-op, desktop giữ nguyên)', () => {
        const { cmp } = setup(cmpType, false);
        cmp.onNavigate();
        expect(cmp.opened()).toBe(true);
      });

      // linkedSignal: lật ngưỡng phải ĐẶT LẠI mặc định, không giữ lựa chọn cũ của người dùng —
      // nếu không thì thu cửa sổ lại sẽ để drawer mở đè lên nội dung.
      it('lật ngưỡng rộng→hẹp: đặt lại về đóng + over', () => {
        const { cmp, bp, fixture } = setup(cmpType, false);
        expect(cmp.opened()).toBe(true);

        bp.emit(true);
        fixture.detectChanges();

        expect(cmp.sidenavMode()).toBe('over');
        expect(cmp.opened()).toBe(false);
      });

      it('lật ngưỡng hẹp→rộng: đặt lại về mở + side', () => {
        const { cmp, bp, fixture } = setup(cmpType, true);
        expect(cmp.opened()).toBe(false);

        bp.emit(false);
        fixture.detectChanges();

        expect(cmp.sidenavMode()).toBe('side');
        expect(cmp.opened()).toBe(true);
      });

      // mat-sidenav ở mode "over" tự đóng khi bấm backdrop/ESC. Bind một chiều sẽ để signal
      // lệch với DOM ⇒ lần bấm nút menu sau đó "không có tác dụng".
      it('drawer tự đóng (backdrop/ESC) → signal đồng bộ, nút menu mở lại được ngay', () => {
        const { cmp, fixture } = setup(cmpType, true);
        cmp.toggle();
        fixture.detectChanges();
        expect(cmp.opened()).toBe(true);

        // Material phát openedChange(false) khi tự đóng; template phải ghi ngược vào signal.
        const drawer = fixture.debugElement.query((n) => n.name === 'mat-sidenav');
        expect(drawer).not.toBeNull();
        drawer.triggerEventHandler('openedChange', false);
        expect(cmp.opened()).toBe(false);

        cmp.toggle();
        expect(cmp.opened()).toBe(true);
      });
    });
  }
});
