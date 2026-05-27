import { Mastra } from "@mastra/core";
import { shiftAgent } from "./agents/shift-agent";

export const mastra = new Mastra({
  agents: { shiftAgent }
});
