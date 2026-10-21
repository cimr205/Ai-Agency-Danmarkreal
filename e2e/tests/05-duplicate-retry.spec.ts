import { test, expect } from "@playwright/test";
import { loadTenants, signIn, callOperatingManager } from "../support/testProject.ts";

/**
 * Duplicate-execution protection and retry.
 */
test.describe("idempotency & retry", () => {
  test("re-proposing with the same idempotency key does not create a duplicate", async () => {
    const { password, tenants } = loadTenants();
    const owner = tenants.a.users.find((u) => u.role === "owner")!;
    const jwt = await signIn(owner.email, password);
    const key = `e2e-dup-${Date.now()}`;

    const first = await callOperatingManager(jwt, {
      operation: "propose", actionName: "tasks.create", input: { title: "dup" }, idempotencyKey: key,
    });
    const second = await callOperatingManager(jwt, {
      operation: "propose", actionName: "tasks.create", input: { title: "dup" }, idempotencyKey: key,
    });
    // Same idempotency key → same action id (no duplicate row).
    expect(second.json.action.id).toBe(first.json.action.id);
  });

  test("approving an already-completed action returns idempotentReplay (no double execution)", async () => {
    const { password, tenants } = loadTenants();
    const owner = tenants.a.users.find((u) => u.role === "owner")!;
    const jwt = await signIn(owner.email, password);

    const proposed = await callOperatingManager(jwt, {
      operation: "propose", actionName: "tasks.create", input: { title: "once" }, idempotencyKey: `e2e-once-${Date.now()}`,
    });
    const actionId = proposed.json.action.id;

    const a1 = await callOperatingManager(jwt, { operation: "approve", actionId });
    expect(a1.json.action.status).toBe("completed");

    const a2 = await callOperatingManager(jwt, { operation: "approve", actionId });
    expect(a2.json.idempotentReplay).toBe(true); // second approve is a safe replay
  });
});
