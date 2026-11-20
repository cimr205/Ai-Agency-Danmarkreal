import { beforeEach, describe, expect, it } from 'vitest';
import { isSafeAppPath, rememberPostLoginRedirect, takePostLoginRedirect } from './postLoginRedirect';

describe('postLoginRedirect', () => {
  beforeEach(() => sessionStorage.clear());

  it('brings the user back to the page they asked for after Google sign-in, once', () => {
    rememberPostLoginRedirect('/da/app/growth-os/seo');
    expect(takePostLoginRedirect('/da/app/dashboard')).toBe('/da/app/growth-os/seo');
    expect(takePostLoginRedirect('/da/app/dashboard')).toBe('/da/app/dashboard');
  });

  it('never accepts paths outside the app', () => {
    for (const p of ['https://evil.example', '//evil.example/da/app', '/da/auth/login', '/da/app//x', '/xx/app/a', '']) {
      expect(isSafeAppPath(p), p).toBe(false);
    }
    sessionStorage.setItem('post_login_redirect', '//evil.example');
    expect(takePostLoginRedirect('/da/app/dashboard')).toBe('/da/app/dashboard');
    expect(isSafeAppPath('/da/app/growth-os/seo?tab=live')).toBe(true);
  });
});
