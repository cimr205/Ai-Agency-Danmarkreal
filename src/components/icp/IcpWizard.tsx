import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, ArrowRight, Check, Plus, X, Target, MapPin, Building2, Users, Zap } from "lucide-react";
import { toast } from "sonner";
import { useCreateIcpProfile, useUpdateIcpProfile, type IcpProfile, type IcpProfileInput } from "@/hooks/api/useIcp";

const STEPS = [
  { label: "Name & Description", icon: Target },
  { label: "Target Market", icon: MapPin },
  { label: "Company Profile", icon: Building2 },
  { label: "Pain Points & Services", icon: Zap },
  { label: "Priorities & Review", icon: Users },
];

const INDUSTRIES = [
  "Cleaning", "Construction", "Landscaping", "Plumbing", "HVAC", "Electrical",
  "Roofing", "Painting", "Pest Control", "Moving", "Auto Repair", "Real Estate",
  "Restaurant", "Retail", "Fitness", "Salon & Spa", "Dental", "Legal",
  "Accounting", "Marketing Agency", "IT Services", "Consulting", "Photography",
  "Home Services", "Healthcare", "Education", "Manufacturing", "Logistics",
];

const ROLES = [
  "Owner", "CEO", "Founder", "COO", "CFO", "Operations Manager",
  "Office Manager", "Marketing Manager", "Sales Manager", "General Manager",
  "Director", "Partner", "President", "VP Operations",
];

const PAIN_POINTS = [
  "No CRM system", "Poor online presence", "No booking/scheduling system",
  "Weak follow-up process", "No automation", "Manual invoicing",
  "No email marketing", "Low review count", "Outdated website",
  "No lead tracking", "No pipeline visibility", "Poor customer retention",
  "No social media presence", "Manual data entry", "No reporting/analytics",
];

const SERVICES = [
  "CRM implementation", "Pipeline management", "Email outreach",
  "Marketing automation", "Website development", "SEO", "Social media",
  "Lead generation", "Sales training", "Customer support tools",
  "Invoicing & billing", "Booking systems", "Review management",
  "Data analytics", "Process automation",
];

const COUNTRIES = [
  "US", "DK", "GB", "DE", "NO", "SE", "NL", "FR", "CA", "AU",
];

type Props = {
  existing?: IcpProfile | null;
  onClose: () => void;
  onSaved: (id: string) => void;
};

export default function IcpWizard({ existing, onClose, onSaved }: Props) {
  const createIcp = useCreateIcpProfile();
  const updateIcp = useUpdateIcpProfile();
  const [step, setStep] = useState(0);

  const [form, setForm] = useState<IcpProfileInput>({
    name: existing?.name || "",
    description: existing?.description || "",
    industry: existing?.industry || [],
    sub_industries: existing?.sub_industries || [],
    target_countries: existing?.target_countries || [],
    target_regions: existing?.target_regions || [],
    target_cities: existing?.target_cities || [],
    min_employees: existing?.min_employees ?? null,
    max_employees: existing?.max_employees ?? null,
    min_revenue: existing?.min_revenue ?? null,
    max_revenue: existing?.max_revenue ?? null,
    business_types: existing?.business_types || [],
    target_roles: existing?.target_roles || [],
    pain_points: existing?.pain_points || [],
    desired_services: existing?.desired_services || [],
    preferred_languages: existing?.preferred_languages || [],
    budget_level: existing?.budget_level || "medium",
    technology_signals: existing?.technology_signals || [],
    exclude_industries: existing?.exclude_industries || [],
    exclude_keywords: existing?.exclude_keywords || [],
    must_have_criteria: existing?.must_have_criteria || [],
    nice_to_have_criteria: existing?.nice_to_have_criteria || [],
    weight_industry: existing?.weight_industry ?? 3,
    weight_location: existing?.weight_location ?? 3,
    weight_company_size: existing?.weight_company_size ?? 3,
    weight_role_fit: existing?.weight_role_fit ?? 2,
    weight_pain_points: existing?.weight_pain_points ?? 2,
    weight_budget_fit: existing?.weight_budget_fit ?? 2,
    weight_service_fit: existing?.weight_service_fit ?? 2,
    is_default: existing?.is_default ?? false,
    status: "active",
  });



  const updateField = <K extends keyof IcpProfileInput>(key: K, value: IcpProfileInput[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const toggleInArray = (key: keyof IcpProfileInput, value: string) => {
    const arr = (form[key] as string[]) || [];
    if (arr.includes(value)) {
      updateField(key, arr.filter((v) => v !== value) as IcpProfileInput[typeof key]);
    } else {
      updateField(key, [...arr, value] as IcpProfileInput[typeof key]);
    }
  };

  const addToArray = (key: keyof IcpProfileInput, value: string) => {
    const arr = (form[key] as string[]) || [];
    if (value.trim() && !arr.includes(value.trim())) {
      updateField(key, [...arr, value.trim()] as IcpProfileInput[typeof key]);
    }
  };

  const removeFromArray = (key: keyof IcpProfileInput, value: string) => {
    const arr = (form[key] as string[]) || [];
    updateField(key, arr.filter((v) => v !== value) as IcpProfileInput[typeof key]);
  };

  const canNext = () => {
    if (step === 0) return form.name.trim().length >= 2;
    return true;
  };

  const handleSave = () => {
    if (!form.name.trim()) { toast.error("Please enter a name"); return; }
    if (existing) {
      updateIcp.mutate(
        { id: existing.id, data: form },
        {
          onSuccess: (d) => { toast.success("ICP updated"); onSaved(d.id); },
          onError: (e) => toast.error(e.message),
        }
      );
    } else {
      createIcp.mutate(form, {
        onSuccess: (d) => { toast.success("ICP created"); onSaved(d.id); },
        onError: (e) => toast.error(e.message),
      });
    }
  };

  const WeightSelector = ({ label, field }: { label: string; field: keyof IcpProfileInput }) => (
    <div className="flex items-center justify-between">
      <span className="text-sm text-foreground">{label}</span>
      <div className="flex gap-1">
        {[1, 2, 3].map((w) => (
          <Button
            key={w}
            size="sm"
            variant={(form[field] as number) === w ? "default" : "outline"}
            className="h-7 w-16 text-xs"
            onClick={() => updateField(field, w as IcpProfileInput[typeof field])}
          >
            {w === 1 ? "Low" : w === 2 ? "Med" : "High"}
          </Button>
        ))}
      </div>
    </div>
  );

  const ChipSelector = ({ items, selected, onToggle }: { items: string[]; selected: string[]; onToggle: (v: string) => void }) => (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <Badge
          key={item}
          variant={selected.includes(item) ? "default" : "outline"}
          className="cursor-pointer text-xs px-2.5 py-1 transition-all"
          onClick={() => onToggle(item)}
        >
          {item}
        </Badge>
      ))}
    </div>
  );

  const TagInputField = ({ field, placeholder }: { field: keyof IcpProfileInput; placeholder: string }) => {
    const [localInput, setLocalInput] = useState("");
    return (
      <div>
        <div className="flex gap-2 mb-2">
          <Input
            value={localInput}
            onChange={(e) => setLocalInput(e.target.value)}
            placeholder={placeholder}
            className="h-8 text-sm"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addToArray(field, localInput);
                setLocalInput("");
              }
            }}
          />
          <Button size="sm" variant="outline" className="h-8" onClick={() => { addToArray(field, localInput); setLocalInput(""); }}>
            <Plus className="h-3 w-3" />
          </Button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {((form[field] as string[]) || []).map((v) => (
            <Badge key={v} variant="secondary" className="text-xs gap-1">
              {v}
              <X className="h-3 w-3 cursor-pointer" onClick={() => removeFromArray(field, v)} />
            </Badge>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Step indicator */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2">
        {STEPS.map((s, i) => (
          <button
            key={i}
            onClick={() => i <= step && setStep(i)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
              i === step
                ? "bg-primary text-primary-foreground"
                : i < step
                ? "bg-primary/10 text-primary cursor-pointer"
                : "bg-muted text-muted-foreground"
            }`}
          >
            <s.icon className="h-3.5 w-3.5" />
            {s.label}
          </button>
        ))}
      </div>

      {/* Step content */}
      <Card className="p-6">
        {step === 0 && (
          <div className="space-y-4">
            <div>
              <Label>ICP Name *</Label>
              <Input
                value={form.name}
                onChange={(e) => updateField("name", e.target.value)}
                placeholder="e.g. Texas Cleaning Companies 5-25 Employees"
                className="mt-1"
              />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea
                value={form.description || ""}
                onChange={(e) => updateField("description", e.target.value)}
                placeholder="Describe your ideal customer in your own words..."
                className="mt-1"
                rows={3}
              />
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-5">
            <div>
              <Label className="mb-2 block">Target Industries</Label>
              <ChipSelector
                items={INDUSTRIES}
                selected={form.industry}
                onToggle={(v) => toggleInArray("industry", v)}
              />
            </div>
            <div>
              <Label className="mb-2 block">Target Countries</Label>
              <ChipSelector
                items={COUNTRIES}
                selected={form.target_countries}
                onToggle={(v) => toggleInArray("target_countries", v)}
              />
            </div>
            <div>
              <Label className="mb-2 block">Target Regions / States</Label>
              <TagInputField field="target_regions" placeholder="e.g. Texas, California..." />
            </div>
            <div>
              <Label className="mb-2 block">Target Cities</Label>
              <TagInputField field="target_cities" placeholder="e.g. Houston, Dallas..." />
            </div>
            <div>
              <Label className="mb-2 block">Exclude Industries</Label>
              <TagInputField field="exclude_industries" placeholder="Industries to exclude..." />
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Min Employees</Label>
                <Input
                  type="number"
                  value={form.min_employees ?? ""}
                  onChange={(e) => updateField("min_employees", e.target.value ? Number(e.target.value) : null)}
                  placeholder="e.g. 5"
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Max Employees</Label>
                <Input
                  type="number"
                  value={form.max_employees ?? ""}
                  onChange={(e) => updateField("max_employees", e.target.value ? Number(e.target.value) : null)}
                  placeholder="e.g. 50"
                  className="mt-1"
                />
              </div>
            </div>
            <div>
              <Label className="mb-2 block">Budget Level</Label>
              <Select value={form.budget_level} onValueChange={(v) => updateField("budget_level", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low Budget</SelectItem>
                  <SelectItem value="medium">Medium Budget</SelectItem>
                  <SelectItem value="high">High Budget</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-2 block">Decision Maker Roles</Label>
              <ChipSelector
                items={ROLES}
                selected={form.target_roles}
                onToggle={(v) => toggleInArray("target_roles", v)}
              />
            </div>
            <div>
              <Label className="mb-2 block">Business Types</Label>
              <TagInputField field="business_types" placeholder="e.g. LLC, Sole Proprietor..." />
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-5">
            <div>
              <Label className="mb-2 block">Pain Points (signals to look for)</Label>
              <ChipSelector
                items={PAIN_POINTS}
                selected={form.pain_points}
                onToggle={(v) => toggleInArray("pain_points", v)}
              />
            </div>
            <div>
              <Label className="mb-2 block">Desired Services (what you sell)</Label>
              <ChipSelector
                items={SERVICES}
                selected={form.desired_services}
                onToggle={(v) => toggleInArray("desired_services", v)}
              />
            </div>
            <div>
              <Label className="mb-2 block">Technology Signals</Label>
              <TagInputField field="technology_signals" placeholder="e.g. no CRM, WordPress, no analytics..." />
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-5">
            <h3 className="text-sm font-semibold text-foreground">Set Scoring Priorities</h3>
            <p className="text-xs text-muted-foreground">Higher priority = more weight in the ICP score calculation.</p>
            <div className="space-y-3">
              <WeightSelector label="Industry Match" field="weight_industry" />
              <WeightSelector label="Location Match" field="weight_location" />
              <WeightSelector label="Company Size" field="weight_company_size" />
              <WeightSelector label="Role Fit" field="weight_role_fit" />
              <WeightSelector label="Pain Points" field="weight_pain_points" />
              <WeightSelector label="Budget Fit" field="weight_budget_fit" />
              <WeightSelector label="Service Fit" field="weight_service_fit" />
            </div>

            {/* Preview */}
            <Card className="p-4 bg-primary/5 border-primary/20 mt-4">
              <h4 className="text-sm font-semibold text-primary mb-2">ICP Preview</h4>
              <p className="text-sm text-foreground">
                <strong>{form.name}</strong> — Looking for{" "}
                {form.industry.length > 0 ? form.industry.join(", ") : "any industry"} companies
                {form.target_countries.length > 0 && ` in ${form.target_countries.join(", ")}`}
                {form.target_regions.length > 0 && ` (${form.target_regions.join(", ")})`}
                {form.min_employees && ` with ${form.min_employees}–${form.max_employees || "∞"} employees`}
                {form.pain_points.length > 0 && ` showing signs of: ${form.pain_points.slice(0, 3).join(", ")}`}
                .
              </p>
            </Card>
          </div>
        )}
      </Card>

      {/* Navigation */}
      <div className="flex justify-between">
        <div className="flex gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          {step > 0 && (
            <Button variant="ghost" onClick={() => setStep(step - 1)} className="gap-1.5">
              <ArrowLeft className="h-4 w-4" /> Back
            </Button>
          )}
        </div>
        <div>
          {step < STEPS.length - 1 ? (
            <Button onClick={() => setStep(step + 1)} disabled={!canNext()} className="gap-1.5">
              Next <ArrowRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              onClick={handleSave}
              disabled={createIcp.isPending || updateIcp.isPending}
              className="gap-1.5"
            >
              <Check className="h-4 w-4" />
              {existing ? "Update ICP" : "Create ICP"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
