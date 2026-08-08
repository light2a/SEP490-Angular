import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { FilesApi } from '../../../core/api/files.api';
import { NotifyService } from '../../../core/notify.service';
import { FileDetail } from './file-detail';

/** Giả lập sự kiện `<input type="file">` — component đọc `event.target.files[0]`. */
function pickEvent(file: File | null): Event {
  const input = { files: file ? [file] : [], value: 'x' } as unknown as HTMLInputElement;
  return { target: input } as unknown as Event;
}

const pdf = (name = 'cv.pdf', size = 1000) => {
  const f = new File(['%PDF'], name, { type: 'application/pdf' });
  Object.defineProperty(f, 'size', { value: size });
  return f;
};

describe('FileDetail — xem toàn văn + thay file tại chỗ', () => {
  let api: {
    get: ReturnType<typeof vi.fn>;
    parsedText: ReturnType<typeof vi.fn>;
    replace: ReturnType<typeof vi.fn>;
    download: ReturnType<typeof vi.fn>;
    remove: ReturnType<typeof vi.fn>;
  };
  let notify: { success: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    api = {
      get: vi.fn().mockReturnValue(
        of({
          id: 'f-1',
          fileType: 'cv',
          originalName: 'cv.pdf',
          mimeType: 'application/pdf',
          fileSize: 2048,
          parseStatus: 'completed',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }),
      ),
      parsedText: vi.fn().mockReturnValue(of({ parsedText: 'NGUYEN VAN A - Backend' })),
      replace: vi.fn().mockReturnValue(of({ message: 'Updated successfully' })),
      download: vi.fn(),
      remove: vi.fn().mockReturnValue(of({})),
    };
    notify = { success: vi.fn(), error: vi.fn() };

    TestBed.configureTestingModule({
      imports: [FileDetail],
      providers: [
        provideRouter([]),
        { provide: FilesApi, useValue: api },
        { provide: NotifyService, useValue: { ...notify, warn: vi.fn(), info: vi.fn() } },
      ],
    });
  });

  function render() {
    const fixture = TestBed.createComponent(FileDetail);
    fixture.componentRef.setInput('id', 'f-1');
    fixture.detectChanges();
    return fixture;
  }

  /**
   * Toàn văn nạp bằng endpoint RIÊNG. Danh sách cố ý không mang `parsedText` (payload + hở dữ
   * liệu), nên nếu chỗ này quay ra đọc field từ metadata thì trang sẽ trống trơn trên production
   * mà test dựng sẵn field vẫn xanh.
   */
  it('nạp toàn văn qua GET /parsed-text, không lấy từ metadata', () => {
    const fixture = render();

    expect(api.parsedText).toHaveBeenCalledWith('f-1');
    expect(fixture.nativeElement.textContent).toContain('NGUYEN VAN A - Backend');

    fixture.destroy();
  });

  it('bóc lỗi (endpoint parsed-text lỗi) → nói rõ AI không đọc được, KHÔNG bắn toast lỗi hệ thống', () => {
    api.parsedText.mockReturnValue(throwError(() => new Error('no text')));
    const fixture = render();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Chưa bóc được nội dung');
    // PDF scan là ca bình thường, không phải sự cố → không được làm người dùng hoảng.
    expect(notify.error).not.toHaveBeenCalled();

    fixture.destroy();
  });

  it('thay file: gọi replace với id CŨ (giữ liên kết) rồi nạp lại cả metadata lẫn toàn văn', () => {
    const fixture = render();
    api.get.mockClear();
    api.parsedText.mockClear();

    fixture.componentInstance.onReplace(pickEvent(pdf()));

    expect(api.replace).toHaveBeenCalledWith('f-1', expect.any(File));
    expect(notify.success).toHaveBeenCalled();
    // Nội dung đổi ⇒ cả hai nguồn đều phải nạp lại, không chỉ metadata.
    expect(api.get).toHaveBeenCalledWith('f-1');
    expect(api.parsedText).toHaveBeenCalledWith('f-1');

    fixture.destroy();
  });

  it('chặn file không phải PDF / quá 10MB TRƯỚC khi gọi API (khỏi tốn round-trip 400)', () => {
    const fixture = render();

    const docx = new File(['x'], 'cv.docx', {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    fixture.componentInstance.onReplace(pickEvent(docx));
    expect(api.replace).not.toHaveBeenCalled();
    expect(notify.error).toHaveBeenCalledWith('Chỉ chấp nhận file PDF.');

    fixture.componentInstance.onReplace(pickEvent(pdf('big.pdf', 11 * 1024 * 1024)));
    expect(api.replace).not.toHaveBeenCalled();
    expect(notify.error).toHaveBeenCalledWith('File vượt quá 10MB.');

    fixture.destroy();
  });

  it('huỷ hộp thoại chọn file → không gọi gì', () => {
    const fixture = render();
    fixture.componentInstance.onReplace(pickEvent(null));
    expect(api.replace).not.toHaveBeenCalled();
    fixture.destroy();
  });

  it('xoá xong quay về danh sách', () => {
    const fixture = render();
    const router = TestBed.inject(Router);
    const nav = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    fixture.componentInstance.remove();

    expect(api.remove).toHaveBeenCalledWith('f-1');
    expect(nav).toHaveBeenCalledWith(['/candidate/files']);

    fixture.destroy();
  });
});
