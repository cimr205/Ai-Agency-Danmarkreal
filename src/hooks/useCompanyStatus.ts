import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export interface ComplianceItem {
  id: string;
  label: string;
  completed: boolean;
}

interface CompanyStatus {
  status: string;
  mode: string;
  compliance_checklist: ComplianceItem[];
}

export function useCompanyStatus() {
  const { isAdmin, profile } = useAuth();
  const [company, setCompany] = useState<CompanyStatus | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);

  const load = useCallback(async () => {
    if (!profile?.company_id) return;
    try {
      const { data } = await supabase.rpc('get_company_status', { _company_id: profile.company_id });
      if (data && data.length > 0) {
        const row = data[0];
        setCompany({
          status: row.status || 'active',
          mode: row.mode || 'live',
          compliance_checklist: (row.compliance_checklist as unknown as ComplianceItem[]) || [],
        });
      }
    } catch { /* silently fail */ }
  }, [profile?.company_id]);

  useEffect(() => { load(); }, [load]);

  const checklist: ComplianceItem[] = company?.compliance_checklist || [];
  const totalItems = checklist.length;
  const completedItems = checklist.filter(i => i.completed).length;
  const isSetupComplete = totalItems > 0 && completedItems === totalItems;

  const updateComplianceItem = async (input: { item: string; value: boolean }) => {
    if (!profile?.company_id) return;
    setIsUpdating(true);
    try {
      await supabase.rpc('update_compliance_item', { _company_id: profile.company_id, _item: input.item, _value: input.value });
      await load();
    } finally { setIsUpdating(false); }
  };

  const activateCompany = async () => {
    if (!profile?.company_id) return;
    setIsUpdating(true);
    try {
      await supabase.rpc('activate_company', { _company_id: profile.company_id });
      await load();
    } finally { setIsUpdating(false); }
  };

  const setCompanyMode = async (mode: string) => {
    if (!profile?.company_id) return;
    setIsUpdating(true);
    try {
      await supabase.rpc('set_company_mode', { _company_id: profile.company_id, _mode: mode });
      await load();
    } finally { setIsUpdating(false); }
  };

  return { company, isAdmin, isSetupComplete, completedItems, totalItems, checklist, updateComplianceItem, activateCompany, setCompanyMode, isUpdating };
}
