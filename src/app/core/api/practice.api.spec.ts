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
});
