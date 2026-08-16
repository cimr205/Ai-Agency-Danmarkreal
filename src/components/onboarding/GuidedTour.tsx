import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { X, ArrowRight, ArrowLeft, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useI18n } from '@/lib/i18n';
import { useAuth } from '@/hooks/useAuth';

interface TourStep {
  target: string; // CSS selector
  title: string;
  description: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
}

const TOUR_STEPS: TourStep[] = [
  {
    target: '[data-tour="dashboard"]',
    title: 'Dit Dashboard',
    description: 'Her får du et komplet overblik over din virksomheds KPI\'er, leads og pipeline.',
    position: 'bottom',
  },
  {
    target: '[data-tour="leads"]',
    title: 'Leads & CRM',
    description: 'Administrer alle dine kundeemner, score dem med AI og følg op automatisk.',
    position: 'right',
  },
  {
    target: '[data-tour="pipeline"]',
    title: 'Pipeline',
    description: 'Visualiser din salgspipeline med drag-and-drop og se forventet omsætning.',
    position: 'right',
  },
  {
    target: '[data-tour="pa"]',
    title: 'AI Assistent',
    description: 'Din personlige AI-assistent der kan hjælpe med emails, analyser og opgaver.',
    position: 'right',
  },
  {
    target: '[data-tour="settings"]',
    title: 'Indstillinger',
    description: 'Tilpas din virksomhedsprofil, inviter teammedlemmer og konfigurer integrationer.',
    position: 'right',
  },
];

export function GuidedTour() {
  const [isActive, setIsActive] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const { t } = useI18n();
  const { profile } = useAuth();
  const location = useLocation();

  useEffect(() => {
    // Never start the tour on the onboarding page — the wizard already owns
    // the screen and stacking two modals blocks logout / navigation.
    if (location.pathname.includes('/onboarding')) return;
    // Wait until the user actually has a company set up.
    if (!profile?.company_id) return;
    const hasSeenTour = localStorage.getItem('guided_tour_completed');
    if (hasSeenTour) return;
    const timer = setTimeout(() => setIsActive(true), 2000);
    return () => clearTimeout(timer);
  }, [profile?.company_id, location.pathname]);

  useEffect(() => {
    if (!isActive) return;
    const step = TOUR_STEPS[currentStep];
    const el = document.querySelector(step.target);
    if (el) {
      const rect = el.getBoundingClientRect();
      el.classList.add('ring-2', 'ring-primary', 'ring-offset-2', 'ring-offset-background', 'relative', 'z-50');

      let top = rect.bottom + 12;
      let left = rect.left;

      if (step.position === 'right') {
        top = rect.top;
        left = rect.right + 12;
      } else if (step.position === 'top') {
        top = rect.top - 200;
      }

      // Keep within viewport
      left = Math.min(left, window.innerWidth - 340);
      left = Math.max(left, 8);
      top = Math.min(top, window.innerHeight - 220);
      top = Math.max(top, 8);

      setPosition({ top, left });

      return () => {
        el.classList.remove('ring-2', 'ring-primary', 'ring-offset-2', 'ring-offset-background', 'relative', 'z-50');
      };
    }
  }, [isActive, currentStep]);

  const completeTour = () => {
    setIsActive(false);
    localStorage.setItem('guided_tour_completed', 'true');
  };

  const nextStep = () => {
    if (currentStep < TOUR_STEPS.length - 1) {
      setCurrentStep(prev => prev + 1);
    } else {
      completeTour();
    }
  };

  const prevStep = () => {
    if (currentStep > 0) setCurrentStep(prev => prev - 1);
  };

  if (!isActive) return null;

  const step = TOUR_STEPS[currentStep];

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/60 z-40" onClick={completeTour} />

      {/* Tour card */}
      <Card
        className="fixed z-[60] w-80 shadow-xl border-primary/20 animate-in fade-in slide-in-from-bottom-2"
        style={{ top: position.top, left: position.left }}
      >
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" />
              <span className="text-xs text-muted-foreground font-medium">
                {currentStep + 1} / {TOUR_STEPS.length}
              </span>
            </div>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={completeTour}>
              <X className="w-3.5 h-3.5" />
            </Button>
          </div>

          <h3 className="font-semibold text-sm mb-1">{step.title}</h3>
          <p className="text-xs text-muted-foreground leading-relaxed mb-3">{step.description}</p>

          <div className="flex items-center justify-between">
            <Button variant="ghost" size="sm" onClick={prevStep} disabled={currentStep === 0} className="h-7 text-xs">
              <ArrowLeft className="w-3 h-3 mr-1" /> Tilbage
            </Button>
            <Button size="sm" onClick={nextStep} className="h-7 text-xs">
              {currentStep === TOUR_STEPS.length - 1 ? 'Færdig' : 'Næste'}
              {currentStep < TOUR_STEPS.length - 1 && <ArrowRight className="w-3 h-3 ml-1" />}
            </Button>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
