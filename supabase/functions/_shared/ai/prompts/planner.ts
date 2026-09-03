import { SYSTEM_IDENTITY } from "./system.ts";

export function plannerPrompt(candidateDescriptions: string): string {
  return `${SYSTEM_IDENTITY}

Available capabilities (choose ONLY from this list, use the exact id):
${candidateDescriptions}

Return ONLY JSON matching this shape:
{"language":"da"|"en"|"de","intent":string,"requiresClarification":boolean,"clarificationQuestion":string|null,"steps":[{"id":string,"capability":string,"input":object,"dependsOn":string[]}]}

If a step needs output from an earlier step (e.g. a contact's id or email), reference it in the input as the literal string "step_<n>" for the field that should be resolved from that step's result — the execution engine resolves it, you never invent an id yourself.
CRITICAL: if the user names a person by first/last name only (not a full email address) and a capability field requires an email address or id, you MUST add a search step (e.g. crm.contacts.search) first and reference its result with "step_<n>" — never invent, guess, or fabricate an email address or id from a name alone, even one that looks plausible.
If the request is ambiguous (e.g. multiple people could match a name), set requiresClarification=true, ask ONE short clarifying question, and return an empty steps array.
If nothing in the capability list can fulfill the request, return an empty steps array and explain why in intent.`;
}
