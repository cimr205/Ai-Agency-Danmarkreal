import { beforeEach, describe, expect, it } from 'vitest';
import { isSafeAppPath, rememberPostLoginRedirect, takePostLoginRedirect } from './postLoginRedirect';

const DASH = '/da/app/dashboard';

describe('postLoginRedirect', () => {
  beforeEach(() => localStorage.clear());

  it('brings the user back to the page they asked for after Google sign-in, once', () => {
    rememberPostLoginRedirect('/da/app/growth-os/seo', 1000);
    expect(takePostLoginRedirect(DASH, 2000)).toBe('/da/app/growth-os/seo');
    expect(takePostLoginRedirect(DASH, 3000)).toBe(DASH);
  });

  it('forgets an abandoned sign-in after 15 minutes', () => {
    rememberPostLoginRedirect('/da/app/growth-os/seo', 0);
    expect(takePostLoginRedirect(DASH, 16 * 60_000)).toBe(DASH);
  });

  it('never accepts paths outside the app', () => {
    for (const p of ['https://evil.example', '//evil.example/da/app', '/da/auth/login', '/da/app//x', '/xx/app/a', '']) {
      expect(isSafeAppPath(p), p).toBe(false);
    }
    localStorage.setItem('post_login_redirect', JSON.stringify({ path: '//evil.example', at: Date.now() }));
    expect(takePostLoginRedirect(DASH)).toBe(DASH);
    localStorage.setItem('post_login_redirect', 'not json');
    expect(takePostLoginRedirect(DASH)).toBe(DASH);
    expect(isSafeAppPath('/da/app/growth-os/seo?tab=live')).toBe(true);
  });
});
