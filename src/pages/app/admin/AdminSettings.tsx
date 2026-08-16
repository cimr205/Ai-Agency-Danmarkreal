import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Settings, Bell, Shield, Globe } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";

interface SettingsState {
  email_notifications: boolean;
  new_lead_notifications: boolean;
  two_factor_auth: boolean;
  session_timeout: boolean;
}

const STORAGE_KEY = 'app_settings';

function loadSettings(): SettingsState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...{ email_notifications: false, new_lead_notifications: false, two_factor_auth: false, session_timeout: true }, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { email_notifications: false, new_lead_notifications: false, two_factor_auth: false, session_timeout: true };
}

export default function AdminSettings() {
  const { t } = useI18n();
  const [settings, setSettings] = useState<SettingsState>(loadSettings);

  const handleToggle = (key: keyof SettingsState, value: boolean) => {
    const next = { ...settings, [key]: value };
    setSettings(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    toast.success(t('adminSettings.settingSaved'));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Settings className="h-8 w-8 text-primary" />
        <div><h1 className="text-3xl font-bold text-foreground">{t('adminSettings.title')}</h1><p className="text-muted-foreground">{t('adminSettings.subtitle')}</p></div>
      </div>
      <div className="grid gap-6">
        <Card>
          <CardHeader><div className="flex items-center gap-2"><Bell className="h-5 w-5 text-muted-foreground" /><CardTitle>{t('adminSettings.notifications')}</CardTitle></div><CardDescription>{t('adminSettings.notificationsDesc')}</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between"><div className="space-y-0.5"><Label>{t('adminSettings.emailNotifications')}</Label><p className="text-sm text-muted-foreground">{t('adminSettings.emailNotificationsDesc')}</p></div><Switch checked={settings.email_notifications} onCheckedChange={(v) => handleToggle('email_notifications', v)} /></div>
            <div className="flex items-center justify-between"><div className="space-y-0.5"><Label>{t('adminSettings.newLeads')}</Label><p className="text-sm text-muted-foreground">{t('adminSettings.newLeadsDesc')}</p></div><Switch checked={settings.new_lead_notifications} onCheckedChange={(v) => handleToggle('new_lead_notifications', v)} /></div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><div className="flex items-center gap-2"><Shield className="h-5 w-5 text-muted-foreground" /><CardTitle>{t('adminSettings.security')}</CardTitle></div><CardDescription>{t('adminSettings.securityDesc')}</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between"><div className="space-y-0.5"><Label>{t('adminSettings.twoFactor')}</Label><p className="text-sm text-muted-foreground">{t('adminSettings.twoFactorDesc')}</p></div><Switch checked={settings.two_factor_auth} onCheckedChange={(v) => handleToggle('two_factor_auth', v)} /></div>
            <div className="flex items-center justify-between"><div className="space-y-0.5"><Label>{t('adminSettings.sessionTimeout')}</Label><p className="text-sm text-muted-foreground">{t('adminSettings.sessionTimeoutDesc')}</p></div><Switch checked={settings.session_timeout} onCheckedChange={(v) => handleToggle('session_timeout', v)} /></div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><div className="flex items-center gap-2"><Globe className="h-5 w-5 text-muted-foreground" /><CardTitle>{t('adminSettings.apiIntegration')}</CardTitle></div><CardDescription>{t('adminSettings.apiIntegrationDesc')}</CardDescription></CardHeader>
          <CardContent><p className="text-sm text-muted-foreground">{t('adminSettings.apiIntegrationNote')}</p></CardContent>
        </Card>
      </div>
    </div>
  );
}
