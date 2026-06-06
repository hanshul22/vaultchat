import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { authGuard } from './auth.guard';
import { ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';

function runGuard(): ReturnType<typeof authGuard> {
  return TestBed.runInInjectionContext(() =>
    authGuard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot),
  );
}

describe('authGuard', () => {
  const createUrlTreeMock = jest.fn((commands: string[]) => commands);

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: Router,
          useValue: { createUrlTree: createUrlTreeMock },
        },
      ],
    });
    localStorage.clear();
    createUrlTreeMock.mockClear();
  });

  afterEach(() => localStorage.clear());

  it('returns true when access_token is present', () => {
    localStorage.setItem('access_token', 'test-token');
    expect(runGuard()).toBe(true);
  });

  it('calls createUrlTree(["/login"]) when no token', () => {
    runGuard();
    expect(createUrlTreeMock).toHaveBeenCalledWith(['/login']);
  });
});
