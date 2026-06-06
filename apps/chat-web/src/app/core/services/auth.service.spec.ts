import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { AuthService } from './auth.service';

const API_ORIGIN = 'http://localhost:3000';

describe('AuthService', () => {
  let service: AuthService;
  let httpMock: HttpTestingController;
  const navigateMock = jest.fn().mockResolvedValue(true);

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        AuthService,
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: Router, useValue: { navigate: navigateMock } },
      ],
    });
    service = TestBed.inject(AuthService);
    httpMock = TestBed.inject(HttpTestingController);
    localStorage.clear();
    navigateMock.mockClear();
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  it('stores token and user on successful login', () => {
    const mockResponse = {
      accessToken: 'jwt-token',
      user: { id: 'u1', email: 'a@b.com', fullName: 'Alice' },
    };

    service.login('a@b.com', 'password').subscribe((res) => {
      expect(res.accessToken).toBe('jwt-token');
    });

    const req = httpMock.expectOne(`${API_ORIGIN}/api/v1/auth/login`);
    expect(req.request.method).toBe('POST');
    req.flush(mockResponse);

    expect(localStorage.getItem('access_token')).toBe('jwt-token');
    expect(service.isLoggedIn()).toBe(true);
    expect(service.getCurrentUser()?.email).toBe('a@b.com');
  });

  it('isLoggedIn returns false when no token', () => {
    expect(service.isLoggedIn()).toBe(false);
  });

  it('logout clears storage and navigates to /login', () => {
    localStorage.setItem('access_token', 'tok');
    service.logout();
    expect(localStorage.getItem('access_token')).toBeNull();
    expect(navigateMock).toHaveBeenCalledWith(['/login']);
  });
});
