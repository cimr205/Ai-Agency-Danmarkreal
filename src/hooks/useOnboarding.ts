import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export const ONBOARDING_STEPS = [
  { id: 'company', title: 'Virksomhed', description: 'Udfyld virksomhedsoplysninger' },
  { id: 'team', title: 'Team', description: 'Inviter dine kollegaer' },
  { id: 'leads', title: 'Leads', description: 'Opret dit første kundeemne' },
  { id: 'hr', title: 'HR', description: 'Tilføj medarbejderinformation' },
  { id: 'done', title: 'Færdig', description: 'Du er klar til at bruge systemet' },
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
