import {
  InvoiceStatus,
  JOB_CATEGORY_LABEL,
  ORDER_STATUS_LABEL,
  OrderKind,
  OrderStatus,
  OwnerType,
  PACKAGE_TYPE_LABEL,
  PackageType,
  SESSION_STATUS_LABEL,
  SESSION_TERMINAL,
} from './enums';

describe('Payment numeric enums', () => {
  it('OrderStatus values match backend integer contract', () => {
    expect(OrderStatus.Pending).toBe(1);
    expect(OrderStatus.Paid).toBe(2);
    expect(OrderStatus.Failed).toBe(3);
    expect(OrderStatus.Expired).toBe(4);
    expect(OrderStatus.Cancelled).toBe(5);
  });

  it('PackageType / OwnerType / OrderKind / InvoiceStatus values', () => {
    expect(PackageType.OneTime).toBe(1);
    expect(PackageType.Subscription).toBe(2);
    expect(OwnerType.Org).toBe(0);
    expect(OwnerType.User).toBe(1);
    expect(OrderKind.CreditPack).toBe(0);
    expect(OrderKind.InvoiceSettlement).toBe(1);
    expect(InvoiceStatus.Issued).toBe(0);
    expect(InvoiceStatus.Paid).toBe(1);
    expect(InvoiceStatus.Overdue).toBe(2);
    expect(InvoiceStatus.Void).toBe(3);
  });
});

describe('Label maps sanity', () => {
  it('ORDER_STATUS_LABEL keyed by numeric enum value', () => {
    expect(ORDER_STATUS_LABEL[OrderStatus.Paid]).toBe('Đã thanh toán');
    expect(ORDER_STATUS_LABEL[OrderStatus.Pending]).toBe('Đang chờ thanh toán');
  });

  it('PACKAGE_TYPE_LABEL / JOB_CATEGORY_LABEL / SESSION_STATUS_LABEL', () => {
    expect(PACKAGE_TYPE_LABEL[PackageType.OneTime]).toBe('Mua lẻ');
    expect(PACKAGE_TYPE_LABEL[PackageType.Subscription]).toBe('Gói định kỳ');
    expect(JOB_CATEGORY_LABEL.BE).toBe('Backend (BE)');
    expect(SESSION_STATUS_LABEL.Scored).toBe('Đã chấm');
  });

  it('SESSION_TERMINAL contains the three terminal statuses', () => {
    expect(SESSION_TERMINAL).toContain('Scored');
    expect(SESSION_TERMINAL).toContain('Failed');
    expect(SESSION_TERMINAL).toContain('SessionAbandoned');
    expect(SESSION_TERMINAL).not.toContain('InProgress');
  });
});
