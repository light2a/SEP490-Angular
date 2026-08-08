import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { CampaignSlots } from './campaign-slots';
import { NotifyService } from '../../../core/notify.service';
import { CampaignSlotResponse } from '../../../core/models';
import { environment } from '../../../../environments/environment';

const CAMPAIGN_ID = 'c1';
const SLOTS = `${environment.apiBase}/campaign/${CAMPAIGN_ID}/slots`;

function slot(partial: Partial<CampaignSlotResponse> = {}): CampaignSlotResponse {
  return {
    id: 'slot-1',
    startsAt: '2026-09-01T02:00:00Z',
    endsAt: '2026-09-01T04:00:00Z',
    capacity: 10,
    assignedCount: 3,
    startedCount: 0,
    ...partial,
  };
}

describe('CampaignSlots — khung giờ phỏng vấn', () => {
  let httpMock: HttpTestingController;
  let notify: Record<string, ReturnType<typeof vi.fn>>;

  function setup(list: CampaignSlotResponse[] = [slot()]) {
    notify = { success: vi.fn(), error: vi.fn(), warn: vi.fn(), info: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: NotifyService, useValue: notify },
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(CampaignSlots);
    fixture.componentRef.setInput('campaignId', CAMPAIGN_ID);
    fixture.detectChanges();
    httpMock.expectOne((r) => r.url === SLOTS && r.method === 'GET').flush(list);
    fixture.detectChanges();
    return fixture;
  }

  afterEach(() => httpMock.verify());

  it('nạp danh sách khung giờ khi mở màn', () => {
    const cmp = setup([slot(), slot({ id: 'slot-2' })]).componentInstance;
    expect(cmp.slots().length).toBe(2);
  });

  // ── Ba ca backend sẽ từ chối, chặn trước ở client ───────────────────────────
  it('giờ kết thúc <= giờ bắt đầu → chặn, KHÔNG phát request', () => {
    const cmp = setup().componentInstance;
    cmp.draft = { startsAt: '2026-09-01T10:00', endsAt: '2026-09-01T09:00', capacity: 5 };

    cmp.save();

    httpMock.expectNone((r) => r.method === 'POST');
    expect(notify['warn']).toHaveBeenCalled();
  });

  /**
   * Sức chứa 0 là ca nguy hiểm: hợp lệ về kiểu, nhưng khung giờ không nhận được ai.
   */
  it('sức chứa < 1 → chặn, KHÔNG phát request', () => {
    const cmp = setup().componentInstance;
    cmp.draft = { startsAt: '2026-09-01T09:00', endsAt: '2026-09-01T10:00', capacity: 0 };

    cmp.save();

    httpMock.expectNone((r) => r.method === 'POST');
    expect(notify['warn']).toHaveBeenCalled();
  });

  it('thiếu giờ → chặn, KHÔNG phát request', () => {
    const cmp = setup().componentInstance;
    cmp.draft = { startsAt: '', endsAt: '2026-09-01T10:00', capacity: 5 };

    cmp.save();

    httpMock.expectNone((r) => r.method === 'POST');
    expect(notify['warn']).toHaveBeenCalled();
  });

  /**
   * Hạ sức chứa xuống dưới số lời mời ĐÃ GÁN — backend trả 400, nhưng phải nói trước để HR biết
   * cách sửa là thu hồi bớt lời mời chứ không phải "hệ thống lỗi".
   */
  it('sửa: hạ sức chứa dưới số đã gán → chặn, KHÔNG phát request', () => {
    const cmp = setup([slot({ capacity: 10, assignedCount: 6 })]).componentInstance;
    cmp.startEdit(slot({ capacity: 10, assignedCount: 6 }));
    cmp.draft.capacity = 4;

    cmp.save();

    httpMock.expectNone((r) => r.method === 'PUT');
    expect(notify['warn']).toHaveBeenCalledWith(expect.stringContaining('6'));
  });

  // ── Đường thành công ────────────────────────────────────────────────────────
  it('tạo mới → POST với giờ dạng UTC đuôi Z (Npgsql từ chối kind Local)', () => {
    const cmp = setup([]).componentInstance;
    cmp.draft = { startsAt: '2026-09-01T09:00', endsAt: '2026-09-01T11:00', capacity: 8 };

    cmp.save();

    const req = httpMock.expectOne((r) => r.url === SLOTS && r.method === 'POST');
    expect(req.request.body.capacity).toBe(8);
    expect(req.request.body.startsAt).toMatch(/Z$/);
    expect(req.request.body.endsAt).toMatch(/Z$/);
    req.flush(slot());
    httpMock.expectOne((r) => r.url === SLOTS && r.method === 'GET').flush([slot()]);
    expect(notify['success']).toHaveBeenCalled();
  });

  it('sửa → PUT đúng slot rồi thoát chế độ sửa', () => {
    const cmp = setup().componentInstance;
    cmp.startEdit(slot());
    cmp.draft.capacity = 12;

    cmp.save();

    const req = httpMock.expectOne(`${SLOTS}/slot-1`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body.capacity).toBe(12);
    req.flush(slot({ capacity: 12 }));
    httpMock.expectOne((r) => r.url === SLOTS && r.method === 'GET').flush([slot({ capacity: 12 })]);
    expect(cmp.editingId()).toBeNull();
  });

  // ── 409 phải thành lời khuyên, không phải lỗi đỏ chung chung ────────────────
  it('409 lúc tạo (chồng lấn giờ) → cảnh báo nêu cách sửa, không phải error', () => {
    const cmp = setup([]).componentInstance;
    cmp.draft = { startsAt: '2026-09-01T09:00', endsAt: '2026-09-01T11:00', capacity: 8 };

    cmp.save();

    httpMock
      .expectOne((r) => r.url === SLOTS && r.method === 'POST')
      .flush({ error: 'Khung giờ bị chồng lấn.' }, { status: 409, statusText: 'Conflict' });

    expect(notify['warn']).toHaveBeenCalled();
    expect(notify['error']).not.toHaveBeenCalled();
    expect(cmp.busy()).toBe(false);
  });

  it('409 lúc xoá (đang có người thi) → cảnh báo, không phải error', () => {
    const cmp = setup().componentInstance;
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    cmp.remove(slot());

    httpMock
      .expectOne(`${SLOTS}/slot-1`)
      .flush(
        { error: 'Không thể xóa khung giờ đang có ứng viên thi.' },
        { status: 409, statusText: 'Conflict' },
      );

    expect(notify['warn']).toHaveBeenCalled();
    expect(notify['error']).not.toHaveBeenCalled();
  });

  it('huỷ xác nhận xoá → KHÔNG phát request', () => {
    const cmp = setup().componentInstance;
    vi.spyOn(window, 'confirm').mockReturnValue(false);

    cmp.remove(slot());

    httpMock.expectNone((r) => r.method === 'DELETE');
  });
});
