import { Agent } from "@mastra/core/agent";

export const chatAgent = new Agent({
  id: "chat-agent",
  name: "Chat Agent",
  instructions:
    "You are a helpful general-purpose assistant. Answer clearly and concisely, and ask a brief follow-up question only when the user's request is ambiguous.",
  model: "openai/gpt-5.4"
});
