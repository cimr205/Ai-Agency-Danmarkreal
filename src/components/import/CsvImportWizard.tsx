import { useState, useCallback, useRef, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import { Upload, FileSpreadsheet, ArrowRight, CheckCircle, AlertTriangle, Sparkles, Download, Info } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useI18n } from '@/lib/i18n';

interface CsvImportWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

type Step = 'upload' | 'mapping' | 'preview' | 'importing' | 'done';

export function CsvImportWizard({ open, onOpenChange, onSuccess }: CsvImportWizardProps) {
  const { t } = useI18n();
  const [step, setStep] = useState<Step>('upload');
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [useAi, setUseAi] = useState(true);
  const [result, setResult] = useState<{ imported: number; duplicates: number; total: number; ai_classified: boolean } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [fileName, setFileName] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const DB_FIELDS = useMemo(() => [
    { value: '', label: t('csvImport.skipField') },
    { value: 'name', label: t('csvImport.nameField') },
    { value: 'email', label: t('csvImport.emailField') },
    { value: 'phone', label: t('csvImport.phoneField') },
    { value: 'company_name', label: t('csvImport.companyField') },
    { value: 'address', label: t('csvImport.addressField') },
    { value: 'city', label: t('csvImport.cityField') },
    { value: 'value', label: t('csvImport.valueField') },
    { value: 'currency', label: t('csvImport.currencyField') },
    { value: 'notes', label: t('csvImport.notesField') },
    { value: 'score', label: t('csvImport.scoreField') },
    { value: 'industry', label: t('csvImport.industryField') },
    { value: 'tags', label: t('csvImport.tagsField') },
  ], [t]);

  const reset = () => {
    setStep('upload');
    setCsvHeaders([]);
    setCsvRows([]);
    setMapping({});
    setResult(null);
    setFileName('');
    setUseAi(true);
  };

  const handleClose = (val: boolean) => {
    if (!val) reset();
    onOpenChange(val);
  };

  const parseCsv = (text: string) => {
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) { toast.error(t('csvImport.needsHeaderAndRow')); return; }

    const firstLine = lines[0];
    const semicolons = (firstLine.match(/;/g) || []).length;
    const commas = (firstLine.match(/,/g) || []).length;
    const delimiter = semicolons > commas ? ';' : ',';

    const headers = lines[0].split(delimiter).map(h => h.trim().replace(/^["']|["']$/g, ''));
    const rows = lines.slice(1).map(line => {
      const vals = line.split(delimiter).map(v => v.trim().replace(/^["']|["']$/g, ''));
      const row: Record<string, string> = {};
      headers.forEach((h, i) => { row[h] = vals[i] || ''; });
      return row;
    }).filter(r => Object.values(r).some(v => v));

    setCsvHeaders(headers);
    setCsvRows(rows);

    const autoMap: Record<string, string> = {};
    const aliases: Record<string, string[]> = {
      name: ['name', 'navn', 'full_name', 'kontakt', 'contact', 'lead'],
      email: ['email', 'e-mail', 'mail', 'e_mail'],
      phone: ['phone', 'telefon', 'tel', 'mobil', 'mobile'],
      company_name: ['company', 'firma', 'virksomhed', 'company_name', 'organization'],
      address: ['address', 'adresse', 'street', 'gade', 'vej'],
      city: ['city', 'by', 'town', 'stad', 'postnr', 'zipcode', 'zip'],
      value: ['value', 'værdi', 'amount', 'beløb', 'deal_value'],
      currency: ['currency', 'valuta'],
      notes: ['notes', 'noter', 'comment', 'kommentar', 'description', 'beskrivelse'],
      score: ['score', 'rating', 'priority', 'prioritet'],
      industry: ['industry', 'branche', 'kategori', 'category', 'sector', 'sektor'],
      tags: ['tags', 'labels', 'etiketter', 'tag'],
    };

    for (const h of headers) {
      const lower = h.toLowerCase();
      for (const [field, keys] of Object.entries(aliases)) {
        if (keys.some(k => lower.includes(k)) && !Object.values(autoMap).includes(field)) {
          autoMap[h] = field;
          break;
        }
      }
    }

    setMapping(autoMap);
    setStep('mapping');
  };

  const handleFile = (file: File) => {
    if (!file.name.endsWith('.csv') && !file.type.includes('csv') && !file.type.includes('text')) {
      toast.error(t('csvImport.onlyCsvSupported'));
      return;
    }
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => parseCsv(e.target?.result as string);
    reader.readAsText(file, 'UTF-8');
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, []);

  const mappedFields = Object.values(mapping).filter(Boolean);
  const hasRequired = mappedFields.includes('name') && mappedFields.includes('email');

  const handleImport = async () => {
    setStep('importing');
    try {
      const { data, error } = await supabase.functions.invoke('csv-import-leads', {
        body: { rows: csvRows, mapping, useAi },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setResult(data);
      setStep('done');
      onSuccess?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('csvImport.importFailed'));
      setStep('preview');
    }
  };

  const stepLabels = [t('csvImport.stepUpload'), t('csvImport.stepMapping'), t('csvImport.stepPreview'), t('csvImport.stepImport')];

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            {t('csvImport.title')}
            {step !== 'upload' && (
              <Badge variant="outline" className="ml-2 text-xs font-normal">
                {fileName}
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-4">
          {stepLabels.map((label, i) => {
            const steps: Step[] = ['upload', 'mapping', 'preview', 'importing'];
            const currentIdx = steps.indexOf(step === 'done' ? 'importing' : step);
            return (
              <div key={label} className="flex items-center gap-1">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${
                  i <= currentIdx ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                }`}>
                  {i + 1}
                </div>
                <span className={i <= currentIdx ? 'text-foreground' : ''}>{label}</span>
                {i < 3 && <ArrowRight className="h-3 w-3 mx-1" />}
              </div>
            );
          })}
        </div>

        {step === 'upload' && (
          <div className="space-y-4">
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm">
              <div className="flex items-center gap-2 font-semibold mb-2">
                <Info className="h-4 w-4 text-primary" />
                CSV import requirements
              </div>
              <ol className="space-y-1.5 list-decimal list-inside text-foreground/80">
                <li>File must be <strong>.csv</strong> (UTF-8). Comma <code className="px-1 bg-muted rounded">,</code> or semicolon <code className="px-1 bg-muted rounded">;</code> separator works.</li>
                <li>First row must be <strong>column headers</strong> (e.g. <code className="px-1 bg-muted rounded">name,email,phone</code>).</li>
                <li><strong>Required columns:</strong> <code className="px-1 bg-muted rounded">name</code> and <code className="px-1 bg-muted rounded">email</code> — rows missing either are skipped.</li>
                <li><strong>Optional:</strong> phone, company_name, address, city, value, currency, notes, score (0–5), industry, tags (comma-separated), status.</li>
                <li>Duplicates (same email within your company) are auto-skipped.</li>
                <li>Max recommended: 5,000 rows per file. Larger files? Split them.</li>
              </ol>
              <div className="mt-3 pt-3 border-t border-primary/20">
                <p className="text-xs text-muted-foreground mb-2">Example row:</p>
                <code className="block text-xs bg-muted p-2 rounded overflow-x-auto whitespace-nowrap">
                  name,email,phone,company_name,address,city,value<br />
                  Anders Hansen,anders@firma.dk,+4512345678,Firma ApS,Hovedgaden 1,København,50000
                </code>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3 w-full"
                  onClick={(e) => {
                    e.stopPropagation();
                    const csv = 'name,email,phone,company_name,address,city,value,notes,score,industry,tags\nAnders Hansen,anders@firma.dk,+4512345678,Firma ApS,Hovedgaden 1,København,50000,Met at trade show,4,it_software,"vip,hot-lead"\nMette Jensen,mette@test.dk,+4587654321,Test A/S,Storgade 22,Aarhus,25000,Referral,3,marketing,"newsletter"\n';
                    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = 'leads-example.csv';
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                >
                  <Download className="h-3 w-3 mr-2" />
                  Download example CSV
                </Button>
              </div>
            </div>

            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={onDrop}
              onClick={() => fileRef.current?.click()}
              className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                isDragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-primary/50'
              }`}
            >
              <Upload className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
              <p className="text-base font-medium">{t('csvImport.dragDropTitle')}</p>
              <p className="text-sm text-muted-foreground mt-1">{t('csvImport.dragDropSubtitle')}</p>
              <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }} />
            </div>
          </div>
        )}

        {step === 'mapping' && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {t('csvImport.connectColumns')}
            </p>
            <div className="space-y-3">
              {csvHeaders.map(header => (
                <div key={header} className="flex items-center gap-3">
                  <div className="w-1/3 text-sm font-medium truncate" title={header}>{header}</div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  <Select value={mapping[header] || ''} onValueChange={(val) => setMapping(prev => ({ ...prev, [header]: val }))}>
                    <SelectTrigger className="w-2/3">
                      <SelectValue placeholder={t('csvImport.selectField')} />
                    </SelectTrigger>
                    <SelectContent>
                      {DB_FIELDS.map(f => (
                        <SelectItem key={f.value} value={f.value || 'skip'} disabled={f.value !== '' && f.value !== mapping[header] && mappedFields.includes(f.value)}>
                          {f.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <Label htmlFor="ai-toggle" className="text-sm font-medium">{t('csvImport.aiClassification')}</Label>
                <span className="text-xs text-muted-foreground">{t('csvImport.aiClassificationHint')}</span>
              </div>
              <Switch id="ai-toggle" checked={useAi} onCheckedChange={setUseAi} />
            </div>

            <div className="flex justify-between">
              <Button variant="outline" onClick={reset}>{t('common.cancel')}</Button>
              <Button onClick={() => setStep('preview')} disabled={!hasRequired}>
                {t('csvImport.preview')} <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        )}

        {step === 'preview' && (
          <div className="space-y-4">
            <div className="flex items-center gap-4 text-sm">
              <Badge variant="secondary">{csvRows.length} {t('csvImport.rows')}</Badge>
              <Badge variant="secondary">{mappedFields.length} {t('csvImport.fieldsMapped')}</Badge>
              {useAi && <Badge className="bg-primary/10 text-primary"><Sparkles className="h-3 w-3 mr-1" />{t('csvImport.aiActive')}</Badge>}
            </div>

            <div className="border rounded-lg overflow-x-auto max-h-[300px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    {Object.entries(mapping).filter(([, v]) => v).map(([csv, db]) => (
                      <TableHead key={csv} className="text-xs whitespace-nowrap">
                        {DB_FIELDS.find(f => f.value === db)?.label || db}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {csvRows.slice(0, 5).map((row, i) => (
                    <TableRow key={i}>
                      {Object.entries(mapping).filter(([, v]) => v).map(([csv]) => (
                        <TableCell key={csv} className="text-xs truncate max-w-[150px]">{row[csv] || '—'}</TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {csvRows.length > 5 && (
              <p className="text-xs text-muted-foreground text-center">
                {t('csvImport.showingOf').replace('{count}', String(csvRows.length))}
              </p>
            )}

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep('mapping')}>{t('common.back')}</Button>
              <Button onClick={handleImport}>
                {t('csvImport.importLeads').replace('{count}', String(csvRows.length))}
              </Button>
            </div>
          </div>
        )}

        {step === 'importing' && (
          <div className="py-8 text-center space-y-4">
            <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full mx-auto" />
            <p className="font-medium">{t('csvImport.importingLeads')}</p>
            {useAi && <p className="text-sm text-muted-foreground">{t('csvImport.aiClassifying')}</p>}
            <Progress value={50} className="max-w-xs mx-auto" />
          </div>
        )}

        {step === 'done' && result && (
          <div className="py-6 text-center space-y-4">
            <CheckCircle className="h-12 w-12 text-green-500 mx-auto" />
            <p className="text-lg font-medium">{t('csvImport.importComplete')}</p>
            <div className="grid grid-cols-3 gap-4 max-w-sm mx-auto">
              <div className="text-center">
                <div className="text-2xl font-bold text-primary">{result.imported}</div>
                <div className="text-xs text-muted-foreground">{t('csvImport.imported')}</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-amber-500">{result.duplicates}</div>
                <div className="text-xs text-muted-foreground">{t('csvImport.duplicates')}</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold">{result.total}</div>
                <div className="text-xs text-muted-foreground">{t('csvImport.total')}</div>
              </div>
            </div>
            {result.duplicates > 0 && (
              <div className="flex items-center justify-center gap-2 text-sm text-amber-600">
                <AlertTriangle className="h-4 w-4" />
                {t('csvImport.duplicatesSkipped').replace('{count}', String(result.duplicates))}
              </div>
            )}
            {result.ai_classified && (
              <div className="flex items-center justify-center gap-2 text-sm text-primary">
                <Sparkles className="h-4 w-4" />
                {t('csvImport.aiClassified')}
              </div>
            )}
            <Button onClick={() => handleClose(false)}>{t('common.close')}</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
