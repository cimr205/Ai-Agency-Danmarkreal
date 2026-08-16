import { useI18n } from '@/lib/i18n';
import { Shield } from 'lucide-react';

export default function PrivacyPolicy() {
  const { locale } = useI18n();
  const isDa = locale === 'da';

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-6 py-16">
        <div className="flex items-center gap-3 mb-8">
          <Shield className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-bold">{isDa ? 'Privatlivspolitik' : 'Privacy Policy'}</h1>
        </div>
        <p className="text-sm text-muted-foreground mb-8">
          {isDa ? 'Sidst opdateret: 31. marts 2026' : 'Last updated: March 31, 2026'}
        </p>

        <div className="prose dark:prose-invert max-w-none space-y-6">
          <section>
            <h2>{isDa ? '1. Dataansvarlig' : '1. Data Controller'}</h2>
            <p>
              {isDa
                ? 'AI Agency Danmark (CVR: 45949923) er dataansvarlig for behandling af dine personoplysninger i forbindelse med brug af platformen.'
                : 'AI Agency Danmark (CVR: 45949923) is the data controller responsible for processing your personal data in connection with the use of the platform.'}
            </p>
            <p>
              {isDa ? 'Kontakt: Aiagencydanmark@gmail.com' : 'Contact: Aiagencydanmark@gmail.com'}
            </p>
          </section>

          <section>
            <h2>{isDa ? '2. Hvilke data indsamler vi' : '2. What Data We Collect'}</h2>
            <ul>
              <li>{isDa ? 'Kontooplysninger: navn, email, adgangskode (krypteret)' : 'Account info: name, email, password (encrypted)'}</li>
              <li>{isDa ? 'Virksomhedsdata: CVR, adresse, telefon, website' : 'Company data: CVR, address, phone, website'}</li>
              <li>{isDa ? 'CRM-data: leads, deals, kundeoplysninger' : 'CRM data: leads, deals, customer information'}</li>
              <li>{isDa ? 'Kommunikationsdata: emails, opkaldslogs' : 'Communication data: emails, call logs'}</li>
              <li>{isDa ? 'Brugsdata: sessioner, aktivitetslogs' : 'Usage data: sessions, activity logs'}</li>
              <li>{isDa ? 'Cookies og samtykkedata' : 'Cookies and consent data'}</li>
            </ul>
          </section>

          <section>
            <h2>{isDa ? '3. Formål med behandling' : '3. Purpose of Processing'}</h2>
            <p>
              {isDa
                ? 'Vi behandler dine data for at: levere vores CRM-platform, administrere din konto, sende nødvendige systemmeddelelser, forbedre vores tjenester, og overholde lovkrav.'
                : 'We process your data to: deliver our CRM platform, manage your account, send necessary system communications, improve our services, and comply with legal requirements.'}
            </p>
          </section>

          <section>
            <h2>{isDa ? '4. Retsgrundlag (GDPR Art. 6)' : '4. Legal Basis (GDPR Art. 6)'}</h2>
            <ul>
              <li><strong>{isDa ? 'Kontrakt (Art. 6(1)(b))' : 'Contract (Art. 6(1)(b))'}</strong>: {isDa ? 'Nødvendigt for at levere tjenesten' : 'Necessary to deliver the service'}</li>
              <li><strong>{isDa ? 'Samtykke (Art. 6(1)(a))' : 'Consent (Art. 6(1)(a))'}</strong>: {isDa ? 'Marketing-emails og cookies' : 'Marketing emails and cookies'}</li>
              <li><strong>{isDa ? 'Legitim interesse (Art. 6(1)(f))' : 'Legitimate interest (Art. 6(1)(f))'}</strong>: {isDa ? 'Sikkerhed, fejlretning, produktforbedring' : 'Security, debugging, product improvement'}</li>
              <li><strong>{isDa ? 'Retlig forpligtelse (Art. 6(1)(c))' : 'Legal obligation (Art. 6(1)(c))'}</strong>: {isDa ? 'Bogføring, skattelov' : 'Bookkeeping, tax law'}</li>
            </ul>
          </section>

          <section>
            <h2>{isDa ? '5. Dine rettigheder' : '5. Your Rights'}</h2>
            <p>{isDa ? 'Under GDPR har du ret til:' : 'Under GDPR you have the right to:'}</p>
            <ul>
              <li>{isDa ? 'Indsigt i dine data (Art. 15)' : 'Access your data (Art. 15)'}</li>
              <li>{isDa ? 'Berigtigelse af forkerte data (Art. 16)' : 'Rectification of incorrect data (Art. 16)'}</li>
              <li>{isDa ? 'Sletning af dine data (Art. 17)' : 'Erasure of your data (Art. 17)'}</li>
              <li>{isDa ? 'Eksport/portabilitet af dine data (Art. 20)' : 'Export/portability of your data (Art. 20)'}</li>
              <li>{isDa ? 'Begrænsning af behandling (Art. 18)' : 'Restriction of processing (Art. 18)'}</li>
              <li>{isDa ? 'Indsigelse mod behandling (Art. 21)' : 'Object to processing (Art. 21)'}</li>
              <li>{isDa ? 'Tilbagetrækning af samtykke (Art. 7)' : 'Withdrawal of consent (Art. 7)'}</li>
            </ul>
            <p>
              {isDa
                ? 'Du kan udøve disse rettigheder direkte i systemet under Indstillinger → Profil → GDPR & Datarettigheder, eller ved at kontakte os på Aiagencydanmark@gmail.com.'
                : 'You can exercise these rights directly in the system under Settings → Profile → GDPR & Data Rights, or by contacting us at Aiagencydanmark@gmail.com.'}
            </p>
          </section>

          <section>
            <h2>{isDa ? '6. Dataopbevaring' : '6. Data Retention'}</h2>
            <ul>
              <li>{isDa ? 'Kontodata: Så længe kontoen er aktiv + 30 dage efter sletning' : 'Account data: As long as account is active + 30 days after deletion'}</li>
              <li>{isDa ? 'Aktivitetslogs: 90 dage' : 'Activity logs: 90 days'}</li>
              <li>{isDa ? 'Sessionsdata: 90 dage' : 'Session data: 90 days'}</li>
              <li>{isDa ? 'Bogføringsdata: 5 år (lovkrav)' : 'Accounting data: 5 years (legal requirement)'}</li>
              <li>{isDa ? 'Samtykkelog: 3 år' : 'Consent log: 3 years'}</li>
            </ul>
          </section>

          <section>
            <h2>{isDa ? '7. Cookies' : '7. Cookies'}</h2>
            <p>
              {isDa
                ? 'Vi bruger nødvendige cookies til autentificering og session-håndtering. Analytiske og marketing-cookies kræver dit samtykke. Du kan administrere dine cookie-præferencer via cookie-banneret.'
                : 'We use necessary cookies for authentication and session management. Analytical and marketing cookies require your consent. You can manage your cookie preferences via the cookie banner.'}
            </p>
          </section>

          <section>
            <h2>{isDa ? '8. Datadeling' : '8. Data Sharing'}</h2>
            <p>
              {isDa
                ? 'Vi deler kun data med underleverandører der er nødvendige for drift (hosting, email), og kun med databehandleraftaler (DPA) på plads. Vi sælger aldrig dine data.'
                : 'We only share data with sub-processors necessary for operations (hosting, email), and only with data processing agreements (DPA) in place. We never sell your data.'}
            </p>
          </section>

          <section>
            <h2>{isDa ? '9. Klageadgang' : '9. Complaints'}</h2>
            <p>
              {isDa
                ? 'Spørgsmål om databeskyttelse kan rettes til: Aiagencydanmark@gmail.com. Du kan også indgive klage til Datatilsynet (datatilsynet.dk).'
                : 'Questions about data protection can be directed to: Aiagencydanmark@gmail.com. You can also file a complaint with the Danish Data Protection Agency (datatilsynet.dk).'}
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
