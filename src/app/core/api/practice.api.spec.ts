import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { PracticeApi } from './practice.api';
import { CreatePracticeSessionRequest } from '../models';
import { environment } from '../../../environments/environment';

const BASE = `${environment.apiBase}/interview/practice/sessions`;

describe('PracticeApi', () => {
  let api: PracticeApi;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(PracticeApi);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('uploadAnswer POSTs multipart FormData with questionId, file and rounded durationSec', () => {
    const blob = new Blob(['audio-bytes'], { type: 'audio/webm' });
    api.uploadAnswer('sess-1', 'q-7', blob, 3.7).subscribe();

    const req = httpMock.expectOne(`${BASE}/sess-1/answers`);
    expect(req.request.method).toBe('POST');

    const body = req.request.body as FormData;
    expect(body).toBeInstanceOf(FormData);
    expect(body.get('questionId')).toBe('q-7');
    expect(body.get('durationSec')).toBe('4'); // Math.round(3.7)
    const file = body.get('file') as File;
    expect(file).toBeInstanceOf(Blob);
    expect((file as File).name).toBe('answer.webm');

    req.flush({ answerId: 'a-1', questionId: 'q-7', status: 'Uploaded' });
  });

  it('create() POSTs the request body to the sessions base URL', () => {
    const payload: CreatePracticeSessionRequest = { jobCategory: 'BE', cvId: null, jdId: null };
    api.create(payload).subscribe();

    const req = httpMock.expectOne(BASE);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(payload);

    req.flush({ id: 's-1', status: 'GeneratingQuestions', jobCategory: 'BE' });
  });

  it('create() gửi `language` lên BE (hợp đồng song ngữ)', () => {
    api.create({ jobCategory: 'BE', language: 'en' }).subscribe();

    const req = httpMock.expectOne(BASE);
    expect(req.request.body).toEqual(expect.objectContaining({ language: 'en' }));

    req.flush({ id: 's-1', status: 'GeneratingQuestions', jobCategory: 'BE' });
  });

  /**
   * SC3 — endpoint này KHÔNG nằm dưới `/sessions`; ghép nhầm vào `this.base` ra
   * `/sessions/session-options` → 404, mà 404 rất dễ bị đọc thành "backend chưa có endpoint"
   * (repo đã có nguyên một vòng e2e đọc nhầm đúng kiểu này với prefix `interview`).
   */
  it('sessionOptions() gọi ĐÚNG /practice/session-options, không phải dưới /sessions', () => {
    api.sessionOptions('BE', 'en').subscribe();

    const req = httpMock.expectOne(
      (r) => r.url === `${environment.apiBase}/interview/practice/session-options`,
    );
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('jobCategory')).toBe('BE');
    expect(req.request.params.get('language')).toBe('en');

    req.flush({ presets: [], preview: [] });
  });

  it('sessionOptions() bỏ hẳn param language khi không truyền (BE mặc định vi)', () => {
    api.sessionOptions('BA').subscribe();

    const req = httpMock.expectOne(
      (r) => r.url === `${environment.apiBase}/interview/practice/session-options`,
    );
    expect(req.request.params.has('language')).toBe(false);

    req.flush({ presets: [], preview: [] });
  });

  /**
   * Phải xin `blob`: endpoint đòi JWT nên không gán thẳng vào `<audio src>` được, và nếu quên
   * `responseType` thì Angular parse audio nhị phân như JSON → hỏng ở chỗ chẳng liên quan.
   */
  it('answerAudio() tải blob từ đúng đường answers/{id}/audio', () => {
    api.answerAudio('sess-1', 'ans-9').subscribe();

    const req = httpMock.expectOne(`${BASE}/sess-1/answers/ans-9/audio`);
    expect(req.request.method).toBe('GET');
    expect(req.request.responseType).toBe('blob');

    req.flush(new Blob(['audio'], { type: 'audio/webm' }));
  });
});
