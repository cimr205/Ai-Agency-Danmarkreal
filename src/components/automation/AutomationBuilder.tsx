import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Plus, Trash2, Zap, ArrowRight, Clock, Mail, Tag, GitBranch } from 'lucide-react';
import { toast } from 'sonner';
import { useI18n } from '@/lib/i18n';

interface AutomationRule {
  id: string;
  name: string;
  enabled: boolean;
  trigger: { type: string; value: string };
  conditions: { field: string; operator: string; value: string }[];
  actions: { type: string; value: string; delay?: number }[];
}

const TRIGGER_TYPES = [
  { value: 'lead_created', label: 'Lead created' },
  { value: 'lead_status_changed', label: 'Lead status changed' },
  { value: 'deal_created', label: 'Deal created' },
  { value: 'deal_stage_changed', label: 'Deal stage changed' },
  { value: 'email_opened', label: 'Email opened' },
  { value: 'email_replied', label: 'Email replied' },
  { value: 'tag_added', label: 'Tag added' },
];

const ACTION_TYPES = [
  { value: 'send_email', label: 'Send email', icon: Mail },
  { value: 'add_tag', label: 'Add tag', icon: Tag },
  { value: 'change_status', label: 'Change status', icon: GitBranch },
  { value: 'create_task', label: 'Create task', icon: Zap },
  { value: 'wait', label: 'Wait (days)', icon: Clock },
  { value: 'move_pipeline', label: 'Move to pipeline stage', icon: ArrowRight },
];

export default function AutomationBuilder() {
  const { t } = useI18n();
  const [rules, setRules] = useState<AutomationRule[]>(() => {
    try {
      const saved = localStorage.getItem('automation_rules');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  const [createOpen, setCreateOpen] = useState(false);
  const [newRule, setNewRule] = useState<AutomationRule>({
    id: '', name: '', enabled: true,
    trigger: { type: 'lead_created', value: '' },
    conditions: [],
    actions: [{ type: 'send_email', value: '' }],
  });

  const saveRules = (updated: AutomationRule[]) => {
    setRules(updated);
    localStorage.setItem('automation_rules', JSON.stringify(updated));
  };

  const handleCreate = () => {
    if (!newRule.name.trim()) { toast.error('Name is required'); return; }
    const rule = { ...newRule, id: crypto.randomUUID() };
    saveRules([...rules, rule]);
    toast.success(t('automation.created'));
    setCreateOpen(false);
    setNewRule({ id: '', name: '', enabled: true, trigger: { type: 'lead_created', value: '' }, conditions: [], actions: [{ type: 'send_email', value: '' }] });
  };

  const toggleRule = (id: string) => {
    saveRules(rules.map(r => r.id === id ? { ...r, enabled: !r.enabled } : r));
  };

  const deleteRule = (id: string) => {
    saveRules(rules.filter(r => r.id !== id));
    toast.success(t('common.deleted'));
  };

  const addAction = () => {
    setNewRule(prev => ({ ...prev, actions: [...prev.actions, { type: 'send_email', value: '' }] }));
  };

  const updateAction = (idx: number, field: string, value: string) => {
    setNewRule(prev => ({
      ...prev,
      actions: prev.actions.map((a, i) => i === idx ? { ...a, [field]: value } : a),
    }));
  };

  const removeAction = (idx: number) => {
    setNewRule(prev => ({ ...prev, actions: prev.actions.filter((_, i) => i !== idx) }));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t('automation.title')}</h1>
          <p className="text-muted-foreground">{t('automation.subtitle')}</p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" />{t('automation.createRule')}</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{t('automation.createRule')}</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>{t('automation.ruleName')}</Label>
                <Input value={newRule.name} onChange={e => setNewRule(prev => ({ ...prev, name: e.target.value }))} placeholder="e.g. Welcome email for new leads" />
              </div>
              <div>
                <Label>{t('automation.trigger')}</Label>
                <Select value={newRule.trigger.type} onValueChange={v => setNewRule(prev => ({ ...prev, trigger: { ...prev.trigger, type: v } }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TRIGGER_TYPES.map(tt => <SelectItem key={tt.value} value={tt.value}>{tt.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {newRule.trigger.type.includes('tag') && (
                <div>
                  <Label>Tag value</Label>
                  <Input value={newRule.trigger.value} onChange={e => setNewRule(prev => ({ ...prev, trigger: { ...prev.trigger, value: e.target.value } }))} placeholder="Tag name" />
                </div>
              )}

              <div className="space-y-3">
                <Label>{t('automation.actions')}</Label>
                {newRule.actions.map((action, idx) => (
                  <div key={idx} className="flex items-center gap-2 p-3 border rounded-lg bg-muted/30">
                    {idx > 0 && <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />}
                    <Select value={action.type} onValueChange={v => updateAction(idx, 'type', v)}>
                      <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {ACTION_TYPES.map(at => <SelectItem key={at.value} value={at.value}>{at.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Input value={action.value} onChange={e => updateAction(idx, 'value', e.target.value)} placeholder={action.type === 'wait' ? 'Days' : 'Value'} className="flex-1" />
                    {newRule.actions.length > 1 && (
                      <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => removeAction(idx)}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    )}
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={addAction}><Plus className="h-3.5 w-3.5 mr-1" />Add step</Button>
              </div>

              <Button onClick={handleCreate} className="w-full">{t('automation.createRule')}</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {rules.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Zap className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-semibold mb-2">{t('automation.emptyTitle')}</h3>
            <p className="text-muted-foreground mb-4 max-w-md">{t('automation.emptyDesc')}</p>
            <Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4 mr-2" />{t('automation.createFirst')}</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {rules.map(rule => (
            <Card key={rule.id}>
              <CardContent className="flex items-center gap-4 py-4">
                <Switch checked={rule.enabled} onCheckedChange={() => toggleRule(rule.id)} />
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{rule.name}</p>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <Badge variant="outline" className="text-xs">
                      <Zap className="h-3 w-3 mr-1" />
                      {TRIGGER_TYPES.find(t => t.value === rule.trigger.type)?.label}
                    </Badge>
                    <ArrowRight className="h-3 w-3 text-muted-foreground" />
                    {rule.actions.map((a, i) => {
                      const at = ACTION_TYPES.find(t => t.value === a.type);
                      return (
                        <Badge key={i} variant="secondary" className="text-xs">
                          {at && <at.icon className="h-3 w-3 mr-1" />}
                          {at?.label}{a.value ? `: ${a.value}` : ''}
                        </Badge>
                      );
                    })}
                  </div>
                </div>
                <Button variant="ghost" size="icon" className="shrink-0" onClick={() => deleteRule(rule.id)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Lead Scoring Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5" />
            {t('automation.leadScoring')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { key: 'email_opened', label: t('automation.scoreEmailOpened'), default: 1 },
              { key: 'email_clicked', label: t('automation.scoreEmailClicked'), default: 2 },
              { key: 'email_replied', label: t('automation.scoreEmailReplied'), default: 5 },
              { key: 'website_visited', label: t('automation.scoreWebsiteVisited'), default: 3 },
              { key: 'deal_created', label: t('automation.scoreDealCreated'), default: 10 },
            ].map(item => (
              <div key={item.key} className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
                <span className="text-sm font-medium">{item.label}</span>
                <Badge variant="secondary" className="text-sm font-mono">+{item.default}</Badge>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-3">{t('automation.scoringDesc')}</p>
        </CardContent>
      </Card>
    </div>
  );
}
