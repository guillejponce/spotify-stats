import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { isSupabaseConfigured, supabaseMissingMessage } from "@/lib/agent/env";
import { buildAgentSystemPrompt } from "@/lib/agent/prompt";
import { AGENT_TOOLS, TOOL_LABELS, executeAgentTool } from "@/lib/agent/tools";

export type AgentChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type AgentStreamEvent =
  | { type: "text"; delta: string }
  | { type: "tool"; name: string; label: string }
  | { type: "error"; message: string };

const MODEL = process.env.OPENAI_MODEL?.trim() || "gpt-4o";
const MAX_ROUNDS = 8;
const MAX_HISTORY = 24;

function getClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("MISSING_OPENAI_KEY");
  }
  return new OpenAI({ apiKey });
}

export function normalizeHistory(input: unknown): AgentChatMessage[] {
  if (!Array.isArray(input)) return [];
  const out: AgentChatMessage[] = [];
  for (const row of input) {
    if (!row || typeof row !== "object") continue;
    const role = (row as { role?: unknown }).role;
    const content = (row as { content?: unknown }).content;
    if (role !== "user" && role !== "assistant") continue;
    if (typeof content !== "string") continue;
    const trimmed = content.trim();
    if (!trimmed) continue;
    out.push({ role, content: trimmed.slice(0, 8000) });
  }
  return out.slice(-MAX_HISTORY);
}

export async function runAgent(
  history: AgentChatMessage[],
  onEvent: (event: AgentStreamEvent) => void,
): Promise<void> {
  const openai = getClient();
  const setupNote = isSupabaseConfigured()
    ? ""
    : `\n\nSETUP: ${supabaseMissingMessage()} No inventes stats. Dile esto con claridad.`;
  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: buildAgentSystemPrompt() + setupNote },
    ...history.map((m) => ({ role: m.role, content: m.content })),
  ];

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const stream = await openai.chat.completions.create({
      model: MODEL,
      messages,
      tools: AGENT_TOOLS,
      stream: true,
      temperature: 0.85,
    });

    let content = "";
    const toolAcc: Record<
      number,
      { id: string; name: string; args: string }
    > = {};

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;
      if (!delta) continue;
      if (delta.content) {
        content += delta.content;
        onEvent({ type: "text", delta: delta.content });
      }
      if (delta.tool_calls) {
        for (const tc of delta.tool_calls) {
          const idx = tc.index ?? 0;
          if (!toolAcc[idx]) toolAcc[idx] = { id: "", name: "", args: "" };
          if (tc.id) toolAcc[idx].id = tc.id;
          if (tc.function?.name) toolAcc[idx].name += tc.function.name;
          if (tc.function?.arguments) {
            toolAcc[idx].args += tc.function.arguments;
          }
        }
      }
    }

    const calls = Object.values(toolAcc).filter((c) => c.name);
    if (calls.length === 0) {
      if (!content.trim()) {
        onEvent({
          type: "text",
          delta: "Se me trabó el cerebro. Prueba de nuevo.",
        });
      }
      return;
    }

    messages.push({
      role: "assistant",
      content: content || null,
      tool_calls: calls.map((c) => ({
        id: c.id,
        type: "function" as const,
        function: { name: c.name, arguments: c.args || "{}" },
      })),
    });

    for (const call of calls) {
      onEvent({
        type: "tool",
        name: call.name,
        label: TOOL_LABELS[call.name] ?? `Usando ${call.name}…`,
      });
      let parsed: unknown = {};
      try {
        parsed = JSON.parse(call.args || "{}");
      } catch {
        parsed = {};
      }
      const result = await executeAgentTool(call.name, parsed);
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: result.slice(0, 12_000),
      });
    }
  }

  onEvent({
    type: "text",
    delta: "\n\nMe mareé con tantas consultas. Pregúntame de nuevo, más concreto.",
  });
}
