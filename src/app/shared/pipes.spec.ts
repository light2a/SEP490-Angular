import {
  JobCategoryPipe,
  OrderStatusPipe,
  PackageTypePipe,
  SessionStatusPipe,
  VndPipe,
} from './pipes';

describe('VndPipe', () => {
  const pipe = new VndPipe();
  it('formats numbers with vi-VN grouping + ₫ suffix', () => {
    expect(pipe.transform(1000000)).toBe('1.000.000 ₫');
    expect(pipe.transform(0)).toBe('0 ₫');
  });
  it('returns em-dash for null/undefined', () => {
    expect(pipe.transform(null)).toBe('—');
    expect(pipe.transform(undefined)).toBe('—');
  });
});

describe('OrderStatusPipe', () => {
  const pipe = new OrderStatusPipe();
  it('maps numeric order status (1..5) to VN label', () => {
    expect(pipe.transform(1)).toBe('Đang chờ thanh toán');
    expect(pipe.transform(2)).toBe('Đã thanh toán');
    expect(pipe.transform(4)).toBe('Hết hạn');
  });
  it('returns empty string for null and falls back to String(v) for unknown code', () => {
    expect(pipe.transform(null)).toBe('');
    expect(pipe.transform(99)).toBe('99');
  });
});

describe('SessionStatusPipe', () => {
  const pipe = new SessionStatusPipe();
  it('maps known statuses and passes through unknown', () => {
    expect(pipe.transform('Scored')).toBe('Đã chấm');
    expect(pipe.transform('InProgress')).toBe('Đang làm');
    expect(pipe.transform('WeirdUnknown')).toBe('WeirdUnknown');
  });
  it('returns empty string for null/undefined', () => {
    expect(pipe.transform(null)).toBe('');
    expect(pipe.transform(undefined)).toBe('');
  });
});

describe('JobCategoryPipe', () => {
  const pipe = new JobCategoryPipe();
  it('maps job categories', () => {
    expect(pipe.transform('BE')).toBe('Backend (BE)');
    expect(pipe.transform('FE')).toBe('Frontend (FE)');
  });
  it('returns empty string for null', () => {
    expect(pipe.transform(null)).toBe('');
  });
});

describe('PackageTypePipe', () => {
  const pipe = new PackageTypePipe();
  it('maps numeric package type to VN label', () => {
    expect(pipe.transform(1)).toBe('Mua lẻ');
    expect(pipe.transform(2)).toBe('Gói định kỳ');
  });
  it('returns empty for null and String(v) fallback for unknown', () => {
    expect(pipe.transform(null)).toBe('');
    expect(pipe.transform(7)).toBe('7');
  });
});
