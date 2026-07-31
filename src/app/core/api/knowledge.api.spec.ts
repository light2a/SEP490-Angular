import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { KnowledgeApi } from './knowledge.api';
import { AddKnowledgeSourceRequest, Context7IngestRequest } from '../models';
import { environment } from '../../../environments/environment';

const BASE = `${environment.apiBase}/interview/admin/knowledge`;

describe('KnowledgeApi (RAG grounding admin — Contract 3)', () => {
  let api: KnowledgeApi;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(KnowledgeApi);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('list() GETs base and reads next cursor from X-Next-Cursor header (keyset)', () => {
    let page: { items: unknown[]; nextCursor: string | null } | undefined;
    api.list().subscribe((p) => (page = p));

    const req = httpMock.expectOne(BASE);
    expect(req.request.method).toBe('GET');
    req.flush([{ id: 's1', title: 'react.dev', sourceType: 'Context7', status: 'Active', chunkCount: 12, createdAt: '' }], {
      headers: { 'X-Next-Cursor': 'cur-2' },
    });

    expect(page!.items.length).toBe(1);
    expect(page!.nextCursor).toBe('cur-2');
  });

  it('list() with no X-Next-Cursor header → nextCursor null (hết trang)', () => {
    let page: { nextCursor: string | null } | undefined;
    api.list().subscribe((p) => (page = p));
    httpMock.expectOne(BASE).flush([]);
    expect(page!.nextCursor).toBeNull();
  });

  it('list({cursor,limit}) forwards cursor + limit as query params', () => {
    api.list({ cursor: 'c9', limit: 50 }).subscribe();
    const req = httpMock.expectOne((r) => r.url === BASE);
    expect(req.request.params.get('cursor')).toBe('c9');
    expect(req.request.params.get('limit')).toBe('50');
    req.flush([]);
  });

  it('add() POSTs manual source body to base → 201', () => {
    const body: AddKnowledgeSourceRequest = {
      title: 'useEffect notes',
      jobCategory: 'FE',
      sourceType: 'Manual',
      content: '# useEffect',
      url: null,
    };
    api.add(body).subscribe();
    const req = httpMock.expectOne(BASE);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(body);
    req.flush({ id: 's2', title: 'useEffect notes', sourceType: 'Manual', status: 'Active', chunkCount: 1, createdAt: '' });
  });

  it('remove() DELETEs /{id}', () => {
    api.remove('s3').subscribe();
    const req = httpMock.expectOne(`${BASE}/s3`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
  });

  it('reindex() POSTs /{id}/reindex', () => {
    api.reindex('s4').subscribe();
    const req = httpMock.expectOne(`${BASE}/s4/reindex`);
    expect(req.request.method).toBe('POST');
    req.flush({ id: 's4', title: 'x', sourceType: 'Url', status: 'Active', chunkCount: 3, createdAt: '' });
  });

  it('context7Search() GETs /context7/search with libraryName + query params', () => {
    api.context7Search('react', 'useEffect').subscribe();
    const req = httpMock.expectOne((r) => r.url === `${BASE}/context7/search`);
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('libraryName')).toBe('react');
    expect(req.request.params.get('query')).toBe('useEffect');
    req.flush([{ id: '/reactjs/react.dev', title: 'React', reputation: '9', snippets: 200 }]);
  });

  it('context7Search() omits empty query param', () => {
    api.context7Search('react', '').subscribe();
    const req = httpMock.expectOne((r) => r.url === `${BASE}/context7/search`);
    expect(req.request.params.get('libraryName')).toBe('react');
    expect(req.request.params.has('query')).toBe(false);
    req.flush([]);
  });

  it('context7Ingest() POSTs {libraryId, topics, jobCategory} to /context7/ingest', () => {
    const body: Context7IngestRequest = {
      libraryId: '/reactjs/react.dev',
      topics: ['useEffect', 'useState'],
      jobCategory: 'FE',
    };
    api.context7Ingest(body).subscribe();
    const req = httpMock.expectOne(`${BASE}/context7/ingest`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(body);
    req.flush({ id: 's5', title: 'React', sourceType: 'Context7', status: 'Active', chunkCount: 40, createdAt: '' });
  });
});
