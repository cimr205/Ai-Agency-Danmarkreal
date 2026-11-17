// Writes growth-os/skills/custom/<id>/SKILL.md, growth-os/registry/manifest.json and
// growth-os/skills/external/MANIFEST.md from the code registry (single source of truth).
// --check fails when the committed files differ from what the registry produces.
// deno run --node-modules-dir=none --allow-read --allow-write=growth-os scripts/growth-os/generate-skill-docs.ts [--check]
import { AGENT_PROFILES, EXTERNAL_SKILLS, SKILLS } from "../../supabase/functions/_shared/growth-os/registry/index.ts";
import type { SkillDef } from "../../supabase/functions/_shared/growth-os/types.ts";

const check = Deno.args.includes("--check");
const files = new Map<string, string>();

const list = (xs: string[]) => xs.map((x) => `- ${x}`).join("\n");
function skillMd(s: SkillDef): string {
  return `---
name: ${s.id}
description: ${s.purpose.replace(/\n/g, " ")}
version: ${s.version}
status: ${s.status}
agent: ${s.agentId}
max_level: ${s.maxLevel}
maintainer: ${s.maintainer}
---

# ${s.id} (v${s.version}, ${s.status})

> Generated from \`supabase/functions/_shared/growth-os/registry/skills.ts\`. Edit the registry, then run \`scripts/growth-os/generate-skill-docs.ts\`.${s.status === "draft" ? "\n>\n> **Draft contract:** the interface is fixed, but there is no executor. The planner refuses to schedule it." : ""}

## Purpose
${s.purpose}

## When it may be activated
${s.activation}

## Input contract
${list(s.inputs)}

## Data requirements
${list(s.dataRequirements)}

## Allowed tools
${list(s.tools)}

## Procedure
${s.procedure.map((p, i) => `${i + 1}. ${p}`).join("\n")}

## Output contract
${list(s.outputs)}

## Test method
${s.testMethod}

## Failure handling
${s.failureHandling}

## Security limits
${list(s.securityLimits)}

## Escalation
${s.escalation}

## Version and maintainer
${s.version} · ${s.maintainer} · highest action level L${s.maxLevel}
`;
}

for (const s of SKILLS) files.set(`growth-os/skills/custom/${s.id}/SKILL.md`, skillMd(s));

files.set("growth-os/registry/manifest.json", JSON.stringify({
  generated_from: "supabase/functions/_shared/growth-os/registry",
  agents: AGENT_PROFILES.map((p) => ({
    agent_id: p.id, kind: p.kind, department: p.department, reports_to: p.reportsTo, status: p.status, verifier_id: p.verifierId ?? null,
    skills: p.projectSkills.map((id) => { const s = SKILLS.find((x) => x.id === id)!; return { skill_id: id, version: s.version, status: s.status, max_level: s.maxLevel }; }),
    external_skills: p.externalSkills,
    max_autonomous_level: p.maxAutonomousLevel,
    allowed_actions: p.approvalRequirements,
  })),
}, null, 2) + "\n");

files.set("growth-os/skills/external/MANIFEST.md", `# External skill manifest

Generated from \`supabase/functions/_shared/growth-os/registry/external-skills.ts\`. Verified ${EXTERNAL_SKILLS[0].verifiedAt}: each repo exists. Agent-skill repos were fetched at the pinned commit into an isolated directory, and the SKILL.md files and scripts were read and scanned for network calls, shell execution and instructions aimed at the agent. Nothing is installed or executed by agents.

| id | repo @ commit | licence | status | used for | findings |
|---|---|---|---|---|---|
${EXTERNAL_SKILLS.map((e) => `| ${e.id} | [${e.repo}](https://github.com/${e.repo}/tree/${e.commit}) @ \`${e.commit.slice(0, 12)}\` (${e.path}) | ${e.license} | **${e.status}** | ${e.usedFor} | ${e.findings.join("<br>") || "–"} |`).join("\n")}
`);

let drift = 0;
for (const [path, content] of files) {
  if (check) {
    let cur = "";
    try { cur = await Deno.readTextFile(path); } catch { /* missing */ }
    if (cur !== content) { console.error(`out of date: ${path}`); drift++; }
  } else {
    await Deno.mkdir(path.slice(0, path.lastIndexOf("/")), { recursive: true });
    await Deno.writeTextFile(path, content);
  }
}
if (check && drift) Deno.exit(1);
console.log(`${check ? "checked" : "wrote"} ${files.size} files`);
