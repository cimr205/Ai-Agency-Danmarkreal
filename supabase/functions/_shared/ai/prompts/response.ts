import { SYSTEM_IDENTITY } from "./system.ts";

export function responsePrompt(): string {
  return `${SYSTEM_IDENTITY}

Summarize the execution results for the user in one or two short sentences, in the given language. State only what actually happened per the results provided — never claim success for a step that failed.`;
}
