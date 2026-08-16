import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { useState } from 'react';

export function SalesPdfDownload() {
  const { t, locale } = useI18n();
  const [loading, setLoading] = useState(false);

  const generatePdf = async () => {
    setLoading(true);
    try {
      const { default: jsPDF } = await import('jspdf');
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const w = doc.internal.pageSize.getWidth();
    const h = doc.internal.pageSize.getHeight();
    const margin = 20;
    let y = 0;

    // ─── Colors ────────────────────
    const primary: [number, number, number] = [30, 64, 175];
    const dark: [number, number, number] = [15, 23, 42];
    const gray: [number, number, number] = [100, 116, 139];
    const light: [number, number, number] = [241, 245, 249];
    const accent: [number, number, number] = [16, 185, 129];

    // ─── Page 1: Cover ─────────────
    doc.setFillColor(...primary);
    doc.rect(0, 0, w, h, 'F');

    // Decorative circle
    doc.setFillColor(255, 255, 255);
    doc.setGState(doc.GState({ opacity: 0.05 }));
    doc.circle(w * 0.8, h * 0.3, 120, 'F');
    doc.circle(w * 0.2, h * 0.7, 80, 'F');
    doc.setGState(doc.GState({ opacity: 1 }));

    y = 80;
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'normal');
    doc.text('AI AGENCY DANMARK', margin, y);

    y += 30;
    doc.setFontSize(36);
    doc.setFont('helvetica', 'bold');
    const title = locale === 'da' ? 'Din virksomhed.\nÉt system.' : 'Your business.\nOne system.';
    doc.text(title, margin, y);

    y += 30;
    doc.setFontSize(16);
    doc.setFont('helvetica', 'normal');
    const subtitle = locale === 'da'
      ? 'CRM, HR, fakturering, marketing, AI, opgaver,\nkalender og email — alt i én platform.'
      : 'CRM, HR, invoicing, marketing, AI, tasks,\ncalendar and email — all in one platform.';
    doc.text(subtitle, margin, y);

    y = h - 60;
    doc.setFontSize(11);
    doc.setTextColor(200, 210, 230);
    doc.text('www.aiagencydanmark.dk', margin, y);
    doc.text('CVR: 45949923', margin, y + 7);
    doc.text('+45 53 60 91 70', margin, y + 14);

    // ─── Page 2: Problem + Solution ─────
    doc.addPage();
    y = margin;
    doc.setTextColor(...dark);

    // Header bar
    doc.setFillColor(...primary);
    doc.rect(0, 0, w, 8, 'F');

    y = 30;
    doc.setFontSize(24);
    doc.setFont('helvetica', 'bold');
    doc.text(locale === 'da' ? 'Problemet' : 'The Problem', margin, y);

    y += 12;
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...gray);
    const problems = locale === 'da' ? [
      '• Virksomheder bruger i gennemsnit 4-7 separate systemer til drift',
      '• Data sidder i siloer — ingen fælles overblik',
      '• Manuelle processer spiser 10-15 timer om ugen per medarbejder',
      '• Ingen sammenhæng mellem salg, marketing og drift',
      '• Dyre licenser der hurtigt løber op',
    ] : [
      '• Businesses use 4-7 separate systems on average',
      '• Data stuck in silos — no unified overview',
      '• Manual processes eat 10-15 hours per week per employee',
      '• No connection between sales, marketing and operations',
      '• Expensive licenses that add up quickly',
    ];
    problems.forEach(p => { doc.text(p, margin, y); y += 8; });

    y += 15;
    doc.setTextColor(...dark);
    doc.setFontSize(24);
    doc.setFont('helvetica', 'bold');
    doc.text(locale === 'da' ? 'Løsningen' : 'The Solution', margin, y);

    y += 12;
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...gray);
    const solutions = locale === 'da' ? [
      'AI Agency Danmark samler alle jeres forretningsprocesser i én',
      'intelligent platform. Ingen flere skift mellem systemer.',
      'Ingen flere tabte data. Ingen flere dyre integrationer.',
      '',
      'Vi har bygget platformen fra bunden med AI i kernen,',
      'så I automatisk får smartere workflows, bedre leads',
      'og mere tid til det der virkelig tæller.',
    ] : [
      'AI Agency Danmark brings all your business processes into one',
      'intelligent platform. No more switching between systems.',
      'No more lost data. No more expensive integrations.',
      '',
      'We built the platform from scratch with AI at its core,',
      'so you automatically get smarter workflows, better leads',
      'and more time for what really matters.',
    ];
    solutions.forEach(s => { doc.text(s, margin, y); y += 7; });

    // ─── Page 3: Modules ────────────
    doc.addPage();
    doc.setFillColor(...primary);
    doc.rect(0, 0, w, 8, 'F');

    y = 30;
    doc.setTextColor(...dark);
    doc.setFontSize(24);
    doc.setFont('helvetica', 'bold');
    doc.text(locale === 'da' ? 'Alt inkluderet' : 'Everything Included', margin, y);

    y += 5;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...gray);
    doc.text(locale === 'da' ? 'Én pris. Alle moduler. Ingen skjulte gebyrer.' : 'One price. All modules. No hidden fees.', margin, y);

    y += 15;
    const modules = locale === 'da' ? [
      { title: 'CRM & Salg', desc: 'Leads, pipeline, deals, AI-anbefalinger, ICP scoring' },
      { title: 'Lead Generation', desc: 'AI-drevet virksomhedssøgning med verificerede emails' },
      { title: 'HR & Medarbejdere', desc: 'Ansatte, fravær, løn, vagtplan, tidsregistrering' },
      { title: 'Fakturering', desc: 'Professionelle fakturaer, moms-beregning, betalingssporing' },
      { title: 'Marketing & Ads', desc: 'Meta Ads integration, AI-genereret annonce-indhold' },
      { title: 'AI Assistent', desc: 'Personlig PA der sender mails, opretter opgaver og analyserer' },
      { title: 'Email & Inbox', desc: 'Gmail-integration, AI-prioritering, bulk email' },
      { title: 'Kalender & Opgaver', desc: 'Planlægning, deadlines og team-koordinering' },
    ] : [
      { title: 'CRM & Sales', desc: 'Leads, pipeline, deals, AI recommendations, ICP scoring' },
      { title: 'Lead Generation', desc: 'AI-powered company search with verified emails' },
      { title: 'HR & Employees', desc: 'Staff, leave, payroll, scheduling, time tracking' },
      { title: 'Invoicing', desc: 'Professional invoices, VAT calculation, payment tracking' },
      { title: 'Marketing & Ads', desc: 'Meta Ads integration, AI-generated ad content' },
      { title: 'AI Assistant', desc: 'Personal PA that sends emails, creates tasks and analyzes' },
      { title: 'Email & Inbox', desc: 'Gmail integration, AI prioritization, bulk email' },
      { title: 'Calendar & Tasks', desc: 'Planning, deadlines and team coordination' },
    ];

    modules.forEach((mod, i) => {
      // Card background
      doc.setFillColor(...light);
      doc.roundedRect(margin, y, w - margin * 2, 22, 3, 3, 'F');

      // Accent bar
      doc.setFillColor(...(i % 2 === 0 ? primary : accent));
      doc.rect(margin, y, 3, 22, 'F');

      doc.setTextColor(...dark);
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text(mod.title, margin + 8, y + 9);

      doc.setTextColor(...gray);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.text(mod.desc, margin + 8, y + 17);

      y += 27;
    });

    // ─── Page 4: Why Us + Pricing ───
    doc.addPage();
    doc.setFillColor(...primary);
    doc.rect(0, 0, w, 8, 'F');

    y = 30;
    doc.setTextColor(...dark);
    doc.setFontSize(24);
    doc.setFont('helvetica', 'bold');
    doc.text(locale === 'da' ? 'Hvorfor os?' : 'Why Us?', margin, y);

    y += 15;
    const whyUs = locale === 'da' ? [
      { icon: '⚡', text: 'Lynhurtig platform — moderne teknologi, ingen ventetid' },
      { icon: '🔒', text: 'Enterprise-grade sikkerhed og GDPR-compliance' },
      { icon: '🤖', text: 'AI integreret i hvert modul — ikke bare en chatbot' },
      { icon: '📈', text: 'Skalerbar — vokser med din virksomhed' },
      { icon: '🇩🇰', text: 'Dansk support og dansk udviklet' },
      { icon: '💰', text: 'Én pris, alt inkluderet — ingen overraskelser' },
    ] : [
      { icon: '⚡', text: 'Lightning fast platform — modern tech, no waiting' },
      { icon: '🔒', text: 'Enterprise-grade security and GDPR compliance' },
      { icon: '🤖', text: 'AI integrated in every module — not just a chatbot' },
      { icon: '📈', text: 'Scalable — grows with your business' },
      { icon: '🇩🇰', text: 'Danish support and Danish-built' },
      { icon: '💰', text: 'One price, everything included — no surprises' },
    ];

    doc.setFontSize(11);
    whyUs.forEach(item => {
      doc.setTextColor(...dark);
      doc.setFont('helvetica', 'normal');
      doc.text(`${item.icon}  ${item.text}`, margin, y);
      y += 10;
    });

    // Pricing box
    y += 15;
    doc.setFillColor(...primary);
    doc.roundedRect(margin, y, w - margin * 2, 55, 5, 5, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(locale === 'da' ? 'Simpel og gennemsigtig pris' : 'Simple and transparent pricing', margin + 15, y + 15);

    doc.setFontSize(32);
    doc.text('499 DKK', margin + 15, y + 35);

    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.text(locale === 'da' ? 'per bruger / måned' : 'per user / month', margin + 100, y + 35);

    doc.setFontSize(10);
    doc.text(locale === 'da' ? 'Alt inkluderet. Ingen bindingsperiode. Ingen skjulte gebyrer.' : 'Everything included. No commitment. No hidden fees.', margin + 15, y + 48);

    // ─── Page 5: CTA ────────────────
    doc.addPage();
    doc.setFillColor(...dark);
    doc.rect(0, 0, w, h, 'F');

    y = h / 2 - 40;
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(28);
    doc.setFont('helvetica', 'bold');
    const ctaTitle = locale === 'da' ? 'Klar til at forenkle\ndin virksomhed?' : 'Ready to simplify\nyour business?';
    doc.text(ctaTitle, w / 2, y, { align: 'center' });

    y += 30;
    doc.setFontSize(14);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(200, 210, 230);
    const ctaSub = locale === 'da'
      ? 'Start i dag og oplev forskellen fra dag ét.'
      : 'Start today and experience the difference from day one.';
    doc.text(ctaSub, w / 2, y, { align: 'center' });

    // CTA button
    y += 25;
    doc.setFillColor(...primary);
    doc.roundedRect(w / 2 - 50, y, 100, 14, 7, 7, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(locale === 'da' ? 'Kom i gang nu →' : 'Get started now →', w / 2, y + 9.5, { align: 'center' });

    y = h - 40;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(150, 160, 180);
    doc.text('AI Agency Danmark · CVR: 45949923', w / 2, y, { align: 'center' });
    doc.text('+45 53 60 91 70 · info@aiagencydanmark.dk', w / 2, y + 7, { align: 'center' });
    doc.text('www.aiagencydanmark.dk', w / 2, y + 14, { align: 'center' });

    doc.save('AI-Agency-Danmark-Presentation.pdf');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button onClick={generatePdf} disabled={loading} variant="outline" size="lg" className="h-11 px-6 text-sm font-medium rounded-full gap-2">
      <Download className="h-4 w-4" />
      {loading ? '...' : locale === 'da' ? 'Download præsentation' : locale === 'de' ? 'Präsentation herunterladen' : 'Download presentation'}
    </Button>
  );
}
