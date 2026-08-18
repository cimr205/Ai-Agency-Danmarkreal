import { useState, useCallback, useRef, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import {
  Sparkles, Zap, Settings2, Wand2, ArrowLeft, ArrowRight, Check,
  Target, Users, DollarSign, Image as ImageIcon, Calendar, Send,
  Loader2, ChevronRight, Globe, Clock, Video, X, Plus, Copy, Trash2, FlaskConical
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { getErrorMessage } from '@/lib/errors';

type WizardMode = "simple" | "advanced" | "ai";
type BudgetLevel = "campaign" | "adset";

type AspectRatio = "1:1" | "9:16" | "16:9" | "4:5";

type AdVariant = {
  id: string;
  name: string;
  primaryText: string;
  headline: string;
  description: string;
  callToAction: string;
  mediaType: "image" | "video";
  aspectRatio: AspectRatio;
  imageUrl: string;
  imageFile: File | null;
  videoFile: File | null;
  videoPreviewUrl: string;
  linkUrl: string;
  aiGeneratedImage: string | null;
};

const aspectRatioOptions: { value: AspectRatio; label: string; desc: string }[] = [
  { value: "1:1", label: "1:1", desc: "Kvadrat" },
  { value: "9:16", label: "9:16", desc: "Story/Reel" },
  { value: "16:9", label: "16:9", desc: "Landskab" },
  { value: "4:5", label: "4:5", desc: "Feed" },
];

const aspectRatioClass: Record<AspectRatio, string> = {
  "1:1": "aspect-square",
  "9:16": "aspect-[9/16]",
  "16:9": "aspect-video",
  "4:5": "aspect-[4/5]",
};

const createVariant = (index: number): AdVariant => ({
  id: `variant-${Date.now()}-${index}`,
  name: `Variant ${String.fromCharCode(65 + index)}`,
  primaryText: "",
  headline: "",
  description: "",
  callToAction: "LEARN_MORE",
  mediaType: "image",
  aspectRatio: "1:1",
  imageUrl: "",
  imageFile: null,
  videoFile: null,
  videoPreviewUrl: "",
  linkUrl: "",
  aiGeneratedImage: null,
});

type CampaignData = {
  name: string;
  objective: string;
  budgetLevel: BudgetLevel;
  dailyBudget: string;
  totalBudget: string;
  startDate: string;
  endDate: string;
  scheduleEnabled: boolean;
  scheduledPublishDate: string;
  scheduledPublishTime: string;
  ageMin: string;
  ageMax: string;
  genders: string;
  locations: string;
  interests: string;
  aiPrompt: string;
};

const defaultData: CampaignData = {
  name: "",
  objective: "OUTCOME_TRAFFIC",
  budgetLevel: "adset",
  dailyBudget: "50",
  totalBudget: "",
  startDate: "",
  endDate: "",
  scheduleEnabled: false,
  scheduledPublishDate: "",
  scheduledPublishTime: "09:00",
  ageMin: "18",
  ageMax: "65",
  genders: "all",
  locations: "DK",
  interests: "",
  aiPrompt: "",
};

const objectives = [
  { value: "OUTCOME_TRAFFIC", label: "Trafik", desc: "Send folk til din hjemmeside" },
  { value: "OUTCOME_LEADS", label: "Lead Generation", desc: "Saml kontaktoplysninger" },
  { value: "OUTCOME_SALES", label: "Konverteringer", desc: "Driv salg og konverteringer" },
  { value: "OUTCOME_AWARENESS", label: "Brand Awareness", desc: "Øg kendskabet til dit brand" },
  { value: "OUTCOME_ENGAGEMENT", label: "Engagement", desc: "Få likes, kommentarer og delinger" },
];

const ctaOptions = [
  { value: "LEARN_MORE", label: "Lær mere" },
  { value: "SHOP_NOW", label: "Shop nu" },
  { value: "SIGN_UP", label: "Tilmeld dig" },
  { value: "CONTACT_US", label: "Kontakt os" },
  { value: "GET_OFFER", label: "Få tilbud" },
  { value: "BOOK_NOW", label: "Book nu" },
  { value: "DOWNLOAD", label: "Download" },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateCampaignWizard({ open, onOpenChange }: Props) {
  const { user } = useAuth();
  const [mode, setMode] = useState<WizardMode | null>(null);
  const [step, setStep] = useState(0);
  const [data, setData] = useState<CampaignData>({ ...defaultData });
  const [variants, setVariants] = useState<AdVariant[]>([createVariant(0)]);
  const [activeVariantIdx, setActiveVariantIdx] = useState(0);
  const [publishing, setPublishing] = useState(false);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiImageGenerating, setAiImageGenerating] = useState(false);

  const update = (partial: Partial<CampaignData>) => setData(prev => ({ ...prev, ...partial }));

  const updateVariant = (idx: number, partial: Partial<AdVariant>) => {
    setVariants(prev => prev.map((v, i) => i === idx ? { ...v, ...partial } : v));
  };

  const addVariant = () => {
    if (variants.length >= 5) {
      toast({ title: "Maks 5 varianter", description: "Du kan have op til 5 A/B test varianter.", variant: "destructive" });
      return;
    }
    setVariants(prev => [...prev, createVariant(prev.length)]);
    setActiveVariantIdx(variants.length);
  };

  const duplicateVariant = (idx: number) => {
    if (variants.length >= 5) return;
    const source = variants[idx];
    const newVariant: AdVariant = {
      ...source,
      id: `variant-${Date.now()}-${variants.length}`,
      name: `Variant ${String.fromCharCode(65 + variants.length)}`,
      imageFile: null,
      videoFile: null,
    };
    setVariants(prev => [...prev, newVariant]);
    setActiveVariantIdx(variants.length);
  };

  const removeVariant = (idx: number) => {
    if (variants.length <= 1) return;
    setVariants(prev => prev.filter((_, i) => i !== idx));
    setActiveVariantIdx(Math.min(activeVariantIdx, variants.length - 2));
  };

  const reset = () => {
    setMode(null);
    setStep(0);
    setData({ ...defaultData });
    setVariants([createVariant(0)]);
    setActiveVariantIdx(0);
  };

  const handleClose = () => {
    reset();
    onOpenChange(false);
  };

  const simpleSteps = ["Kampagneinfo", "Annoncer", "Offentliggør"];
  const advancedSteps = ["Kampagneinfo", "Budget & Tidsplan", "Målgruppe", "Annoncer (A/B)", "Review & Offentliggør"];
  const aiSteps = ["Beskriv dit mål", "AI Forslag", "Review & Offentliggør"];

  const steps = mode === "simple" ? simpleSteps : mode === "advanced" ? advancedSteps : aiSteps;
  const maxStep = steps.length - 1;

  const activeVariant = variants[activeVariantIdx] || variants[0];

  const canNext = () => {
    if (mode === "simple") {
      if (step === 0) return data.name.trim().length > 0;
      if (step === 1) return activeVariant.primaryText.trim().length > 0 && activeVariant.headline.trim().length > 0;
    }
    if (mode === "advanced") {
      if (step === 0) return data.name.trim().length > 0;
      if (step === 1) return parseFloat(data.dailyBudget) > 0;
      if (step === 2) return true;
      if (step === 3) return activeVariant.primaryText.trim().length > 0 && activeVariant.headline.trim().length > 0;
    }
    if (mode === "ai") {
      if (step === 0) return data.aiPrompt.trim().length > 0;
      if (step === 1) return data.name.trim().length > 0;
    }
    return true;
  };

  const handleAiGenerate = async () => {
    setAiGenerating(true);
    try {
      const { data: result, error } = await supabase.functions.invoke("meta-ads-ai", {
        body: {
          type: "generate",
          product: data.aiPrompt,
          audience: "",
          offer: "",
          objective: "conversions",
          tone: "professional",
          cta: "",
        },
      });
      if (error) throw new Error(error.message);

      // Generate 2 A/B variants from AI
      const variantA: AdVariant = {
        ...createVariant(0),
        primaryText: result.primaryTexts?.[0] || "",
        headline: result.headlines?.[0] || "",
        description: result.hooks?.[0] || "",
      };
      const variantB: AdVariant = {
        ...createVariant(1),
        primaryText: result.primaryTexts?.[1] || result.primaryTexts?.[0] || "",
        headline: result.headlines?.[1] || result.headlines?.[0] || "",
        description: result.hooks?.[1] || result.hooks?.[0] || "",
      };

      update({
        name: `AI Campaign – ${new Date().toLocaleDateString('da-DK')}`,
      });
      setVariants([variantA, variantB]);
      setActiveVariantIdx(0);
      setStep(1);
    } catch (err) {
      toast({ title: "AI fejl", description: getErrorMessage(err) || String(err), variant: "destructive" });
    } finally {
      setAiGenerating(false);
    }
  };

  const handleAiImage = async () => {
    if (!activeVariant.primaryText && !data.aiPrompt) return;
    setAiImageGenerating(true);
    try {
      const { data: result, error } = await supabase.functions.invoke("ai-generate", {
        body: {
          prompt: `Professional Meta/Facebook ad image: ${data.aiPrompt || activeVariant.primaryText}. Clean, high-quality, modern design suitable for social media advertising.`,
          generation_type: "ad_creative",
        },
      });
      if (error) throw new Error(error.message);
      if (result?.output_url) {
        updateVariant(activeVariantIdx, { imageUrl: result.output_url, aiGeneratedImage: result.output_url });
        toast({ title: "Billede genereret!" });
      }
    } catch (err) {
      toast({ title: "Billedgenerering fejlede", description: getErrorMessage(err) || String(err), variant: "destructive" });
    } finally {
      setAiImageGenerating(false);
    }
  };

  const handlePublish = async () => {
    setPublishing(true);
    try {
      const budgetCents = parseFloat(data.dailyBudget) * 100;

      // Publish each variant as a separate ad under the same campaign
      const payload: Record<string, unknown> = {
        campaign_name: data.name,
        objective: data.objective,
        status: data.scheduleEnabled ? "PAUSED" : "ACTIVE",
        start_time: data.startDate || undefined,
        end_time: data.endDate || undefined,
        budget_level: data.budgetLevel,
        ...(data.budgetLevel === "campaign" ? { campaign_daily_budget: budgetCents } : { daily_budget: budgetCents }),
        targeting: {
          age_min: parseInt(data.ageMin) || 18,
          age_max: parseInt(data.ageMax) || 65,
          genders: data.genders === "male" ? [1] : data.genders === "female" ? [2] : [1, 2],
          geo_locations: { countries: data.locations.split(",").map(s => s.trim().toUpperCase()).filter(Boolean) },
          interests: data.interests ? data.interests.split(",").map(s => s.trim()) : undefined,
        },
        // Send all variants for A/B testing
        ad_variants: variants.map(v => ({
          name: v.name,
          primary_text: v.primaryText,
          headline: v.headline,
          description: v.description,
          call_to_action: v.callToAction,
          image_url: v.imageUrl,
          link_url: v.linkUrl,
          media_type: v.mediaType,
        })),
        // First variant as fallback for non-A/B publish
        ad_creative: {
          primary_text: variants[0].primaryText,
          headline: variants[0].headline,
          description: variants[0].description,
          call_to_action: variants[0].callToAction,
          image_url: variants[0].imageUrl,
          link_url: variants[0].linkUrl,
        },
        schedule: data.scheduleEnabled ? {
          publish_date: data.scheduledPublishDate,
          publish_time: data.scheduledPublishTime,
        } : undefined,
      };

      const { data: result, error } = await supabase.functions.invoke("meta-publish-campaign", {
        body: payload,
      });

      if (error) throw new Error(error.message);
      if (result?.error) {
        const msg = result.detail || result.error;
        if (msg.includes("ikke forbundet") || msg.includes("No connection") || msg.includes("Forbind")) {
          toast({
            title: "Meta Ads ikke forbundet",
            description: "Du skal først forbinde din Meta Ads konto under Overview → 'Forbind Meta Ads' før du kan offentliggøre kampagner.",
            variant: "destructive",
          });
          setPublishing(false);
          return;
        }
        if (msg.includes("Ingen annonce-konto") || msg.includes("No ad account")) {
          toast({
            title: "Ingen annonce-konto fundet",
            description: "Din Meta-konto har ingen annonce-konti tilknyttet. Opret en annonce-konto i Meta Business Manager først.",
            variant: "destructive",
          });
          setPublishing(false);
          return;
        }
        throw new Error(msg);
      }

      const variantCount = variants.length > 1 ? ` med ${variants.length} A/B varianter` : "";
      toast({
        title: data.scheduleEnabled ? "Kampagne planlagt!" : "Kampagne offentliggjort!",
        description: data.scheduleEnabled
          ? `Din kampagne vil blive aktiveret ${data.scheduledPublishDate} kl. ${data.scheduledPublishTime}${variantCount}`
          : `"${data.name}" er nu live på Meta Ads${variantCount}`,
      });
      handleClose();
    } catch (err) {
      let msg = getErrorMessage(err) || "Ukendt fejl";
      msg = msg
        .replace(/Campaign creation failed:\s*/i, "Kampagne kunne ikke oprettes: ")
        .replace(/Ad Set creation failed:\s*/i, "Annonce-sæt kunne ikke oprettes: ")
        .replace(/Creative creation failed:\s*/i, "Annonce-kreativ kunne ikke oprettes: ")
        .replace(/Ad creation failed:\s*/i, "Annonce kunne ikke oprettes: ")
        .replace(/Unauthorized/i, "Du er ikke logget ind. Log ind igen og prøv.")
        .replace(/No company found/i, "Din profil er ikke knyttet til en virksomhed.")
        .replace(/No authorization header/i, "Du er ikke logget ind. Log ind igen og prøv.");
      toast({ title: "Publicering fejlede", description: msg, variant: "destructive" });
    } finally {
      setPublishing(false);
    }
  };

  // Mode selection screen
  if (!mode) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl">Opret ny kampagne</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground mb-4">Vælg hvordan du vil oprette din kampagne</p>
          <div className="grid grid-cols-3 gap-4">
            <ModeCard icon={Zap} title="Simpel" desc="3 hurtige trin: Info → Annonce → Publicér" onClick={() => { setMode("simple"); setStep(0); }} accent="text-emerald-600" />
            <ModeCard icon={Settings2} title="Avanceret" desc="5 trin med fuld kontrol, A/B test varianter" onClick={() => { setMode("advanced"); setStep(0); }} accent="text-primary" />
            <ModeCard icon={Wand2} title="AI-drevet" desc="AI genererer 2+ A/B varianter automatisk" onClick={() => { setMode("ai"); setStep(0); }} accent="text-purple-600" />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader className="shrink-0">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-lg">
              {mode === "simple" ? "Simpel" : mode === "advanced" ? "Avanceret" : "AI-drevet"} kampagne
            </DialogTitle>
            <Button variant="ghost" size="sm" onClick={reset} className="text-xs text-muted-foreground">
              Skift tilstand
            </Button>
          </div>
          <div className="flex items-center gap-2 mt-3">
            {steps.map((s, i) => (
              <div key={s} className="flex items-center gap-2">
                <div className={cn(
                  "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all",
                  i < step ? "bg-primary/10 text-primary" :
                  i === step ? "bg-primary text-primary-foreground" :
                  "bg-muted text-muted-foreground"
                )}>
                  {i < step ? <Check className="h-3 w-3" /> : <span>{i + 1}</span>}
                  <span className="hidden sm:inline">{s}</span>
                </div>
                {i < steps.length - 1 && <ChevronRight className="h-3 w-3 text-muted-foreground" />}
              </div>
            ))}
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto py-4 space-y-4">
          {/* SIMPLE MODE */}
          {mode === "simple" && step === 0 && <StepCampaignInfo data={data} update={update} />}
          {mode === "simple" && step === 1 && (
            <VariantEditor
              variants={variants}
              activeIdx={activeVariantIdx}
              setActiveIdx={setActiveVariantIdx}
              updateVariant={updateVariant}
              addVariant={addVariant}
              duplicateVariant={duplicateVariant}
              removeVariant={removeVariant}
              onAiImage={handleAiImage}
              aiImageGenerating={aiImageGenerating}
            />
          )}
          {mode === "simple" && step === 2 && <StepReview data={data} variants={variants} />}

          {/* ADVANCED MODE */}
          {mode === "advanced" && step === 0 && <StepCampaignInfo data={data} update={update} />}
          {mode === "advanced" && step === 1 && <StepBudgetSchedule data={data} update={update} />}
          {mode === "advanced" && step === 2 && <StepAudience data={data} update={update} />}
          {mode === "advanced" && step === 3 && (
            <VariantEditor
              variants={variants}
              activeIdx={activeVariantIdx}
              setActiveIdx={setActiveVariantIdx}
              updateVariant={updateVariant}
              addVariant={addVariant}
              duplicateVariant={duplicateVariant}
              removeVariant={removeVariant}
              onAiImage={handleAiImage}
              aiImageGenerating={aiImageGenerating}
            />
          )}
          {mode === "advanced" && step === 4 && <StepReview data={data} variants={variants} />}

          {/* AI MODE */}
          {mode === "ai" && step === 0 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <Wand2 className="h-5 w-5 text-purple-600" />
                <h3 className="font-semibold">Beskriv dit mål</h3>
              </div>
              <p className="text-sm text-muted-foreground">
                Fortæl AI hvad du vil opnå. Den genererer automatisk 2 A/B test varianter med tekst og overskrifter.
              </p>
              <Textarea
                placeholder="F.eks. 'Jeg vil sælge flere løbesko til kvinder 25-40 i Danmark med et Black Friday tilbud på 30% rabat'"
                value={data.aiPrompt}
                onChange={e => update({ aiPrompt: e.target.value })}
                rows={5}
                className="resize-none"
              />
              <div className="flex flex-wrap gap-2">
                {["Øg salg af mit produkt", "Få flere leads til min tjeneste", "Byg brandkendskab i Danmark"].map(s => (
                  <Badge key={s} variant="outline" className="cursor-pointer hover:bg-primary/5 transition-colors" onClick={() => update({ aiPrompt: s })}>
                    {s}
                  </Badge>
                ))}
              </div>
            </div>
          )}
          {mode === "ai" && step === 1 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="h-5 w-5 text-purple-600" />
                <h3 className="font-semibold">AI-genererede A/B varianter</h3>
              </div>
              <p className="text-sm text-muted-foreground">
                AI har oprettet {variants.length} varianter. Du kan redigere dem eller tilføje flere.
              </p>
              <StepCampaignInfo data={data} update={update} />
              <VariantEditor
                variants={variants}
                activeIdx={activeVariantIdx}
                setActiveIdx={setActiveVariantIdx}
                updateVariant={updateVariant}
                addVariant={addVariant}
                duplicateVariant={duplicateVariant}
                removeVariant={removeVariant}
                onAiImage={handleAiImage}
                aiImageGenerating={aiImageGenerating}
                compact
              />
            </div>
          )}
          {mode === "ai" && step === 2 && <StepReview data={data} variants={variants} />}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-4 border-t border-border shrink-0">
          <Button variant="outline" onClick={() => step > 0 ? setStep(step - 1) : reset()} className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            {step === 0 ? "Tilbage" : "Forrige"}
          </Button>

          {step < maxStep ? (
            <Button
              onClick={() => {
                if (mode === "ai" && step === 0) handleAiGenerate();
                else setStep(step + 1);
              }}
              disabled={!canNext() || (mode === "ai" && step === 0 && aiGenerating)}
              className="gap-2"
            >
              {mode === "ai" && step === 0 ? (
                aiGenerating ? <><Loader2 className="h-4 w-4 animate-spin" /> AI genererer...</> : <><Wand2 className="h-4 w-4" /> Generer med AI</>
              ) : (
                <>Næste <ArrowRight className="h-4 w-4" /></>
              )}
            </Button>
          ) : (
            <Button onClick={handlePublish} disabled={publishing} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
              {publishing ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Offentliggør...</>
              ) : data.scheduleEnabled ? (
                <><Clock className="h-4 w-4" /> Planlæg publicering</>
              ) : (
                <><Send className="h-4 w-4" /> Offentliggør {variants.length > 1 ? `(${variants.length} varianter)` : "kampagne"}</>
              )}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// --- Sub components ---

function ModeCard({ icon: Icon, title, desc, onClick, accent }: {
  icon: React.ComponentType<{ className?: string }>; title: string; desc: string; onClick: () => void; accent: string;
}) {
  return (
    <Card className="cursor-pointer hover:shadow-md hover:border-primary/30 transition-all group" onClick={onClick}>
      <CardContent className="p-5 text-center space-y-3">
        <div className={cn("mx-auto h-10 w-10 rounded-lg flex items-center justify-center bg-muted group-hover:bg-primary/10 transition-colors", accent)}>
          <Icon className="h-5 w-5" />
        </div>
        <h4 className="font-semibold text-sm">{title}</h4>
        <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
      </CardContent>
    </Card>
  );
}

function StepCampaignInfo({ data, update }: { data: CampaignData; update: (d: Partial<CampaignData>) => void }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <Target className="h-5 w-5 text-primary" />
        <h3 className="font-semibold">Kampagneinformation</h3>
      </div>
      <div className="space-y-2">
        <Label>Kampagnenavn *</Label>
        <Input placeholder="F.eks. 'Forårskampagne 2026'" value={data.name} onChange={e => update({ name: e.target.value })} />
      </div>
      <div className="space-y-2">
        <Label>Mål</Label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {objectives.map(obj => (
            <div key={obj.value} onClick={() => update({ objective: obj.value })} className={cn(
              "p-3 rounded-lg border cursor-pointer transition-all text-left",
              data.objective === obj.value ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"
            )}>
              <p className="text-sm font-medium">{obj.label}</p>
              <p className="text-xs text-muted-foreground">{obj.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function StepBudgetSchedule({ data, update }: { data: CampaignData; update: (d: Partial<CampaignData>) => void }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <DollarSign className="h-5 w-5 text-primary" />
        <h3 className="font-semibold">Budget & Tidsplan</h3>
      </div>
      <div className="space-y-2">
        <Label>Budget-niveau</Label>
        <div className="grid grid-cols-2 gap-3">
          <div onClick={() => update({ budgetLevel: "campaign" })} className={cn("p-3 rounded-lg border cursor-pointer transition-all text-left", data.budgetLevel === "campaign" ? "border-primary bg-primary/5" : "border-border hover:border-primary/30")}>
            <p className="text-sm font-medium">Kampagne-budget</p>
            <p className="text-xs text-muted-foreground">Meta fordeler budgettet automatisk mellem annonce-sæt</p>
          </div>
          <div onClick={() => update({ budgetLevel: "adset" })} className={cn("p-3 rounded-lg border cursor-pointer transition-all text-left", data.budgetLevel === "adset" ? "border-primary bg-primary/5" : "border-border hover:border-primary/30")}>
            <p className="text-sm font-medium">Annonce-sæt budget</p>
            <p className="text-xs text-muted-foreground">Du styrer budgettet per annonce-sæt individuelt</p>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Dagligt budget (DKK) *</Label>
          <Input type="number" value={data.dailyBudget} onChange={e => update({ dailyBudget: e.target.value })} min="1" />
        </div>
        <div className="space-y-2">
          <Label>Samlet budget (valgfrit)</Label>
          <Input type="number" placeholder="Ubegrænset" value={data.totalBudget} onChange={e => update({ totalBudget: e.target.value })} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Startdato</Label>
          <Input type="date" value={data.startDate} onChange={e => update({ startDate: e.target.value })} />
        </div>
        <div className="space-y-2">
          <Label>Slutdato</Label>
          <Input type="date" value={data.endDate} onChange={e => update({ endDate: e.target.value })} />
        </div>
      </div>
      <Card className="border-dashed">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <Label>Planlæg publicering</Label>
            </div>
            <Switch checked={data.scheduleEnabled} onCheckedChange={v => update({ scheduleEnabled: v })} />
          </div>
          {data.scheduleEnabled && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Publiceringsdato</Label>
                <Input type="date" value={data.scheduledPublishDate} onChange={e => update({ scheduledPublishDate: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Tidspunkt</Label>
                <Input type="time" value={data.scheduledPublishTime} onChange={e => update({ scheduledPublishTime: e.target.value })} />
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StepAudience({ data, update }: { data: CampaignData; update: (d: Partial<CampaignData>) => void }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <Users className="h-5 w-5 text-primary" />
        <h3 className="font-semibold">Målgruppe</h3>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Min. alder</Label>
          <Input type="number" min="13" max="65" value={data.ageMin} onChange={e => update({ ageMin: e.target.value })} />
        </div>
        <div className="space-y-2">
          <Label>Max. alder</Label>
          <Input type="number" min="13" max="65" value={data.ageMax} onChange={e => update({ ageMax: e.target.value })} />
        </div>
      </div>
      <div className="space-y-2">
        <Label>Køn</Label>
        <Select value={data.genders} onValueChange={v => update({ genders: v })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle</SelectItem>
            <SelectItem value="male">Mænd</SelectItem>
            <SelectItem value="female">Kvinder</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Lande (kommasepareret)</Label>
        <Input placeholder="DK, SE, NO" value={data.locations} onChange={e => update({ locations: e.target.value })} />
      </div>
      <div className="space-y-2">
        <Label>Interesser (kommasepareret)</Label>
        <Input placeholder="Fitness, E-commerce, Marketing" value={data.interests} onChange={e => update({ interests: e.target.value })} />
      </div>
    </div>
  );
}

// --- A/B Variant Editor ---

function VariantEditor({ variants, activeIdx, setActiveIdx, updateVariant, addVariant, duplicateVariant, removeVariant, onAiImage, aiImageGenerating, compact }: {
  variants: AdVariant[];
  activeIdx: number;
  setActiveIdx: (i: number) => void;
  updateVariant: (i: number, p: Partial<AdVariant>) => void;
  addVariant: () => void;
  duplicateVariant: (i: number) => void;
  removeVariant: (i: number) => void;
  onAiImage: () => void;
  aiImageGenerating: boolean;
  compact?: boolean;
}) {
  const v = variants[activeIdx] || variants[0];
  const idx = activeIdx;

  return (
    <div className="space-y-4">
      {!compact && (
        <div className="flex items-center gap-2 mb-2">
          <FlaskConical className="h-5 w-5 text-primary" />
          <h3 className="font-semibold">Annonce-varianter (A/B Test)</h3>
        </div>
      )}

      {/* Variant tabs */}
      <div className="flex items-center gap-2 flex-wrap">
        {variants.map((variant, i) => (
          <button
            key={variant.id}
            type="button"
            onClick={() => setActiveIdx(i)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all",
              i === activeIdx
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-muted/50 text-muted-foreground hover:border-primary/30"
            )}
          >
            <FlaskConical className="h-3 w-3" />
            {variant.name}
          </button>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={addVariant} className="gap-1 text-xs h-8" disabled={variants.length >= 5}>
          <Plus className="h-3 w-3" /> Tilføj variant
        </Button>
      </div>

      {/* Variant actions */}
      {variants.length > 1 && (
        <div className="flex items-center gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={() => duplicateVariant(idx)} className="gap-1 text-xs h-7" disabled={variants.length >= 5}>
            <Copy className="h-3 w-3" /> Duplikér
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => removeVariant(idx)} className="gap-1 text-xs h-7 text-destructive hover:text-destructive">
            <Trash2 className="h-3 w-3" /> Fjern
          </Button>
          <span className="text-[10px] text-muted-foreground ml-auto">
            {variants.length} varianter – Meta vil fordele trafik for at finde bedste performer
          </span>
        </div>
      )}

      {/* Active variant editor */}
      <Card className="border-primary/20">
        <CardContent className="p-4 space-y-4">
          <div className="space-y-2">
            <Label>Primær tekst *</Label>
            <Textarea
              placeholder="Den tekst der vises over dit billede/video..."
              value={v.primaryText}
              onChange={e => updateVariant(idx, { primaryText: e.target.value })}
              rows={compact ? 2 : 3}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Overskrift *</Label>
              <Input placeholder="Fængende overskrift" value={v.headline} onChange={e => updateVariant(idx, { headline: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Call-to-Action</Label>
              <Select value={v.callToAction} onValueChange={val => updateVariant(idx, { callToAction: val })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ctaOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Beskrivelse</Label>
            <Input placeholder="Kort beskrivelse" value={v.description} onChange={e => updateVariant(idx, { description: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>Link URL</Label>
            <Input placeholder="https://din-side.dk/landing" value={v.linkUrl} onChange={e => updateVariant(idx, { linkUrl: e.target.value })} />
          </div>
            {/* Aspect Ratio selector */}
            <div className="space-y-2">
              <Label className="text-xs">Format</Label>
              <div className="flex items-center gap-1.5 flex-wrap">
                {aspectRatioOptions.map(ar => (
                  <button
                    key={ar.value}
                    type="button"
                    onClick={() => updateVariant(idx, { aspectRatio: ar.value })}
                    className={cn(
                      "px-3 py-1.5 rounded-md text-xs font-medium border transition-all",
                      v.aspectRatio === ar.value
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:border-primary/30"
                    )}
                  >
                    {ar.label} <span className="text-[10px] opacity-70 ml-1">{ar.desc}</span>
                  </button>
                ))}
              </div>
            </div>

          {/* Media */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Annonce-medie</Label>
              <div className="flex items-center gap-1 bg-muted rounded-lg p-0.5">
                <button type="button" className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all", v.mediaType === "image" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground")} onClick={() => updateVariant(idx, { mediaType: "image" })}>
                  <ImageIcon className="h-3.5 w-3.5" /> Billede
                </button>
                <button type="button" className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all", v.mediaType === "video" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground")} onClick={() => updateVariant(idx, { mediaType: "video" })}>
                  <Video className="h-3.5 w-3.5" /> Video
                </button>
              </div>
            </div>

            {v.mediaType === "image" && (
              <>
                <div className="flex items-center justify-end">
                  <Button variant="outline" size="sm" onClick={onAiImage} disabled={aiImageGenerating} className="gap-1.5 text-xs">
                    {aiImageGenerating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                    Generer med AI
                  </Button>
                </div>
                {v.imageUrl ? (
                  <div className={cn("relative rounded-lg overflow-hidden border border-border mx-auto", v.aspectRatio === "9:16" ? "max-w-[200px]" : v.aspectRatio === "4:5" ? "max-w-[280px]" : "w-full")}>
                    <img src={v.imageUrl} alt="Ad preview" className={cn("w-full object-cover", aspectRatioClass[v.aspectRatio])} />
                    <Button variant="destructive" size="sm" className="absolute top-2 right-2 h-7 text-xs gap-1" onClick={() => updateVariant(idx, { imageUrl: "", aiGeneratedImage: null, imageFile: null })}>
                      <X className="h-3 w-3" /> Fjern
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="border-2 border-dashed border-muted-foreground/30 rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors" onClick={() => {
                      const input = document.createElement('input');
                      input.type = 'file';
                      input.accept = 'image/*';
                      input.onchange = (e) => {
                        const file = (e.target as HTMLInputElement).files?.[0];
                        if (file) updateVariant(idx, { imageFile: file, imageUrl: URL.createObjectURL(file) });
                      };
                      input.click();
                    }}>
                      <ImageIcon className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
                      <p className="text-sm font-medium">Upload billede</p>
                      <p className="text-xs text-muted-foreground mt-1">JPG, PNG, WebP – maks 30 MB</p>
                    </div>
                    <Input placeholder="Eller indsæt billede-URL" value={v.imageUrl} onChange={e => updateVariant(idx, { imageUrl: e.target.value })} />
                  </div>
                )}
              </>
            )}

            {v.mediaType === "video" && (
              <>
                {v.videoPreviewUrl ? (
                  <div className={cn("relative rounded-lg overflow-hidden border border-border mx-auto", v.aspectRatio === "9:16" ? "max-w-[200px]" : v.aspectRatio === "4:5" ? "max-w-[280px]" : "w-full")}>
                    <video src={v.videoPreviewUrl} controls className={cn("w-full rounded-lg", aspectRatioClass[v.aspectRatio])} />
                    <Button variant="destructive" size="sm" className="absolute top-2 right-2 h-7 text-xs gap-1" onClick={() => updateVariant(idx, { videoFile: null, videoPreviewUrl: "" })}>
                      <X className="h-3 w-3" /> Fjern
                    </Button>
                  </div>
                ) : (
                  <div className="border-2 border-dashed border-muted-foreground/30 rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors" onClick={() => {
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.accept = 'video/mp4,video/mov,video/avi,video/webm,video/*';
                    input.onchange = (e) => {
                      const file = (e.target as HTMLInputElement).files?.[0];
                      if (file) updateVariant(idx, { videoFile: file, videoPreviewUrl: URL.createObjectURL(file) });
                    };
                    input.click();
                  }}>
                    <Video className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
                    <p className="text-sm font-medium">Upload video</p>
                    <p className="text-xs text-muted-foreground mt-1">MP4, MOV, WebM – maks 1 GB</p>
                  </div>
                )}
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function StepReview({ data, variants }: { data: CampaignData; variants: AdVariant[] }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <Check className="h-5 w-5 text-emerald-600" />
        <h3 className="font-semibold">Review & Offentliggør</h3>
      </div>

      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground uppercase">Kampagne</span>
            <Badge variant="outline">{data.name || "Ikke navngivet"}</Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground uppercase">Mål</span>
            <span className="text-sm">{objectives.find(o => o.value === data.objective)?.label || data.objective}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground uppercase">Budget</span>
            <span className="text-sm">{data.dailyBudget} DKK/dag ({data.budgetLevel === 'campaign' ? 'Kampagne-niveau' : 'Annonce-sæt niveau'})</span>
          </div>
          {variants.length > 1 && (
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground uppercase">A/B Test</span>
              <Badge className="bg-primary/10 text-primary border-primary/20">
                <FlaskConical className="h-3 w-3 mr-1" />
                {variants.length} varianter
              </Badge>
            </div>
          )}
        </CardContent>
      </Card>

      {/* All variant previews */}
      {variants.map((v, i) => (
        <Card key={v.id}>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground uppercase">
                {variants.length > 1 ? v.name : "Annonce-forhåndsvisning"}
              </span>
              {variants.length > 1 && (
                <Badge variant="outline" className="text-[10px]">
                  {Math.round(100 / variants.length)}% trafik
                </Badge>
              )}
            </div>
            <div className="border border-border rounded-lg p-4 space-y-3 bg-muted/30">
              <p className="text-sm">{v.primaryText || "Ingen primær tekst"}</p>
              {v.imageUrl && v.mediaType === "image" && (
                <img src={v.imageUrl} alt="Preview" className="w-full rounded-lg max-h-48 object-cover" />
              )}
              {v.videoPreviewUrl && v.mediaType === "video" && (
                <video src={v.videoPreviewUrl} controls className="w-full rounded-lg max-h-48" />
              )}
              <div className="border-t border-border pt-3">
                <p className="text-xs text-muted-foreground">{v.linkUrl || "din-side.dk"}</p>
                <p className="text-sm font-semibold">{v.headline || "Ingen overskrift"}</p>
                <p className="text-xs text-muted-foreground">{v.description}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
