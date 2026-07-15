import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { CampaignApi } from '../../../core/api/campaign.api';
import { ProctorService } from './proctor.service';

/** Đặt document.hidden (jsdom) để giả lập tab bị ẩn. */
function setHidden(v: boolean): void {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => v });
}

describe('ProctorService', () => {
  let reportFlag: ReturnType<typeof vi.fn>;
  let service: ProctorService;

  beforeEach(() => {
    reportFlag = vi.fn().mockReturnValue(of({}));
    TestBed.configureTestingModule({
      providers: [ProctorService, { provide: CampaignApi, useValue: { reportFlag } }],
    });
    service = TestBed.inject(ProctorService);
    setHidden(false);
  });

  afterEach(() => {
    service.stop();
    setHidden(false);
  });

  it('maps window blur → focus_lost and increments warnings', () => {
    service.start('c1', () => 's1');

    window.dispatchEvent(new Event('blur'));

    expect(reportFlag).toHaveBeenCalledWith('c1', 's1', 'focus_lost', expect.any(String));
    expect(service.warnings()).toBe(1);
  });

  it('maps visibilitychange (hidden) → tab_switch', () => {
    service.start('c1', () => 's1');

    setHidden(true);
    document.dispatchEvent(new Event('visibilitychange'));

    expect(reportFlag).toHaveBeenCalledWith('c1', 's1', 'tab_switch', expect.any(String));
  });

  it('maps paste → paste', () => {
    service.start('c1', () => 's1');

    window.dispatchEvent(new Event('paste'));

    expect(reportFlag).toHaveBeenCalledWith('c1', 's1', 'paste', expect.any(String));
  });

  it('debounces a burst of away-events into a single flag', () => {
    service.start('c1', () => 's1');

    // Đổi tab bắn cả blur lẫn visibilitychange gần như đồng thời → chỉ 1 flag.
    window.dispatchEvent(new Event('blur'));
    setHidden(true);
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('blur'));

    expect(reportFlag).toHaveBeenCalledTimes(1);
  });

  it('does not report when there is no session id yet', () => {
    service.start('c1', () => null);

    window.dispatchEvent(new Event('blur'));
    window.dispatchEvent(new Event('paste'));

    expect(reportFlag).not.toHaveBeenCalled();
    expect(service.warnings()).toBe(0);
  });

  it('stop() removes listeners so later events do not report', () => {
    service.start('c1', () => 's1');
    service.stop();

    window.dispatchEvent(new Event('blur'));

    expect(reportFlag).not.toHaveBeenCalled();
    expect(service.active()).toBe(false);
  });
});
