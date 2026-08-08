import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import { FilesApi } from './files.api';

const BASE = `${environment.apiBase}/interview/files`;

describe('FilesApi', () => {
  let api: FilesApi;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(FilesApi);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  /**
   * Tên field multipart của PUT là `newFile`, KHÁC hẳn `file` của POST upload.
   *
   * Đây đúng lớp lỗi đã cắn repo này nhiều lần: lệch tên khoá KHÔNG ném exception, BE chỉ đọc ra
   * null rồi trả 400 "Không có file." — nhìn từ FE thì giống hệt "người dùng chưa chọn file".
   * Khoá cả HAI vế (có `newFile`, KHÔNG có `file`) để lần refactor nào đó copy nhầm từ `upload()`
   * sang sẽ làm test đỏ chứ không âm thầm hỏng.
   */
  it('replace() PUT multipart với field `newFile` (không phải `file`)', () => {
    const pdf = new File(['%PDF-1.4'], 'cv-moi.pdf', { type: 'application/pdf' });
    api.replace('f-1', pdf).subscribe();

    const req = httpMock.expectOne(`${BASE}/f-1`);
    expect(req.request.method).toBe('PUT');

    const body = req.request.body as FormData;
    expect(body).toBeInstanceOf(FormData);
    expect(body.get('file')).toBeNull();
    const sent = body.get('newFile') as File;
    expect(sent).toBeInstanceOf(Blob);
    expect(sent.name).toBe('cv-moi.pdf');

    req.flush({ message: 'Updated successfully', parsedCv: null });
  });

  /**
   * PUT KHÔNG nhận `fileType`: loại kế thừa từ bản ghi cũ. Gửi kèm là hứa với người dùng rằng đổi
   * được cv ↔ jd, trong khi BE bỏ qua hoàn toàn.
   */
  it('replace() không gửi kèm fileType', () => {
    api.replace('f-1', new File(['x'], 'a.pdf', { type: 'application/pdf' })).subscribe();

    const req = httpMock.expectOne(`${BASE}/f-1`);
    expect(req.request.params.has('fileType')).toBe(false);
    expect((req.request.body as FormData).get('fileType')).toBeNull();

    req.flush({ message: 'Updated successfully' });
  });

  it('upload() vẫn dùng field `file` + query fileType (không bị PUT làm lệch)', () => {
    api.upload(new File(['x'], 'jd.pdf', { type: 'application/pdf' }), 'jd').subscribe();

    const req = httpMock.expectOne((r) => r.url === `${BASE}/upload`);
    expect(req.request.method).toBe('POST');
    expect(req.request.params.get('fileType')).toBe('jd');
    expect((req.request.body as FormData).get('file')).toBeInstanceOf(Blob);

    req.flush({ fileId: 'f-1' });
  });

  it('parsedText() đọc endpoint riêng, không trông vào field parsedText của list', () => {
    api.parsedText('f-1').subscribe();

    const req = httpMock.expectOne(`${BASE}/f-1/parsed-text`);
    expect(req.request.method).toBe('GET');

    req.flush({ parsedText: 'noi dung' });
  });
});
