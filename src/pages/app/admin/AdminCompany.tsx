import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Building2, Loader2, Save } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import type { Tables } from "@/integrations/supabase/types";

export default function AdminCompany() {
  const { t } = useI18n();
  const { profile } = useAuth();
  const [company, setCompany] = useState<Tables<'companies'> | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    name: '', cvr: '', email: '', phone: '', address: '', website: '',
  });

  useEffect(() => {
    if (!profile?.company_id) { setLoading(false); return; }
    supabase.from('companies').select('*').eq('id', profile.company_id).single()
      .then(({ data, error }) => {
        if (error) { toast.error(t('adminCompany.fetchError')); }
        if (data) {
          setCompany(data);
          setFormData({
            name: data.name || '', cvr: data.cvr || '', email: data.email || '',
            phone: data.phone || '', address: data.address || '', website: data.website || '',
          });
        }
        setLoading(false);
      });
  }, [profile?.company_id]);

  const handleSave = async () => {
    if (!company) return;
    setSaving(true);
    const { error } = await supabase.from('companies').update({
      name: formData.name, cvr: formData.cvr || null, email: formData.email || null,
      phone: formData.phone || null, address: formData.address || null, website: formData.website || null,
    }).eq('id', company.id);
    if (error) toast.error(t('adminCompany.updateError'));
    else toast.success(t('adminCompany.updateSuccess'));
    setSaving(false);
  };

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;

  if (!company) return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Building2 className="h-8 w-8 text-primary" />
        <div><h1 className="text-3xl font-bold text-foreground">{t('adminCompany.title')}</h1><p className="text-muted-foreground">{t('adminCompany.noCompanyYet')}</p></div>
      </div>
      <Card><CardHeader><CardTitle>{t('adminCompany.noCompanyFound')}</CardTitle><CardDescription>{t('adminCompany.noCompanyDesc')}</CardDescription></CardHeader></Card>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Building2 className="h-8 w-8 text-primary" />
        <div><h1 className="text-3xl font-bold text-foreground">{t('adminCompany.title')}</h1><p className="text-muted-foreground">{t('adminCompany.subtitle')}</p></div>
      </div>
      <Card>
        <CardHeader><CardTitle>{t('adminCompany.companyDetails')}</CardTitle><CardDescription>{t('adminCompany.companyDetailsDesc')}</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2"><Label htmlFor="name">{t('adminCompany.companyName')}</Label><Input id="name" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder={t('adminCompany.companyNamePlaceholder')} /></div>
            <div className="space-y-2"><Label htmlFor="cvr">{t('adminCompany.cvr')}</Label><Input id="cvr" value={formData.cvr} onChange={(e) => setFormData({ ...formData, cvr: e.target.value })} placeholder="12345678" /></div>
            <div className="space-y-2"><Label htmlFor="email">{t('adminCompany.email')}</Label><Input id="email" type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} placeholder={t('adminCompany.emailPlaceholder')} /></div>
            <div className="space-y-2"><Label htmlFor="phone">{t('adminCompany.phone')}</Label><Input id="phone" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} placeholder={t('adminCompany.phonePlaceholder')} /></div>
            <div className="space-y-2"><Label htmlFor="website">{t('adminCompany.website')}</Label><Input id="website" value={formData.website} onChange={(e) => setFormData({ ...formData, website: e.target.value })} placeholder={t('adminCompany.websitePlaceholder')} /></div>
            <div className="space-y-2"><Label htmlFor="address">{t('adminCompany.address')}</Label><Input id="address" value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} placeholder={t('adminCompany.addressPlaceholder')} /></div>
          </div>
          <div className="flex justify-end pt-4">
            <Button onClick={handleSave} disabled={saving || !formData.name}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              {t('adminCompany.saveChanges')}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
