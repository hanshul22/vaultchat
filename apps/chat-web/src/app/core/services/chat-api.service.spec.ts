import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { ChatApiService } from './chat-api.service';

describe('ChatApiService', () => {
  let service: ChatApiService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [ChatApiService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(ChatApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('listConversations calls GET /api/v1/chat/conversations', () => {
    service.listConversations().subscribe();
    const req = httpMock.expectOne((r) => r.url === '/api/v1/chat/conversations');
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('listMessages calls GET with conversationId', () => {
    service.listMessages('conv-1').subscribe();
    const req = httpMock.expectOne((r) => r.url === '/api/v1/chat/conversations/conv-1/messages');
    expect(req.request.method).toBe('GET');
    req.flush({ items: [], total: 0, page: 1, limit: 50, totalPages: 0 });
  });

  it('sendMessage calls POST with body', () => {
    service.sendMessage('conv-1', 'Hello').subscribe();
    const req = httpMock.expectOne('/api/v1/chat/conversations/conv-1/messages');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ body: 'Hello' });
    req.flush({});
  });
});
