import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { tx } from '@/lib/inlineI18n';

export const ONBOARDING_STEPS = [
  { id: 'company', title: 'Virksomhed', description: 'Udfyld virksomhedsoplysninger' },
  { id: 'team', title: 'Team', get description() { return tx('Inviter dine kollegaer', 'Invite your colleagues'); } },
  { id: 'leads', title: 'Leads', get description() { return tx('Opret dit første kundeemne', 'Create your first lead'); } },
  { id: 'hr', title: 'HR', description: 'Tilføj medarbejderinformation' },
  { id: 'done', get title() { return tx('Færdig', 'Done'); }, get description() { return tx('Du er klar til at bruge systemet', 'You are ready to use the system'); } },
];

export function useOnboarding() {
  const [currentStep, setCurrentStep] = useState(1);
  const [isUpdating, setIsUpdating] = useState(false);
  const totalSteps = ONBOARDING_STEPS.length;

  const nextStep = async () => {
    setIsUpdating(true);
    try { setCurrentStep(prev => Math.min(prev + 1, totalSteps)); } finally { setIsUpdating(false); }
  };

  const previousStep = () => { setCurrentStep(prev => Math.max(prev - 1, 1)); };

  const skipOnboarding = async () => {
    setIsUpdating(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from('profiles').update({ onboarding_completed: true }).eq('user_id', user.id);
        const { data: profile } = await supabase.from('profiles').select('company_id').eq('user_id', user.id).single();
        if (profile?.company_id) {
          await supabase.from('companies').update({ onboarding_completed: true }).eq('id', profile.company_id);
        }
      }
    } finally { setIsUpdating(false); }
  };

  return { currentStep, totalSteps, nextStep, previousStep, skipOnboarding, isUpdating };
}
