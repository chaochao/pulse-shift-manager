import { Mastra } from "@mastra/core";
import { chatAgent } from "./agents/chat-agent";
import { shiftAgent } from "./agents/shift-agent";

export const mastra = new Mastra({
  agents: { chatAgent, shiftAgent }
});
