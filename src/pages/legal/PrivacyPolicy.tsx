import { useI18n } from '@/lib/i18n';
import { openCookieSettings } from '@/lib/consent';
import { Shield } from 'lucide-react';

export default function PrivacyPolicy() {
  const { locale } = useI18n();
  const isDa = locale === 'da';

  return (
    <div className="light min-h-screen bg-background text-foreground">
      <div className="max-w-3xl mx-auto px-6 py-16">
        <div className="flex items-center gap-3 mb-8">
          <Shield className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-bold">{isDa ? 'Privatlivspolitik' : 'Privacy Policy'}</h1>
        </div>
        <p className="text-sm text-muted-foreground mb-8">
          {isDa ? 'Sidst opdateret: 17. november 2026' : 'Last updated: November 17, 2026'}
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
            <h2>{isDa ? '7a. Analyse, samtykke og leverandører' : '7a. Analytics, consent and vendors'}</h2>
            <p>{isDa
              ? 'Valgfrie analyseværktøjer indlæses først, når du har accepteret kategorien "Analyse" i cookiebanneret, og kun på vores offentlige website. De kører aldrig i dit CRM-arbejdsområde eller på login-sider, og de bruges ikke til at analysere indholdet i kundernes CRM. Afvisning kræver ét klik, ligesom accept.'
              : 'Optional analytics tools load only after you accept the "Analytics" category in the cookie banner, and only on our public website. They never run in your CRM workspace or on login pages, and they are not used to analyse the content of customers’ CRM data. Rejecting takes one click, just like accepting.'}</p>
            <ul>
              <li><strong>Google Analytics 4</strong> ({isDa ? 'Google Ireland Limited, Irland' : 'Google Ireland Limited, Ireland'}). {isDa
                ? 'Formål: samlet trafikstatistik for vores website. Data: cookie-id (_ga, _ga_*), besøgte sider, henvisende side, enhed, browser og omtrentlig placering. Retsgrundlag: samtykke (GDPR art. 6(1)(a) og cookiebekendtgørelsen). Opbevaring: bruger- og hændelsesdata slettes automatisk efter den periode, der er indstillet i GA4, højst 14 måneder. Overførsel: data kan behandles af Google LLC i USA på grundlag af EU-U.S. Data Privacy Framework. Annoncesignaler er slået fra, medmindre du også accepterer "Marketing".'
                : 'Purpose: aggregated traffic statistics for our website. Data: cookie id (_ga, _ga_*), pages visited, referrer, device, browser and approximate location. Legal basis: consent (GDPR Art. 6(1)(a) and the ePrivacy rules). Retention: user- and event-level data is deleted automatically after the period set in GA4, at most 14 months. Transfers: data may be processed by Google LLC in the USA under the EU-U.S. Data Privacy Framework. Advertising signals stay off unless you also accept "Marketing".'}</li>
              <li><strong>Leadfeeder</strong> ({isDa ? 'Dealfront Group GmbH' : 'Dealfront Group GmbH'}). {isDa
                ? 'Formål: at se hvilke virksomheder, der besøger vores offentlige sider, ud fra IP-adressen og besøgte sider. Data: IP-adresse, besøgte sider, tidspunkt og cookie-id. Retsgrundlag: samtykke (art. 6(1)(a)). Hosting: Amazon Web Services i EU (Irland) ifølge leverandøren. Opbevaring: så længe vores Leadfeeder-konto er aktiv, medmindre du gør indsigelse.'
                : 'Purpose: seeing which companies visit our public pages, based on IP address and pages viewed. Data: IP address, pages viewed, time and cookie id. Legal basis: consent (Art. 6(1)(a)). Hosting: Amazon Web Services in the EU (Ireland), according to the vendor. Retention: for as long as our Leadfeeder account is active, unless you object.'}</li>
              <li><strong>Vercel Web Analytics &amp; Speed Insights</strong> (Vercel Inc.). {isDa
                ? 'Cookiefri, samlet statistik over sidevisninger og sidehastighed. Der gemmes intet på din enhed; besøgende genkendes kun via en hash af anmodningen, som kasseres efter 24 timer. Id’er i CRM-adresser og forespørgselsparametre fjernes, før data sendes. Retsgrundlag: legitim interesse i drift og sikkerhed (art. 6(1)(f)).'
                : 'Cookieless, aggregated statistics on page views and page speed. Nothing is stored on your device; visitors are recognised only by a hash of the request, discarded after 24 hours. Record ids in CRM URLs and query parameters are removed before data is sent. Legal basis: legitimate interest in operations and security (Art. 6(1)(f)).'}</li>
            </ul>
            <p>{isDa
              ? 'Du kan trække dit samtykke tilbage når som helst via knappen nedenfor eller linket "Cookieindstillinger" nederst på siden. Ved tilbagetrækning stoppes Google Analytics med det samme, dens cookies slettes, og siden genindlæses, så intet valgfrit script fortsætter. Dine valg logges med tidspunkt, version og et tilfældigt id som dokumentation for samtykket.'
              : 'You can withdraw consent at any time with the button below or the "Cookie settings" link at the bottom of the page. On withdrawal, Google Analytics stops immediately, its cookies are deleted and the page reloads so no optional script keeps running. Your choices are logged with time, version and a random id as proof of consent.'}</p>
            <button type="button" className="underline text-primary" onClick={openCookieSettings}>
              {isDa ? 'Redigér cookievalg' : 'Edit cookie preferences'}
            </button>
          </section>

          <section>
            <h2>{isDa ? '8. Datadeling' : '8. Data Sharing'}</h2>
            <p>
              {isDa
                ? 'Vi deler kun data med underleverandører der er nødvendige for drift (hosting, email) og, med dit samtykke, de analyseleverandører der er nævnt i afsnit 7a. Vi sælger aldrig dine data.'
                : 'We only share data with sub-processors necessary for operations (hosting, email) and, with your consent, the analytics vendors listed in section 7a. We never sell your data.'}
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
