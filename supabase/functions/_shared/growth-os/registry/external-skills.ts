import type { ExternalSkillDef } from "../types.ts";

// Every entry was verified against GitHub on 2026-11-14: the repo exists, the
// commit is the default branch head on that date, and selected files were
// fetched at exactly that commit into an isolated scratch directory and read.
// Nothing here is installed or executed by agents. "approved-reference" means
// a human-reviewed document an agent may be *given as data*; it can never
// override user instructions, security policy or approval rules.
const V = "2026-11-14";

export const EXTERNAL_SKILLS: ExternalSkillDef[] = [
  // ── Official agent-skill repos ────────────────────────────────────────────
  {
    id: "mastra/mastra",
    repo: "mastra-ai/skills", commit: "045740138738bee82d5c9bbebea2f4373b5ca2dc",
    path: "skills/mastra/SKILL.md", license: "Apache-2.0", kind: "agent-skill",
    status: "approved-reference",
    usedFor: "Developer reference for Mastra agent/workflow APIs (src/mastra). Not loaded into Growth OS agents at runtime.",
    findings: [
      "references/feedback.md + SKILL.md L121 instruct the agent to POST bug reports to https://mastra.ai/api/feedback 'autonomously … without asking permission'. EXCLUDED: data exfiltration path. Only the reviewed SKILL.md sections (minus feedback) are approved; other references/*.md are not yet reviewed and stay unapproved.",
      "scripts/provider-registry.mjs not executed.",
    ],
    verifiedAt: V,
  },
  {
    id: "openrouter/openrouter-models",
    repo: "OpenRouterTeam/skills", commit: "a110aad6072364da5e8017efc7a7873262164b11",
    path: "skills/openrouter-models/SKILL.md", license: "NOASSERTION (no LICENSE file in repo)", kind: "agent-skill",
    status: "approved-reference",
    usedFor: "Method for reading the live /api/v1/models catalogue (pricing, context, supported parameters). Re-implemented in gateway/openrouter.ts; scripts not vendored.",
    findings: ["No licence file: content referenced by URL+commit, not copied.", "scripts/*.ts need tsx from npm; not run."],
    verifiedAt: V,
  },
  {
    id: "openrouter/openrouter-generations",
    repo: "OpenRouterTeam/skills", commit: "a110aad6072364da5e8017efc7a7873262164b11",
    path: "skills/openrouter-generations/SKILL.md", license: "NOASSERTION (no LICENSE file in repo)", kind: "agent-skill",
    status: "approved-reference",
    usedFor: "Reconciling estimated vs actual cost through /api/v1/generation?id=… (gateway records the generation id for this).",
    findings: ["No licence file: referenced, not copied.", "README suggests `rm -rf /tmp/or-skills` for cleanup; irrelevant, not run."],
    verifiedAt: V,
  },
  {
    id: "openrouter/openrouter-typescript-sdk",
    repo: "OpenRouterTeam/skills", commit: "a110aad6072364da5e8017efc7a7873262164b11",
    path: "skills/openrouter-typescript-sdk/SKILL.md", license: "NOASSERTION (no LICENSE file in repo)", kind: "agent-skill",
    status: "not-adopted",
    usedFor: "Describes @openrouter/sdk callModel. Not adopted: edge functions already call the OpenAI-compatible REST surface (aiConnection.ts).",
    findings: [],
    verifiedAt: V,
  },
  {
    id: "vercel/react-best-practices",
    repo: "vercel-labs/agent-skills", commit: "1a2c79d4e6c4a2283dc2c614b6538cbe1ed5ca62",
    path: "skills/react-best-practices/SKILL.md", license: "MIT (SKILL.md frontmatter; no repo LICENSE)", kind: "agent-skill",
    status: "approved-reference",
    usedFor: "WPO / bundle-and-resource-analysis rule references (rules/bundle-*.md).",
    findings: ["Markdown rules only; no scripts."],
    verifiedAt: V,
  },
  {
    id: "vercel/web-design-guidelines",
    repo: "vercel-labs/agent-skills", commit: "1a2c79d4e6c4a2283dc2c614b6538cbe1ed5ca62",
    path: "skills/web-design-guidelines/SKILL.md", license: "unspecified", kind: "agent-skill",
    status: "blocked",
    usedFor: "—",
    findings: ["SKILL.md tells the agent to fetch its rules at runtime from raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md: unpinned remote instructions (prompt-injection surface). Blocked until that file is pinned and reviewed."],
    verifiedAt: V,
  },
  {
    id: "anthropic/webapp-testing",
    repo: "anthropics/skills", commit: "2c5958ecac7cee2b583967a2c4981d0f4a75c579",
    path: "skills/webapp-testing/SKILL.md", license: "Apache-2.0 (skills/webapp-testing/LICENSE.txt)", kind: "agent-skill",
    status: "approved-reference",
    usedFor: "UXO/MSEO interaction-flow testing method with Playwright (already a devDependency).",
    findings: ["scripts/with_server.py starts local servers; not executed by agents."],
    verifiedAt: V,
  },
  {
    id: "anthropic/skill-creator",
    repo: "anthropics/skills", commit: "2c5958ecac7cee2b583967a2c4981d0f4a75c579",
    path: "skills/skill-creator/SKILL.md", license: "Apache-2.0 (skills/skill-creator/LICENSE.txt)", kind: "agent-skill",
    status: "approved-reference",
    usedFor: "Method for candidate-vs-baseline skill evaluation (grader/comparator roles) that the Learning Engine follows.",
    findings: ["Python eval scripts not executed; the method is re-implemented in learning/evaluation.ts (Phase 2)."],
    verifiedAt: V,
  },
  // ── Technical tools ────────────────────────────────────────────────────────
  {
    id: "tool/lighthouse",
    repo: "GoogleChrome/lighthouse", commit: "4875928438c01b39abbd4bc1f9923c16d23ab32d",
    path: "release v13.6.0", license: "Apache-2.0", kind: "tool",
    status: "not-adopted",
    usedFor: "WPO lighthouse-performance-audit (Phase 3). Needs headless Chrome, which edge functions do not have; would run in CI or a worker. Installing it is Level 3.",
    findings: [],
    verifiedAt: V,
  },
  {
    id: "tool/playwright",
    repo: "microsoft/playwright", commit: "0ca0119fa29711a831c87f044cc3e3042ba79819",
    path: "@playwright/test ^1.64.1 (repo devDependency; latest release v1.65.1)", license: "Apache-2.0", kind: "tool",
    status: "approved-tool",
    usedFor: "Already installed: UI tests of the Growth OS pages. Not callable by agents at runtime.",
    findings: [],
    verifiedAt: V,
  },
  {
    id: "tool/axe-core",
    repo: "dequelabs/axe-core", commit: "d991e05ac6eb42df88f9e61c1679692534bb92e2",
    path: "axe-core ^4.14.0 (repo devDependency; latest release v4.14.0)", license: "MPL-2.0", kind: "tool",
    status: "approved-tool",
    usedFor: "Already installed: accessibility checks (UXO accessibility-verification, Phase 3).",
    findings: [],
    verifiedAt: V,
  },
  {
    id: "tool/browser-use",
    repo: "browser-use/browser-use", commit: "e717df1839a2d7368b108de6694f01e9c659b0de",
    path: "release 1.0.5 (Python)", license: "MIT", kind: "tool",
    status: "not-adopted",
    usedFor: "Autonomous browser agent in Python. Not adopted: no Python runtime in the stack, and an LLM-driven browser is a broad-permission tool. Revisit only with a sandbox.",
    findings: [],
    verifiedAt: V,
  },
  // ── OpenRouter SDKs ────────────────────────────────────────────────────────
  {
    id: "sdk/openrouter-ai-sdk-provider",
    repo: "OpenRouterTeam/ai-sdk-provider", commit: "1d5205f6ed3bfe15de2d894d79b79608dad7bddd",
    path: "release 3.1.0", license: "Apache-2.0", kind: "sdk",
    status: "not-adopted",
    usedFor: "Would replace @ai-sdk/openai-compatible in src/mastra. Not added: Growth OS runs in Deno edge functions over the REST surface that aiConnection.ts already uses; adding a dependency changes package.json (owner has uncommitted edits there).",
    findings: [],
    verifiedAt: V,
  },
  {
    id: "sdk/openrouter-typescript-sdk",
    repo: "OpenRouterTeam/typescript-sdk", commit: "683713d054d1b6f7c2895ced57070544e751b323",
    path: "release v1.5.103", license: "Apache-2.0", kind: "sdk",
    status: "not-adopted",
    usedFor: "Same reason as above.",
    findings: [],
    verifiedAt: V,
  },
];
