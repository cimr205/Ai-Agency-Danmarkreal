import { useI18n } from '@/lib/i18n';
import { FileText } from 'lucide-react';

export default function TermsOfService() {
  const { locale } = useI18n();
  const isDa = locale === 'da';

  return (
    <div className="light min-h-screen bg-background text-foreground">
      <div className="max-w-3xl mx-auto px-6 py-16">
        <div className="flex items-center gap-3 mb-8">
          <FileText className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-bold">{isDa ? 'Servicevilkår' : 'Terms of Service'}</h1>
        </div>
        <p className="text-sm text-muted-foreground mb-8">
          {isDa ? 'Sidst opdateret: 31. marts 2026' : 'Last updated: March 31, 2026'}
        </p>

        <div className="prose dark:prose-invert max-w-none space-y-6">
          <section>
            <h2>{isDa ? '1. Generelt' : '1. General'}</h2>
            <p>
              {isDa
                ? 'Disse vilkår gælder for brug af platformen leveret af AI Agency Danmark (CVR: 45949923). Ved at oprette en konto accepterer du disse vilkår.'
                : 'These terms apply to the use of the platform provided by AI Agency Danmark (CVR: 45949923). By creating an account, you accept these terms.'}
            </p>
          </section>

          <section>
            <h2>{isDa ? '2. Tjenestebeskrivelse' : '2. Service Description'}</h2>
            <p>
              {isDa
                ? 'AI Agency Danmark leverer en CRM- og forretningsplatform der inkluderer lead management, pipeline, fakturering, HR-moduler, email-marketing og AI-værktøjer.'
                : 'AI Agency Danmark provides a CRM and business platform that includes lead management, pipeline, invoicing, HR modules, email marketing, and AI tools.'}
            </p>
          </section>

          <section>
            <h2>{isDa ? '3. Brugerens ansvar' : '3. User Responsibilities'}</h2>
            <ul>
              <li>{isDa ? 'Du er ansvarlig for at holde dine loginoplysninger fortrolige' : 'You are responsible for keeping your login credentials confidential'}</li>
              <li>{isDa ? 'Du må ikke bruge platformen til ulovlige formål' : 'You may not use the platform for illegal purposes'}</li>
              <li>{isDa ? 'Du er ansvarlig for data du uploader til systemet' : 'You are responsible for data you upload to the system'}</li>
              <li>{isDa ? 'Du skal overholde GDPR ved håndtering af persondata via platformen' : 'You must comply with GDPR when handling personal data via the platform'}</li>
            </ul>
          </section>

          <section>
            <h2>{isDa ? '4. Databeskyttelse' : '4. Data Protection'}</h2>
            <p>
              {isDa
                ? 'Vi behandler data i overensstemmelse med GDPR og vores privatlivspolitik. Vi fungerer som databehandler for dine kundedata og som dataansvarlig for kontodata.'
                : 'We process data in accordance with GDPR and our privacy policy. We act as data processor for your customer data and as data controller for account data.'}
            </p>
          </section>

          <section>
            <h2>{isDa ? '5. Tilgængelighed' : '5. Availability'}</h2>
            <p>
              {isDa
                ? 'Vi bestræber os på høj oppetid men garanterer ikke uafbrudt adgang. Planlagt vedligeholdelse varsles minimum 24 timer i forvejen.'
                : 'We strive for high uptime but do not guarantee uninterrupted access. Planned maintenance is notified at least 24 hours in advance.'}
            </p>
          </section>

          <section>
            <h2>{isDa ? '6. Ansvarsbegrænsning' : '6. Limitation of Liability'}</h2>
            <p>
              {isDa
                ? 'AI Agency Danmark er ikke ansvarlig for indirekte tab, følgeskader eller tab af data. Vores samlede ansvar er begrænset til det beløb du har betalt de seneste 12 måneder.'
                : 'AI Agency Danmark is not liable for indirect losses, consequential damages, or data loss. Our total liability is limited to the amount you have paid in the last 12 months.'}
            </p>
          </section>

          <section>
            <h2>{isDa ? '7. Opsigelse' : '7. Termination'}</h2>
            <p>
              {isDa
                ? 'Du kan til enhver tid opsige din konto. Ved opsigelse har du 30 dage til at eksportere dine data. Herefter slettes data permanent undtagen data vi er lovmæssigt forpligtet til at opbevare.'
                : 'You can terminate your account at any time. Upon termination, you have 30 days to export your data. After that, data is permanently deleted except data we are legally required to retain.'}
            </p>
          </section>

          <section>
            <h2>{isDa ? '8. Ændringer' : '8. Changes'}</h2>
            <p>
              {isDa
                ? 'Vi kan opdatere disse vilkår med 30 dages varsel. Fortsat brug efter ændring udgør accept af de nye vilkår.'
                : 'We may update these terms with 30 days notice. Continued use after a change constitutes acceptance of the new terms.'}
            </p>
          </section>

          <section>
            <h2>{isDa ? '9. Lovvalg' : '9. Governing Law'}</h2>
            <p>
              {isDa
                ? 'Disse vilkår er underlagt dansk ret. Tvister afgøres ved Retten i København.'
                : 'These terms are governed by Danish law. Disputes are resolved at the Copenhagen City Court.'}
            </p>
          </section>

          <section>
            <h2>{isDa ? '10. Kontakt' : '10. Contact'}</h2>
            <p>
              {isDa
                ? 'Spørgsmål kan rettes til: Aiagencydanmark@gmail.com'
                : 'Questions can be directed to: Aiagencydanmark@gmail.com'}
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
