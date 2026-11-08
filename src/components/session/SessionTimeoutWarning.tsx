import { useState, useEffect, useRef, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useI18n } from '@/lib/i18n';

const IDLE_TIMEOUT_MS = 25 * 60 * 1000; // 25 min
const WARNING_BEFORE_MS = 5 * 60 * 1000; // 5 min warning
const LAST_ACTIVITY_KEY = 'last_activity_at';
const ACTIVITY_THROTTLE_MS = 5000;

export function SessionTimeoutWarning() {
  const { t } = useI18n();
  const [showWarning, setShowWarning] = useState(false);
  const [countdown, setCountdown] = useState(300);
  const idleTimerRef = useRef<NodeJS.Timeout>();
  const countdownRef = useRef<NodeJS.Timeout>();

  const resetTimer = useCallback(() => {
    setShowWarning(false);
    if (countdownRef.current) clearInterval(countdownRef.current);
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    // "Stay signed in" on the login page opts out of the idle sign-out.
    if (localStorage.getItem('remember_me') === 'true') return;

    idleTimerRef.current = setTimeout(() => {
      setShowWarning(true);
      setCountdown(300);
      countdownRef.current = setInterval(() => {
        setCountdown(prev => {
          if (prev <= 1) {
            clearInterval(countdownRef.current);
            supabase.auth.signOut();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }, IDLE_TIMEOUT_MS - WARNING_BEFORE_MS);
  }, []);

  // Activity only resets the idle timer while no warning is showing. This used
  // to depend on `showWarning`, so opening the warning re-ran the effect, whose
  // cleanup cleared the countdown and called resetTimer() — the warning closed
  // immediately and an idle session was never signed out.
  const showWarningRef = useRef(false);
  showWarningRef.current = showWarning;

  useEffect(() => {
    const events = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart'];
    let lastHandled = 0;
    const handler = () => {
      if (showWarningRef.current || Date.now() - lastHandled < ACTIVITY_THROTTLE_MS) return;
      lastHandled = Date.now();
      resetTimer();
      // signOut() ends the session in every tab, so activity in one tab must keep the others alive.
      localStorage.setItem(LAST_ACTIVITY_KEY, String(lastHandled));
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === LAST_ACTIVITY_KEY) resetTimer();
    };
    events.forEach(e => window.addEventListener(e, handler, { passive: true }));
    window.addEventListener('storage', onStorage);
    resetTimer();
    return () => {
      events.forEach(e => window.removeEventListener(e, handler));
      window.removeEventListener('storage', onStorage);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [resetTimer]);

  const handleContinue = () => {
    supabase.auth.getSession(); // refresh token
    resetTimer();
  };

  const mins = Math.floor(countdown / 60);
  const secs = countdown % 60;

  return (
    <Dialog open={showWarning} onOpenChange={(open) => { if (!open) handleContinue(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t('session.timeoutTitle')}</DialogTitle>
          <DialogDescription>{t('session.timeoutDesc')}</DialogDescription>
        </DialogHeader>
        <div className="text-center py-4">
          <div className="text-4xl font-mono font-bold text-destructive">
            {mins}:{secs.toString().padStart(2, '0')}
          </div>
        </div>
        <DialogFooter className="flex gap-2">
          <Button variant="outline" onClick={() => supabase.auth.signOut()}>{t('common.signOut')}</Button>
          <Button onClick={handleContinue}>{t('session.continue')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
