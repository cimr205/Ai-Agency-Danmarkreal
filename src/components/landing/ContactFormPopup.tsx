import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { MessageSquare, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useI18n } from '@/lib/i18n';
import { contactFormSchema } from '@/lib/validations';

const RATE_LIMIT_MS = 30_000;

export function ContactFormPopup() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', phone: '', message: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const lastSubmitRef = useRef(0);
  const { t } = useI18n();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    const now = Date.now();
    if (now - lastSubmitRef.current < RATE_LIMIT_MS) {
      toast.error(t('contact.rateLimited') || 'Please wait before submitting again');
      return;
    }

    const result = contactFormSchema.safeParse(form);
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      result.error.issues.forEach(err => {
        if (err.path[0]) fieldErrors[err.path[0] as string] = err.message;
      });
      setErrors(fieldErrors);
      return;
    }

    setLoading(true);
    lastSubmitRef.current = now;

    const { error } = await supabase.from('contact_submissions').insert({
      name: result.data.name,
      email: result.data.email,
      phone: result.data.phone || null,
      message: result.data.message,
    });
    setLoading(false);
    if (error) {
      toast.error(t('contact.error'));
    } else {
      toast.success(t('contact.success'));
      setForm({ name: '', email: '', phone: '', message: '' });
      setOpen(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-40 h-12 w-12 rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 transition-colors flex items-center justify-center"
        aria-label={t('contact.title')}
      >
        <MessageSquare className="w-5 h-5" />
      </button>

      {open && (
        <div className="fixed bottom-20 right-6 z-50 w-[340px] animate-fade-in">
          <div className="landing-glass rounded-2xl p-5 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-foreground">{t('contact.title')}</h3>
              <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground" aria-label="Close">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-3" noValidate>
              <div>
                <Label className="text-xs text-muted-foreground">{t('contact.name')}</Label>
                <Input
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder={t('contact.namePlaceholder')}
                  className="h-9 text-sm"
                  maxLength={100}
                  aria-invalid={!!errors.name}
                />
                {errors.name && <p className="text-xs text-destructive mt-0.5">{errors.name}</p>}
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">{t('contact.email')}</Label>
                <Input
                  type="email"
                  value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  placeholder={t('contact.emailPlaceholder')}
                  className="h-9 text-sm"
                  maxLength={255}
                  aria-invalid={!!errors.email}
                />
                {errors.email && <p className="text-xs text-destructive mt-0.5">{errors.email}</p>}
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">{t('contact.phone')}</Label>
                <Input
                  value={form.phone}
                  onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                  placeholder={t('contact.phonePlaceholder')}
                  className="h-9 text-sm"
                  maxLength={20}
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">{t('contact.message')}</Label>
                <Textarea
                  value={form.message}
                  onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
                  placeholder={t('contact.messagePlaceholder')}
                  className="text-sm min-h-[80px]"
                  maxLength={1000}
                  aria-invalid={!!errors.message}
                />
                {errors.message && <p className="text-xs text-destructive mt-0.5">{errors.message}</p>}
              </div>
              <Button
                type="submit"
                disabled={loading}
                className="w-full h-9 text-sm rounded-full"
              >
                {loading ? t('contact.sending') : t('contact.send')}
              </Button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
