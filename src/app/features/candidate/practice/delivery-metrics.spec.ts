import { TestBed } from '@angular/core/testing';
import { DeliveryMetrics } from '../../../core/models';
import {
  DeliveryMetricsPanel,
  fillerEntries,
  hasDeliveryMetrics,
  speechRateBand,
} from './delivery-metrics';

/**
 * Cả file này nhắm vào MỘT hạng lỗi: khối chỉ số vẫn hiện ra đẹp đẽ, không lỗi nào, nhưng người
 * luyện rút ra kết luận SAI về chính mình. Ba cách sai đã biết trước:
 *   1. khuyết bị vẽ thành 0  → dựng ra một buổi "không ngập ngừng lần nào" (lệch về phía KHEN,
 *      đúng hạng lỗi đã phải vá ở lớp mốc radar F14);
 *   2. "0 từ đệm" đọc thành lời khen → trong khi máy nhận dạng vốn nuốt bớt từ đệm;
 *   3. đơn vị đọc thành words-per-minute tiếng Anh → tiếng Việt đơn âm tiết, hai thang khác nhau.
 */

const metrics = (over: Partial<DeliveryMetrics> = {}): DeliveryMetrics => ({
  speechRateWpm: 240,
  longestPauseSec: 1.4,
  pauseCount: 3,
  silenceRatio: 0.22,
  fillerCount: 5,
  fillerBreakdown: { ừm: 3, 'kiểu như': 2 },
  ...over,
});

function render(m: DeliveryMetrics | null | undefined): string {
  const fixture = TestBed.createComponent(DeliveryMetricsPanel);
  fixture.componentRef.setInput('metrics', m);
  fixture.detectChanges();
  return fixture.nativeElement.textContent as string;
}

describe('DeliveryMetricsPanel — khuyết phải để KHUYẾT', () => {
  beforeEach(() => TestBed.configureTestingModule({ imports: [DeliveryMetricsPanel] }));

  it('null → nói "chưa đo được" và KHÔNG in ra con số nào', () => {
    const text = render(null);

    expect(text).toContain('Chưa đo được');
    // Chốt thẳng thứ dễ bị "sửa nhầm" nhất: điền 0 vào chỗ khuyết. Bất kỳ chữ số nào lọt ra ở
    // nhánh này đều nghĩa là ta đang bịa một số đo chưa từng tồn tại.
    expect(text).not.toMatch(/\d/);
  });

  it('undefined (field vắng hẳn trong payload) cũng là khuyết, không phải 0', () => {
    const text = render(undefined);

    expect(text).toContain('Chưa đo được');
    expect(text).not.toMatch(/\d/);
  });

  it('cụm chỉ số toàn số 0 là SỐ ĐO THẬT — vẫn hiện, không coi là khuyết', () => {
    // Ranh giới quan trọng: 0 đo được ≠ không đo được. Coi cụm-toàn-0 là khuyết thì mất luôn
    // trường hợp cần cảnh báo nhất (im lặng suốt / không nói gì).
    const text = render(
      metrics({ speechRateWpm: 0, longestPauseSec: 0, pauseCount: 0, silenceRatio: 0, fillerCount: 0, fillerBreakdown: {} }),
    );

    expect(text).not.toContain('Chưa đo được');
  });
});

describe('DeliveryMetricsPanel — không được nói dối về số từ đệm', () => {
  beforeEach(() => TestBed.configureTestingModule({ imports: [DeliveryMetricsPanel] }));

  it('fillerCount = 0 vẫn kèm cảnh báo "tối thiểu", không phải lời khen', () => {
    const text = render(metrics({ fillerCount: 0, fillerBreakdown: {} })).toLowerCase();

    expect(text).toContain('tối thiểu');
    // Máy nhận dạng nuốt bớt từ đệm ⇒ không được kết luận hộ người dùng rằng họ nói sạch.
    expect(text).not.toContain('không có từ đệm nào');
    expect(text).not.toContain('rất trôi chảy');
  });

  it('số từ đệm trình bày như cận dưới ("ít nhất"), không phải con số chốt', () => {
    expect(render(metrics({ fillerCount: 5 }))).toContain('ít nhất 5');
  });

  it('breakdown rỗng → KHÔNG dựng khung liệt kê rỗng', () => {
    // Tiền lệ F13: khung `<details>` với thân rỗng chính là ca mà guard sinh ra để chặn.
    expect(render(metrics({ fillerCount: 0, fillerBreakdown: {} }))).not.toContain('×');
  });
});

describe('DeliveryMetricsPanel — đơn vị là ÂM TIẾT/phút', () => {
  beforeEach(() => TestBed.configureTestingModule({ imports: [DeliveryMetricsPanel] }));

  it('ghi rõ "âm tiết/phút", không mượn đơn vị tiếng Anh', () => {
    const text = render(metrics());
    const lower = text.toLowerCase();

    // Bám vào ĐÚNG con số chứ không chỉ tìm chuỗi ở đâu đó trong DOM: câu chú thích "180–320 âm
    // tiết/phút" ở dưới cũng chứa cụm này, nên nếu chỉ `toContain('âm tiết/phút')` thì đổi riêng
    // nhãn cạnh con số sang một đơn vị bịa vẫn lọt. (Tìm ra khi soi DOM lúc chạy mutation M3.)
    expect(text).toContain('240 âm tiết/phút');
    // Tiếng Việt đơn âm tiết: gọi nó là "từ/phút" hay "wpm" là so người dùng với một thang khác.
    expect(lower).not.toContain('words per minute');
    expect(lower).not.toContain('wpm');
    expect(text).not.toContain('từ/phút');
  });

  it('dải 180–320 trình bày như THAM KHẢO, không phải đạt/không đạt', () => {
    const text = render(metrics({ speechRateWpm: 120 })).toLowerCase();

    expect(text).toContain('tham khảo');
    // Nói chậm không phải lỗi — dải này chỉ để tự soi.
    expect(text).not.toContain('không đạt');
    expect(text).not.toContain('chưa đạt');
  });
});

/** Hàm thuần — test bắn thẳng, không cần TestBed (kiểu `radar-chart.spec.ts`). */
describe('speechRateBand — biên của dải tham khảo', () => {
  it('dưới 180 = chậm, đúng biên 180 và 320 vẫn là bình thường, trên 320 = nhanh', () => {
    expect(speechRateBand(179)).toBe('slow');
    expect(speechRateBand(180)).toBe('normal');
    expect(speechRateBand(250)).toBe('normal');
    expect(speechRateBand(320)).toBe('normal');
    expect(speechRateBand(321)).toBe('fast');
  });
});

describe('fillerEntries', () => {
  it('sắp giảm dần theo số lần', () => {
    expect(fillerEntries(metrics({ fillerBreakdown: { ờ: 1, ừm: 7, 'kiểu như': 4 } }))).toEqual([
      ['ừm', 7],
      ['kiểu như', 4],
      ['ờ', 1],
    ]);
  });

  it('bỏ mục 0 lần — hiện «×0» là bày một thứ không xảy ra', () => {
    expect(fillerEntries(metrics({ fillerBreakdown: { ừm: 0, ờ: 2 } }))).toEqual([['ờ', 2]]);
  });
});

describe('hasDeliveryMetrics', () => {
  it('chỉ null/undefined mới là khuyết; cụm toàn 0 vẫn là có đo', () => {
    expect(hasDeliveryMetrics(null)).toBe(false);
    expect(hasDeliveryMetrics(undefined)).toBe(false);
    expect(hasDeliveryMetrics(metrics({ speechRateWpm: 0, fillerCount: 0 }))).toBe(true);
  });
});
