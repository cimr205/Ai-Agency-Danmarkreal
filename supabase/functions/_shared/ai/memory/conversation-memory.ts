// deno-lint-ignore-file no-explicit-any
import { aiConfig } from "../config/ai.config.ts";

export interface MemoryMessage { role: "user" | "assistant"; content: string }

/**
 * Never replays the whole conversation into the prompt — only the last
 * N messages (default 6, §S) plus a compact summary field the caller can
 * optionally keep updated. Keeps prompts short and latency low.
 */
export async function loadRecentMessages(db: any, conversationId: string, workspaceId: string): Promise<MemoryMessage[]> {
  const { data, error } = await db
    .from("ai_messages")
    .select("role, content")
    .eq("conversation_id", conversationId)
    .eq("company_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(aiConfig.maxMemoryMessages);
  if (error || !data) return [];
  return (data as MemoryMessage[]).reverse();
}

export async function appendMessage(db: any, conversationId: string, workspaceId: string, userId: string, role: "user" | "assistant", content: string): Promise<void> {
  await db.from("ai_messages").insert({ conversation_id: conversationId, company_id: workspaceId, user_id: userId, role, content });
}

export async function getOrCreateConversation(db: any, workspaceId: string, userId: string, conversationId?: string): Promise<string> {
  if (conversationId) {
    const { data } = await db.from("ai_conversations").select("id").eq("id", conversationId).eq("company_id", workspaceId).maybeSingle();
    if (data) return data.id;
  }
  const { data, error } = await db.from("ai_conversations").insert({ company_id: workspaceId, user_id: userId }).select("id").single();
  if (error) throw new Error(error.message);
  return data.id;
}
