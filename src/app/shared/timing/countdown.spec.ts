import { createCountdown } from './countdown';

/**
 * Đồng hồ đếm ngược dùng cho màn luyện B2C. Test bằng fake timer vì đây là logic thời gian thuần —
 * không cần TestBed (factory hàm thuần, không phải service Angular).
 */
describe('createCountdown', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('đếm lùi mỗi giây', () => {
    const c = createCountdown({ onExpire: vi.fn() });
    c.start(10);

    expect(c.remainingSec()).toBe(10);
    vi.advanceTimersByTime(3000);
    expect(c.remainingSec()).toBe(7);

    c.stop();
  });

  it('paused → đồng hồ ĐỨNG YÊN (không tính phí thời gian lúc avatar đọc đề)', () => {
    let paused = true;
    const c = createCountdown({ paused: () => paused, onExpire: vi.fn() });
    c.start(10);

    vi.advanceTimersByTime(5000);
    expect(c.remainingSec()).toBe(10);

    paused = false;
    vi.advanceTimersByTime(2000);
    expect(c.remainingSec()).toBe(8);

    c.stop();
  });

  it('limit <= 0 = KHÔNG giới hạn → không chạy, không hết giờ', () => {
    const onExpire = vi.fn();
    const c = createCountdown({ onExpire });
    c.start(0);

    vi.advanceTimersByTime(60_000);

    expect(c.remainingSec()).toBe(0);
    expect(onExpire).not.toHaveBeenCalled();
  });

  it('onExpire bắn ĐÚNG 1 lần dù thời gian chạy tiếp', () => {
    const onExpire = vi.fn();
    const c = createCountdown({ onExpire });
    c.start(2);

    vi.advanceTimersByTime(30_000);

    expect(onExpire).toHaveBeenCalledTimes(1);
    expect(c.remainingSec()).toBe(0);
  });

  it('stop() giữa chừng → không bao giờ hết giờ', () => {
    const onExpire = vi.fn();
    const c = createCountdown({ onExpire });
    c.start(5);

    vi.advanceTimersByTime(2000);
    c.stop();
    vi.advanceTimersByTime(30_000);

    expect(onExpire).not.toHaveBeenCalled();
  });

  it('start() lại → đặt lại đồng hồ cho câu mới', () => {
    const c = createCountdown({ onExpire: vi.fn() });
    c.start(10);
    vi.advanceTimersByTime(4000);
    expect(c.remainingSec()).toBe(6);

    c.start(30);
    expect(c.remainingSec()).toBe(30);

    c.stop();
  });

  it('timePct phản ánh phần trăm còn lại', () => {
    const c = createCountdown({ onExpire: vi.fn() });
    c.start(10);
    vi.advanceTimersByTime(5000);

    expect(c.timePct()).toBe(50);

    c.stop();
  });
});
