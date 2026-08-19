import { useI18n } from '@/lib/i18n';
import { FileText } from 'lucide-react';

export default function DataProcessingAgreement() {
  const { locale } = useI18n();
  const isDa = locale === 'da';

  return (
    <div className="light min-h-screen bg-background text-foreground">
      <div className="max-w-3xl mx-auto px-6 py-16">
        <div className="flex items-center gap-3 mb-8">
          <FileText className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-bold">{isDa ? 'Databehandleraftale (DPA)' : 'Data Processing Agreement (DPA)'}</h1>
        </div>
        <p className="text-sm text-muted-foreground mb-8">
          {isDa ? 'Sidst opdateret: 17. august 2026' : 'Last updated: August 17, 2026'}
        </p>

        <div className="prose dark:prose-invert max-w-none space-y-6">
          <section>
            <p>
              {isDa
                ? 'Denne databehandleraftale ("DPA") supplerer AI Agency Danmarks Servicevilkår og Privatlivspolitik og gælder, når kunden ("den Dataansvarlige") bruger platformen til at behandle personoplysninger, og AI Agency Danmark ApS/CVR 45949923 ("Databehandleren") behandler disse oplysninger på den Dataansvarliges vegne, jf. GDPR artikel 28.'
                : 'This Data Processing Agreement ("DPA") supplements AI Agency Danmark\'s Terms of Service and Privacy Policy and applies when the customer ("the Controller") uses the platform to process personal data, and AI Agency Danmark, CVR 45949923 ("the Processor") processes that data on the Controller\'s behalf, per GDPR Article 28.'}
            </p>
          </section>

          <section>
            <h2>{isDa ? '1. Genstand og varighed' : '1. Subject Matter and Duration'}</h2>
            <p>
              {isDa
                ? 'Databehandleren behandler personoplysninger på vegne af den Dataansvarlige med henblik på at levere CRM-, HR-, marketing- og finansfunktionerne i platformen, herunder eventuelle regnskabsintegrationer (f.eks. Dinero, e-conomic) som den Dataansvarlige aktivt forbinder. Behandlingen varer, så længe den Dataansvarliges konto er aktiv, og ophører ved kontoopsigelse i overensstemmelse med afsnit 6.'
                : 'The Processor processes personal data on behalf of the Controller to deliver the CRM, HR, marketing, and finance functionality of the platform, including any accounting integrations (e.g. Dinero, e-conomic) the Controller actively connects. Processing continues for as long as the Controller\'s account is active and ends upon account termination as described in Section 6.'}
            </p>
          </section>

          <section>
            <h2>{isDa ? '2. Karakter og formål med behandlingen' : '2. Nature and Purpose of Processing'}</h2>
            <p>
              {isDa
                ? 'Indsamling, lagring, ændring, videregivelse (til tredjepartsintegrationer valgt af den Dataansvarlige) og sletning af personoplysninger med det formål at drive CRM-platformen, herunder synkronisering af kunde- og fakturadata mellem platformen og eksterne regnskabssystemer, hvor den Dataansvarlige har aktiveret en sådan forbindelse.'
                : 'Collection, storage, modification, disclosure (to third-party integrations selected by the Controller), and deletion of personal data for the purpose of operating the CRM platform, including synchronization of customer and invoice data between the platform and external accounting systems where the Controller has enabled such a connection.'}
            </p>
          </section>

          <section>
            <h2>{isDa ? '3. Kategorier af registrerede og oplysninger' : '3. Categories of Data Subjects and Data'}</h2>
            <ul>
              <li>{isDa ? 'Registrerede: den Dataansvarliges medarbejdere, leads og kunder' : 'Data subjects: the Controller\'s employees, leads, and customers'}</li>
              <li>{isDa ? 'Oplysningstyper: navn, email, telefon, virksomhedsoplysninger, CRM-noter, fakturadata' : 'Data types: name, email, phone, company details, CRM notes, invoice data'}</li>
            </ul>
          </section>

          <section>
            <h2>{isDa ? '4. Databehandlerens forpligtelser' : '4. Processor Obligations'}</h2>
            <ul>
              <li>{isDa ? 'Behandler kun personoplysninger efter dokumenteret instruks fra den Dataansvarlige' : 'Processes personal data only on documented instructions from the Controller'}</li>
              <li>{isDa ? 'Sikrer, at personer med adgang til oplysningerne er underlagt tavshedspligt' : 'Ensures persons authorized to process the data are subject to confidentiality'}</li>
              <li>{isDa ? 'Implementerer passende tekniske og organisatoriske sikkerhedsforanstaltninger (jf. GDPR art. 32)' : 'Implements appropriate technical and organizational security measures (per GDPR Art. 32)'}</li>
              <li>{isDa ? 'Bistår den Dataansvarlige med at opfylde registreredes rettigheder og med konsekvensanalyser, hvor relevant' : 'Assists the Controller in fulfilling data subject rights requests and with impact assessments where relevant'}</li>
              <li>{isDa ? 'Underretter den Dataansvarlige uden unødig forsinkelse ved brud på persondatasikkerheden' : 'Notifies the Controller without undue delay in the event of a personal data breach'}</li>
              <li>{isDa ? 'Sletter eller returnerer alle personoplysninger ved aftalens ophør, jf. afsnit 6' : 'Deletes or returns all personal data upon termination of the agreement, per Section 6'}</li>
            </ul>
          </section>

          <section>
            <h2>{isDa ? '5. Underdatabehandlere' : '5. Sub-processors'}</h2>
            <p>
              {isDa
                ? 'Den Dataansvarlige giver hermed generel tilladelse til, at Databehandleren anvender underdatabehandlere til drift af platformen, herunder hosting- og infrastrukturudbydere (f.eks. Supabase) og eventuelle regnskabsudbydere (Dinero/Visma, e-conomic), som den Dataansvarlige selv aktivt vælger at forbinde. Alle underdatabehandlere er underlagt tilsvarende databeskyttelsesforpligtelser.'
                : 'The Controller hereby grants general authorization for the Processor to engage sub-processors to operate the platform, including hosting/infrastructure providers (e.g. Supabase) and any accounting providers (Dinero/Visma, e-conomic) the Controller itself actively chooses to connect. All sub-processors are bound by equivalent data protection obligations.'}
            </p>
          </section>

          <section>
            <h2>{isDa ? '6. Sletning og returnering ved ophør' : '6. Deletion and Return upon Termination'}</h2>
            <p>
              {isDa
                ? 'Ved kontoopsigelse har den Dataansvarlige 30 dage til at eksportere sine data. Herefter slettes personoplysninger permanent, bortset fra data Databehandleren er retligt forpligtet til at opbevare (f.eks. bogføringsdata i 5 år, jf. bogføringsloven).'
                : 'Upon account termination, the Controller has 30 days to export their data. Personal data is then permanently deleted, except where the Processor is legally required to retain it (e.g. accounting data for 5 years under the Danish Bookkeeping Act).'}
            </p>
          </section>

          <section>
            <h2>{isDa ? '7. Revision' : '7. Audit'}</h2>
            <p>
              {isDa
                ? 'Databehandleren stiller efter rimelig forudgående anmodning oplysninger til rådighed, der er nødvendige for at dokumentere overholdelse af denne aftale.'
                : 'Upon reasonable prior request, the Processor makes available information necessary to demonstrate compliance with this agreement.'}
            </p>
          </section>

          <section>
            <h2>{isDa ? '8. Kontakt' : '8. Contact'}</h2>
            <p>
              {isDa
                ? 'Spørgsmål til denne databehandleraftale kan rettes til Aiagencydanmark@gmail.com.'
                : 'Questions about this Data Processing Agreement can be directed to Aiagencydanmark@gmail.com.'}
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
