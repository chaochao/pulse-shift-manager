import "dotenv/config";

import cors from "cors";
import express from "express";
import { z } from "zod";
import { chatAgent } from "../mastra/agents/chat-agent";

const app = express();
const port = Number(process.env.PORT ?? 3001);

const chatRequestSchema = z.object({
  message: z.string().min(1),
  threadId: z.string().uuid()
});

app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

/**
 * Prints a small timestamped server log.
 *
 * This learning project keeps logging simple so you can see when the route is
 * called, when streaming starts, and where failures happen.
 */
function logServer(message: string, details?: unknown) {
  const timestamp = new Date().toISOString();
  if (details) {
    console.log(`[${timestamp}] ${message}`, details);
    return;
  }

  console.log(`[${timestamp}] ${message}`);
}

/**
 * Converts one named event into an SSE frame.
 *
 * SSE is plain text: every frame has an event name, JSON data, and a blank
 * line that tells the browser/client the event is complete.
 */
function writeSseEvent(
  res: express.Response,
  event: "delta" | "done" | "error",
  data: unknown
) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

/**
 * Starts an SSE response and disables buffering/caching for the stream.
 *
 * These headers tell the client to keep the HTTP connection open and process
 * each chunk as it arrives instead of waiting for the full response.
 */
function prepareSseResponse(res: express.Response) {
  res.status(200);
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();
}

/**
 * Validates the incoming chat payload before any streaming headers are sent.
 *
 * Keeping validation before `prepareSseResponse` lets bad requests return a
 * normal JSON 400 response instead of a partially opened SSE stream.
 */
function parseChatRequest(body: unknown): { message: string; threadId: string } {
  const parsed = chatRequestSchema.parse(body);
  return { message: parsed.message.trim(), threadId: parsed.threadId };
}

/**
 * Streams text deltas from the Mastra agent into the active SSE response.
 *
 * Mastra exposes `textStream` as an async iterable, so the backend can forward
 * each model text chunk to the browser immediately.
 */
async function streamAgentResponse(
  message: string,
  threadId: string,
  res: express.Response,
  abortSignal: AbortSignal
) {
  const stream = await chatAgent.stream(
    [{ role: "user", content: message }],
    {
      memory: { thread: threadId, resource: "local-user", options: { lastMessages: 20 } },
      abortSignal
    }
  );
  let chunkCount = 0;

  for await (const text of stream.textStream) {
    chunkCount += 1;
    writeSseEvent(res, "delta", { text });
  }

  logServer("Finished streaming agent response.", { chunkCount });
  writeSseEvent(res, "done", {});
}

app.post("/api/chat", async (req, res) => {
  let streamStarted = false;
  let streamFinished = false;
  const abortController = new AbortController();

  /**
   * Stops the model request if the browser closes the tab or refreshes while
   * the assistant is still generating.
   */
  res.on("close", () => {
    if (streamStarted && !streamFinished) {
      logServer("Client disconnected before stream finished.");
      abortController.abort();
    }
  });

  try {
    logServer("Received chat request.");
    const { message, threadId } = parseChatRequest(req.body);

    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY is missing. Add it to .env and restart the dev server.");
    }

    prepareSseResponse(res);
    streamStarted = true;
    logServer("Started SSE stream.", { threadId });

    await streamAgentResponse(message, threadId, res, abortController.signal);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown chat error";
    logServer("Chat request failed.", { message });

    if (streamStarted) {
      writeSseEvent(res, "error", { message });
    } else {
      res.status(400).json({ error: message });
      return;
    }
  } finally {
    streamFinished = true;
    res.end();
  }
});

app.listen(port, () => {
  console.log(`API server listening on http://localhost:${port}`);
});
