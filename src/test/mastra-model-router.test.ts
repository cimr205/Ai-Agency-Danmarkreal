import { describe, it, expect } from "vitest";
import {
  resolveModel,
  resolveModelForTask,
  configuredSlots,
  type Complexity,
} from "@/mastra/model-router";

const LOCAL = {
  MASTRA_ENABLE_LOCAL_SMALL: "1",
  LOCAL_LLM_BASE_URL: "http://localhost:11434/v1",
  LOCAL_LLM_MODEL: "qwen3.5:2b",
  LOCAL_LLM_API_KEY: "ollama",
};
const STANDARD = {
  MASTRA_STANDARD_LLM_BASE_URL: "http://localhost:11434/v1",
  MASTRA_STANDARD_LLM_MODEL: "qwen2.5:14b",
};
const ADVANCED = {
  MASTRA_ADVANCED_LLM_BASE_URL: "https://gateway.example/v1",
  MASTRA_ADVANCED_LLM_MODEL: "big-70b",
  MASTRA_ADVANCED_LLM_API_KEY: "k",
};

describe("configuredSlots", () => {
  it("does NOT register the local small model unless the flag is set", () => {
    const withoutFlag = configuredSlots({ ...LOCAL, MASTRA_ENABLE_LOCAL_SMALL: undefined });
    expect(withoutFlag).toHaveLength(0);
    const withFlag = configuredSlots(LOCAL);
    expect(withFlag.map((s) => s.modelClass)).toEqual(["small"]);
  });

  it("local small defaults to reasoning_effort 'none' (Qwen thinking off)", () => {
    expect(configuredSlots(LOCAL)[0].reasoningEffort).toBe("none");
  });
});

describe("resolveModel — diagnostic", () => {
  it("falls back to a deterministic mock when nothing is configured (always works)", () => {
    const r = resolveModel("diagnostic", {});
    expect(r.status).toBe("ok");
    if (r.status === "ok") {
      expect(r.source).toBe("mock");
      expect(r.modelId).toBe("mock");
    }
  });

  it("uses the local small model when enabled", () => {
    const r = resolveModel("diagnostic", LOCAL);
    expect(r.status).toBe("ok");
    if (r.status === "ok") expect(r.modelId).toBe("qwen3.5:2b");
  });
});

describe("resolveModel — simple", () => {
  it("is BLOCKED when no model is configured (no silent mock for real work)", () => {
    const r = resolveModel("simple", {});
    expect(r.status).toBe("blocked");
  });

  it("uses the local small model when enabled", () => {
    const r = resolveModel("simple", LOCAL);
    expect(r.status).toBe("ok");
    if (r.status === "ok") {
      expect(r.modelClass).toBe("small");
      expect(r.modelId).toBe("qwen3.5:2b");
    }
  });

  it("prefers the cheapest eligible model (reserves the strong one for complex)", () => {
    const r = resolveModel("simple", { ...STANDARD, ...ADVANCED });
    expect(r.status).toBe("ok");
    if (r.status === "ok") expect(r.modelClass).toBe("standard");
  });
});

describe("resolveModel — complex (must never downgrade to 2B)", () => {
  it("is BLOCKED when only the local small (2B) is available", () => {
    const r = resolveModel("complex", LOCAL);
    expect(r.status).toBe("blocked");
    if (r.status === "blocked") expect(r.reason).toMatch(/2B/);
  });

  it("is BLOCKED when nothing is configured", () => {
    const r = resolveModel("complex", {});
    expect(r.status).toBe("blocked");
  });

  it("uses a standard model when configured", () => {
    const r = resolveModel("complex", STANDARD);
    expect(r.status).toBe("ok");
    if (r.status === "ok") expect(r.modelClass).toBe("standard");
  });

  it("prefers the advanced model over standard", () => {
    const r = resolveModel("complex", { ...STANDARD, ...ADVANCED });
    expect(r.status).toBe("ok");
    if (r.status === "ok") expect(r.modelClass).toBe("advanced");
  });

  it("does NOT use the local small even if enabled alongside nothing stronger", () => {
    const r = resolveModel("complex", { ...LOCAL });
    expect(r.status).toBe("blocked");
  });
});

describe("resolveModelForTask", () => {
  it("maps known simple tasks to simple and complex tasks to complex", () => {
    expect(resolveModelForTask("marketing.post.draft", LOCAL).status).toBe("ok");
    // complex task with only 2B → blocked
    const strat = resolveModelForTask("crm.deal.strategy", LOCAL);
    expect(strat.status).toBe("blocked");
  });

  it("treats unknown task kinds as complex (safe: won't silently use 2B)", () => {
    const r = resolveModelForTask("some.unknown.task", LOCAL);
    expect(r.status).toBe("blocked");
  });
});
