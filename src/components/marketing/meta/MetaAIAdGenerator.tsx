import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Copy, Check, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useI18n } from "@/lib/i18n";
import { getErrorMessage } from '@/lib/errors';

type AdOutput = {
  headlines: string[];
  primaryTexts: string[];
  hooks: string[];
  ctas: string[];
  angles: string[];
};

export function MetaAIAdGenerator() {
  const { locale } = useI18n();
  const isDa = locale === 'da';
  const [product, setProduct] = useState("");
  const [audience, setAudience] = useState("");
  const [offer, setOffer] = useState("");
  const [objective, setObjective] = useState("");
  const [tone, setTone] = useState("");
  const [cta, setCta] = useState("");
  const [output, setOutput] = useState<AdOutput | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  const isValid = product.trim().length > 0;

  const handleGenerate = async () => {
    setTouched(true);
    if (!isValid) {
      toast({ title: isDa ? "Produkt/ydelse er påkrævet" : "Product/Service is required", variant: "destructive" });
      return;
    }
    setLoading(true);
    setError(null);
    setOutput(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke("meta-ads-ai", {
        body: { type: "generate", product, audience, offer, objective, tone, cta },
      });

      if (fnError) throw new Error(fnError.message);
      if (data?.error) throw new Error(data.error);

      setOutput(data as AdOutput);
    } catch (e) {
      const msg = (getErrorMessage(e) || (isDa ? "Generering fejlede" : "Generation failed"));
      setError(msg);
      toast({ title: isDa ? "AI-genereringsfejl" : "AI Generation Error", description: msg, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const copyText = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(text);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Input form */}
      <Card className="border-border">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <CardTitle className="text-base font-semibold">AI Ad Generator</CardTitle>
            <Badge variant="secondary" className="text-[10px]">AI</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label className="text-xs">{isDa ? 'Produkt/ydelse *' : 'Product or Service *'}</Label>
            <Input
              placeholder={isDa ? 'f.eks. AI-drevet annonceringsplatform' : 'e.g. AI-powered ad management platform'}
              className={`text-sm ${touched && !isValid ? 'border-destructive' : ''}`}
              value={product} onChange={(e) => setProduct(e.target.value)} maxLength={200}
            />
            {touched && !isValid && <p className="text-[10px] text-destructive">{isDa ? 'Dette felt er påkrævet' : 'This field is required'}</p>}
          </div>
          <div className="space-y-2">
            <Label className="text-xs">{isDa ? 'Målgruppe' : 'Target Audience'}</Label>
            <Input placeholder={isDa ? 'f.eks. B2B-marketingfolk, 25-45' : 'e.g. B2B SaaS marketers, 25-45'} className="text-sm" value={audience} onChange={(e) => setAudience(e.target.value)} maxLength={200} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-xs">{isDa ? 'Tilbud' : 'Offer'}</Label>
              <Input placeholder={isDa ? 'f.eks. Gratis 14-dages prøve' : 'e.g. Free 14-day trial'} className="text-sm" value={offer} onChange={(e) => setOffer(e.target.value)} maxLength={150} />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">{isDa ? 'Formål' : 'Objective'}</Label>
              <Select value={objective} onValueChange={setObjective}>
                <SelectTrigger className="text-sm h-9"><SelectValue placeholder={isDa ? 'Vælg' : 'Select'} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="conversions">{isDa ? 'Konverteringer' : 'Conversions'}</SelectItem>
                  <SelectItem value="traffic">Traffic</SelectItem>
                  <SelectItem value="leads">Lead Gen</SelectItem>
                  <SelectItem value="awareness">{isDa ? 'Kendskab' : 'Awareness'}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-xs">{isDa ? 'Tone' : 'Tone'}</Label>
              <Select value={tone} onValueChange={setTone}>
                <SelectTrigger className="text-sm h-9"><SelectValue placeholder={isDa ? 'Vælg' : 'Select'} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="professional">{isDa ? 'Professionel' : 'Professional'}</SelectItem>
                  <SelectItem value="bold">{isDa ? 'Modig' : 'Bold'}</SelectItem>
                  <SelectItem value="friendly">{isDa ? 'Venlig' : 'Friendly'}</SelectItem>
                  <SelectItem value="urgent">{isDa ? 'Presserende' : 'Urgent'}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">CTA</Label>
              <Input placeholder={isDa ? 'f.eks. Start gratis' : 'e.g. Start Free Trial'} className="text-sm" value={cta} onChange={(e) => setCta(e.target.value)} maxLength={50} />
            </div>
          </div>
          <Button onClick={handleGenerate} disabled={loading} className="w-full gap-2">
            <Sparkles className="h-4 w-4" />
            {loading ? (isDa ? 'Genererer med AI...' : 'Generating with AI...') : (isDa ? 'Generer annoncetekst' : 'Generate Ad Copy')}
          </Button>
        </CardContent>
      </Card>

      {/* Output */}
      <Card className="border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">{isDa ? 'Genereret output' : 'Generated Output'}</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent mb-3" />
              <p className="text-sm text-muted-foreground">{isDa ? 'AI skaber din annoncetekst...' : 'AI is crafting your ad copy...'}</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <AlertCircle className="h-8 w-8 text-destructive/40 mb-3" />
              <p className="text-sm text-destructive">{error}</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={handleGenerate}>{isDa ? 'Prøv igen' : 'Try Again'}</Button>
            </div>
          ) : !output ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Sparkles className="h-8 w-8 text-muted-foreground/40 mb-3" />
              <p className="text-sm text-muted-foreground">{isDa ? 'Udfyld formularen og generer annoncetekst' : 'Fill in the form and generate ad copy'}</p>
            </div>
          ) : (
            <div className="space-y-5 max-h-[500px] overflow-y-auto pr-1">
              {output.headlines?.length > 0 && <OutputSection title={isDa ? 'Overskrifter' : 'Headlines'} items={output.headlines} onCopy={copyText} copied={copied} />}
              {output.primaryTexts?.length > 0 && <OutputSection title={isDa ? 'Brødtekst' : 'Primary Text'} items={output.primaryTexts} onCopy={copyText} copied={copied} />}
              {output.hooks?.length > 0 && <OutputSection title={isDa ? 'Hook-idéer' : 'Hook Ideas'} items={output.hooks} onCopy={copyText} copied={copied} />}
              {output.ctas?.length > 0 && <OutputSection title={isDa ? 'CTA-forslag' : 'CTA Suggestions'} items={output.ctas} onCopy={copyText} copied={copied} inline />}
              {output.angles?.length > 0 && <OutputSection title={isDa ? 'Kreative vinkler' : 'Creative Angles'} items={output.angles} onCopy={copyText} copied={copied} />}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function OutputSection({ title, items, onCopy, copied, inline }: { title: string; items: string[]; onCopy: (t: string) => void; copied: string | null; inline?: boolean }) {
  return (
    <div>
      <p className="text-xs font-semibold text-foreground mb-2 uppercase tracking-wide">{title}</p>
      <div className={inline ? "flex flex-wrap gap-2" : "space-y-2"}>
        {items.map((item, i) => (
          inline ? (
            <Badge key={i} variant="secondary" className="cursor-pointer hover:bg-primary/10 transition-colors text-xs" onClick={() => onCopy(item)}>
              {item}
              {copied === item ? <Check className="h-3 w-3 ml-1" /> : <Copy className="h-3 w-3 ml-1 opacity-50" />}
            </Badge>
          ) : (
            <div key={i} className="flex items-start justify-between p-2.5 rounded-md border border-border bg-muted/20 group hover:bg-muted/40 transition-colors">
              <p className="text-sm text-foreground leading-relaxed pr-2">{item}</p>
              <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => onCopy(item)}>
                {copied === item ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
              </Button>
            </div>
          )
        ))}
      </div>
    </div>
  );
}
