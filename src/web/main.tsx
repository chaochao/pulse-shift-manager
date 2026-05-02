import React, { FormEvent, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

type ChatRole = "user" | "assistant";

type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
};

type SseEvent = {
  event: string;
  data: unknown;
};

const initialMessages: ChatMessage[] = [
  {
    id: crypto.randomUUID(),
    role: "assistant",
    content: "Ask me anything. I will stream the answer back from a Mastra agent."
  }
];

/**
 * Reads one SSE frame and converts it into a small JavaScript object.
 *
 * This parser supports the simple event/data frames emitted by our backend.
 * It intentionally keeps the format visible for learning the SSE protocol.
 */
function parseSseFrame(frame: string): SseEvent | null {
  const eventLine = frame
    .split("\n")
    .find((line) => line.startsWith("event:"));
  const dataLine = frame
    .split("\n")
    .find((line) => line.startsWith("data:"));

  if (!eventLine || !dataLine) {
    return null;
  }

  return {
    event: eventLine.replace("event:", "").trim(),
    data: JSON.parse(dataLine.replace("data:", "").trim())
  };
}

/**
 * Splits accumulated response text into complete SSE frames.
 *
 * Network chunks do not always align with SSE frame boundaries, so this keeps
 * the unfinished tail in `buffer` and returns only complete frames.
 */
function extractSseFrames(buffer: string) {
  const parts = buffer.split("\n\n");
  const remainder = parts.pop() ?? "";
  return { frames: parts, remainder };
}

/**
 * Appends streamed assistant text to the placeholder assistant message.
 *
 * The assistant message is created before the request starts, then each delta
 * mutates only that one message so the UI feels like ChatGPT-style streaming.
 */
function appendToMessage(
  messages: ChatMessage[],
  messageId: string,
  text: string
) {
  return messages.map((message) =>
    message.id === messageId
      ? { ...message, content: message.content + text }
      : message
  );
}

function App() {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const apiMessages = useMemo(
    () =>
      messages
        .filter((message) => message.content.trim() !== "")
        .map(({ role, content }) => ({ role, content })),
    [messages]
  );

  /**
   * Sends the current conversation to the API and consumes the SSE response.
   *
   * `fetch` is used instead of `EventSource` because this chat flow needs POST
   * body data. The response still uses SSE frames for simple streaming.
   */
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const prompt = input.trim();
    if (prompt === "" || isStreaming) {
      return;
    }

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: prompt
    };
    const assistantMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: ""
    };
    const nextMessages = [...messages, userMessage, assistantMessage];

    setMessages(nextMessages);
    setInput("");
    setError(null);
    setIsStreaming(true);

    try {
      await streamChatResponse(
        [...apiMessages, { role: "user", content: prompt }],
        assistantMessage.id
      );
    } catch (streamError) {
      const message =
        streamError instanceof Error
          ? streamError.message
          : "The chat stream failed.";
      setError(message);
    } finally {
      setIsStreaming(false);
      inputRef.current?.focus();
    }
  }

  /**
   * Reads the backend response stream and applies each SSE event to React state.
   *
   * The `delta` event appends assistant text, `done` ends normally, and `error`
   * turns the server-side problem into a UI error.
   */
  async function streamChatResponse(
    requestMessages: Array<{ role: ChatRole; content: string }>,
    assistantMessageId: string
  ) {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: requestMessages })
    });

    if (!response.ok || !response.body) {
      const errorBody = await response.json().catch(() => null);
      throw new Error(errorBody?.error ?? "The chat API did not return a stream.");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const { frames, remainder } = extractSseFrames(buffer);
      buffer = remainder;

      for (const frame of frames) {
        const parsed = parseSseFrame(frame);
        if (!parsed) {
          continue;
        }

        if (parsed.event === "delta") {
          const { text } = parsed.data as { text: string };
          setMessages((currentMessages) =>
            appendToMessage(currentMessages, assistantMessageId, text)
          );
        }

        if (parsed.event === "error") {
          const { message } = parsed.data as { message: string };
          throw new Error(message);
        }
      }
    }
  }

  return (
    <main className="chat-shell">
      <section className="chat-panel" aria-label="Chat conversation">
        <header className="chat-header">
          <div>
            <h1>Mastra SSE Chat</h1>
            <p>POST a message, stream the agent response back as SSE.</p>
          </div>
          <span className={isStreaming ? "status live" : "status"} />
        </header>

        <div className="message-list">
          {messages.map((message) => (
            <article
              className={`message ${message.role}`}
              key={message.id}
              aria-label={`${message.role} message`}
            >
              <div className="message-role">{message.role}</div>
              <p>{message.content || "..."}</p>
            </article>
          ))}
        </div>

        {error && <div className="error-banner">{error}</div>}

        <form className="composer" onSubmit={handleSubmit}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Send a message"
            rows={2}
            disabled={isStreaming}
          />
          <button type="submit" disabled={isStreaming || input.trim() === ""}>
            Send
          </button>
        </form>
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
