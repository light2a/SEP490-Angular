import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { environment } from '../../../environments/environment';
import { OwnerType } from '../../core/models';
import { OwnerPicker } from './owner-picker';

const USERS = `${environment.apiBase}/auth/admin/users`;
const ORGS = `${environment.apiBase}/auth/admin/organizations`;
const GUID = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';

describe('OwnerPicker — chọn chủ ví cho màn admin', () => {
  let fixture: ComponentFixture<OwnerPicker>;
  let httpMock: HttpTestingController;

  function setup(ownerType: OwnerType) {
    fixture = TestBed.createComponent(OwnerPicker);
    fixture.componentRef.setInput('ownerType', ownerType);
    fixture.detectChanges();
    return fixture.componentInstance;
  }

  beforeEach(() => {
    // App chạy zoneless nên `fakeAsync` của Angular không dùng được (cần zone-testing.js).
    // `debounceTime` của RxJS chạy trên setTimeout ⇒ fake timer của vitest điều khiển được.
    vi.useFakeTimers();
    TestBed.configureTestingModule({
      imports: [OwnerPicker],
      providers: [provideZonelessChangeDetection(), provideHttpClient(), provideHttpClientTesting()],
    });
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    vi.useRealTimers();
  });

  it('gõ email → tìm user qua ?search=', () => {
    const c = setup(OwnerType.User);
    c.onQuery('duc@');
    vi.advanceTimersByTime(300);

    const req = httpMock.expectOne((r) => r.url === USERS);
    expect(req.request.params.get('search')).toBe('duc@');
    req.flush([{ id: 'u1', email: 'duc@isas.local', fullName: 'Đức', role: 'Candidate' }]);

    expect(c.options().length).toBe(1);
    expect(c.options()[0].primary).toBe('duc@isas.local');
    // Tên + org đi kèm để phân biệt hai account trùng tiền tố email — thứ GUID không nói được gì.
    expect(c.options()[0].secondary).toBe('Đức');
  });

  it('loại ví Tổ chức → tìm org, KHÔNG gọi endpoint user', () => {
    const c = setup(OwnerType.Org);
    c.onQuery('acme');
    vi.advanceTimersByTime(300);

    const req = httpMock.expectOne((r) => r.url === ORGS);
    expect(req.request.params.get('search')).toBe('acme');
    httpMock.expectNone((r) => r.url === USERS);
    req.flush([{ id: 'o1', name: 'Acme', taxCode: '123', createdAt: '', memberCount: 2 }]);

    expect(c.options()[0].primary).toBe('Acme');
  });

  it('chọn một dòng → ownerId là id của dòng đó', () => {
    const c = setup(OwnerType.User);
    c.onQuery('duc@');
    vi.advanceTimersByTime(300);
    httpMock.expectOne((r) => r.url === USERS).flush([
      { id: 'u1', email: 'duc@isas.local', fullName: null, role: 'Candidate' },
    ]);

    c.pick(c.options()[0]);

    expect(c.ownerId()).toBe('u1');
    expect(c.selected()?.primary).toBe('duc@isas.local');
  });

  /**
   * Admin thường cầm sẵn id từ ticket/log. Chặn đường dán thì bắt họ đi tìm ngược lại email — và
   * search theo email sẽ KHÔNG BAO GIỜ khớp một GUID, nên phải nhận trước khi gọi API.
   */
  it('dán GUID → nhận thẳng, không bắn request tìm kiếm', () => {
    const c = setup(OwnerType.User);
    c.onQuery(GUID);
    vi.advanceTimersByTime(300);

    expect(c.ownerId()).toBe(GUID);
    httpMock.expectNone((r) => r.url === USERS);
  });

  it('gõ dưới 2 ký tự → không bắn request', () => {
    const c = setup(OwnerType.User);
    c.onQuery('d');
    vi.advanceTimersByTime(300);

    httpMock.expectNone((r) => r.url === USERS);
    expect(c.options().length).toBe(0);
  });

  it('gõ nhanh nhiều ký tự → chỉ một request (debounce)', () => {
    const c = setup(OwnerType.User);
    c.onQuery('du');
    vi.advanceTimersByTime(100);
    c.onQuery('duc');
    vi.advanceTimersByTime(100);
    c.onQuery('duc@');
    vi.advanceTimersByTime(300);

    httpMock.expectOne((r) => r.url === USERS).flush([]);
  });

  /**
   * 🔴 Đổi loại ví mà giữ nguyên id đã chọn = cấp credit/gói cho một TỔ CHỨC trùng id với người vừa
   * chọn. Không có endpoint nào thu hồi credit đã cấp nhầm, nên phải xoá sạch lựa chọn cũ.
   */
  it('đổi loại ví → xoá lựa chọn cũ', () => {
    const c = setup(OwnerType.User);
    c.onQuery('duc@');
    vi.advanceTimersByTime(300);
    httpMock.expectOne((r) => r.url === USERS).flush([
      { id: 'u1', email: 'duc@isas.local', fullName: null, role: 'Candidate' },
    ]);
    c.pick(c.options()[0]);
    expect(c.ownerId()).toBe('u1');

    fixture.componentRef.setInput('ownerType', OwnerType.Org);
    fixture.detectChanges();

    expect(c.ownerId()).toBe('');
    expect(c.selected()).toBeNull();
    expect(c.query()).toBe('');
  });

  it('sửa lại ô nhập sau khi đã chọn → bỏ lựa chọn, không giữ id cũ', () => {
    const c = setup(OwnerType.User);
    c.onQuery('duc@');
    vi.advanceTimersByTime(300);
    httpMock.expectOne((r) => r.url === USERS).flush([
      { id: 'u1', email: 'duc@isas.local', fullName: null, role: 'Candidate' },
    ]);
    c.pick(c.options()[0]);

    c.onQuery('duc@x');
    vi.advanceTimersByTime(300);
    httpMock.expectOne((r) => r.url === USERS).flush([]);

    // Id cũ còn sót lại = cấp cho người vừa bị gõ đè lên.
    expect(c.ownerId()).toBe('');
    expect(c.selected()).toBeNull();
  });

  it('API lỗi → không khoá màn, admin vẫn dán GUID được', () => {
    const c = setup(OwnerType.User);
    c.onQuery('duc@');
    vi.advanceTimersByTime(300);
    httpMock.expectOne((r) => r.url === USERS).flush('boom', { status: 500, statusText: 'err' });

    expect(c.loading()).toBe(false);
    expect(c.options().length).toBe(0);
  });
});
