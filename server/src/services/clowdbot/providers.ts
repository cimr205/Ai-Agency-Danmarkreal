export type LeadCandidate = {
  name: string;
  email?: string;
  phone?: string;
  company?: string;
  website?: string;
  title?: string;
  location?: string;
  source: string;
  sourceId?: string;
  raw?: Record<string, unknown>;
};

export type SearchCriteria = {
  keywords?: string[];
  industries?: string[];
  countries?: string[];
  locations?: string[];
  companySize?: string;
  roles?: string[];
};

type ProviderConfig = {
  apiKey?: string;
  accessToken?: string;
  refreshToken?: string;
  instanceUrl?: string;
  additional?: Record<string, string>;
};

function buildQuery(criteria: SearchCriteria) {
  const parts = [
    ...(criteria.keywords || []),
    ...(criteria.industries || []),
    ...(criteria.locations || []),
    ...(criteria.countries || []),
  ];
  return parts.filter(Boolean).join(' ');
}

export async function fetchFromGooglePlaces(criteria: SearchCriteria, config: ProviderConfig) {
  if (!config.apiKey) return [];
  const query = buildQuery(criteria);
  if (!query) return [];
  const url = new URL('https://maps.googleapis.com/maps/api/place/textsearch/json');
  url.searchParams.set('query', query);
  url.searchParams.set('key', config.apiKey);
  const response = await fetch(url.toString());
  if (!response.ok) return [];
  const data = (await response.json()) as { results?: Array<Record<string, unknown>> };
  return (
    data.results?.map((item) => ({
      name: String(item.name || ''),
      company: String(item.name || ''),
      website: item.website ? String(item.website) : undefined,
      location: item.formatted_address ? String(item.formatted_address) : undefined,
      source: 'google_places',
      sourceId: item.place_id ? String(item.place_id) : undefined,
      raw: item,
    })) || []
  );
}

export async function fetchFromApollo(criteria: SearchCriteria, config: ProviderConfig) {
  if (!config.apiKey) return [];
  const endpoint = config.additional?.endpoint || 'https://api.apollo.io/v1/mixed_people/search';
  const payload = {
    api_key: config.apiKey,
    q: buildQuery(criteria),
    page: 1,
    per_page: 25,
  };
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) return [];
  const data = (await response.json()) as { people?: Array<Record<string, unknown>> };
  return (
    data.people?.map((person) => {
      const record = person as Record<string, unknown>;
      const organization = record.organization as Record<string, unknown> | undefined;
      return {
        name: String((record.name as string | undefined) || (record.first_name as string | undefined) || ''),
        email: record.email ? String(record.email) : undefined,
        phone: record.phone_number ? String(record.phone_number) : undefined,
        company: organization?.name ? String(organization.name) : undefined,
        title: record.title ? String(record.title) : undefined,
        source: 'apollo',
        sourceId: record.id ? String(record.id) : undefined,
        raw: person,
      };
    }) || []
  );
}

export async function fetchFromHubSpot(config: ProviderConfig) {
  if (!config.accessToken) return [];
  const endpoint =
    config.additional?.endpoint || 'https://api.hubapi.com/crm/v3/objects/contacts?limit=50';
  const response = await fetch(endpoint, {
    headers: { Authorization: `Bearer ${config.accessToken}` },
  });
  if (!response.ok) return [];
  const data = (await response.json()) as { results?: Array<Record<string, unknown>> };
  return (
    data.results?.map((contact) => {
      const record = contact as { id?: string; properties?: Record<string, unknown> };
      return {
        name: String(
          (record.properties?.firstname as string | undefined) ||
            (record.properties?.lastname as string | undefined) ||
            ''
        ),
        email: record.properties?.email ? String(record.properties.email) : undefined,
        phone: record.properties?.phone ? String(record.properties.phone) : undefined,
        company: record.properties?.company ? String(record.properties.company) : undefined,
        source: 'hubspot',
        sourceId: record.id ? String(record.id) : undefined,
        raw: contact,
      };
    }) || []
  );
}

export async function fetchFromSalesforce(config: ProviderConfig) {
  if (!config.accessToken || !config.instanceUrl) return [];
  const query =
    config.additional?.soql ||
    'SELECT Id, Name, Company, Email, Phone, Title FROM Lead ORDER BY CreatedDate DESC LIMIT 50';
  const url = new URL(`${config.instanceUrl}/services/data/v57.0/query`);
  url.searchParams.set('q', query);
  const response = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${config.accessToken}` },
  });
  if (!response.ok) return [];
  const data = (await response.json()) as { records?: Array<Record<string, unknown>> };
  return (
    data.records?.map((record) => {
      const row = record as Record<string, unknown>;
      return {
        name: String(row.Name || ''),
        email: row.Email ? String(row.Email) : undefined,
        phone: row.Phone ? String(row.Phone) : undefined,
        company: row.Company ? String(row.Company) : undefined,
        title: row.Title ? String(row.Title) : undefined,
        source: 'salesforce',
        sourceId: row.Id ? String(row.Id) : undefined,
        raw: record,
      };
    }) || []
  );
}

export async function enrichWithHunter(domain: string, config: ProviderConfig) {
  if (!config.apiKey) return null;
  const url = new URL('https://api.hunter.io/v2/domain-search');
  url.searchParams.set('domain', domain);
  url.searchParams.set('api_key', config.apiKey);
  const response = await fetch(url.toString());
  if (!response.ok) return null;
  return (await response.json()) as Record<string, unknown>;
}

export async function enrichWithClearbit(domain: string, config: ProviderConfig) {
  if (!config.apiKey) return null;
  const url = new URL('https://company.clearbit.com/v2/companies/find');
  url.searchParams.set('domain', domain);
  const response = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${config.apiKey}` },
  });
  if (!response.ok) return null;
  return (await response.json()) as Record<string, unknown>;
}

