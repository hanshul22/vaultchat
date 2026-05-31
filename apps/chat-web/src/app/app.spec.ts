import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { App } from './app';
import { Component } from '@angular/core';

@Component({ standalone: true, template: '<p>stub</p>' })
class StubComponent {}

describe('App', () => {
  beforeEach(async () => {
    // Provide a token so the auth guard passes without redirecting.
    localStorage.setItem('access_token', 'test-token');

    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([
          { path: '', component: StubComponent },
          { path: 'login', component: StubComponent },
          { path: 'chat', component: StubComponent },
          { path: '**', component: StubComponent },
        ]),
      ],
    }).compileComponents();
  });

  afterEach(() => localStorage.clear());

  it('should create the app', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    expect(fixture.componentInstance).toBeTruthy();
  });
});
