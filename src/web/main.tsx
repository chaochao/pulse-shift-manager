import React, { FormEvent, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SquarePen, Send, X } from "lucide-react";
import "./styles.css";

const THREAD_ID_KEY = "chat_thread_id";

function getOrCreateThreadId(): string {
  const existing = localStorage.getItem(THREAD_ID_KEY);
  if (existing) return existing;
  const id = crypto.randomUUID();
  localStorage.setItem(THREAD_ID_KEY, id);
  return id;
}

type ChatRole = "user" | "assistant";

type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
};

type Thread = {
  id: string;
  title: string;
  createdAt: string;
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

function parseSseFrame(frame: string): SseEvent | null {
  const eventLine = frame.split("\n").find((line) => line.startsWith("event:"));
  const dataLine = frame.split("\n").find((line) => line.startsWith("data:"));
  if (!eventLine || !dataLine) return null;
  return {
    event: eventLine.replace("event:", "").trim(),
    data: JSON.parse(dataLine.replace("data:", "").trim())
  };
}

function extractSseFrames(buffer: string) {
  const parts = buffer.split("\n\n");
  const remainder = parts.pop() ?? "";
  return { frames: parts, remainder };
}

function formatRelativeTime(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "yesterday";
  return `${days}d ago`;
}

function appendToMessage(messages: ChatMessage[], messageId: string, text: string) {
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
  const [threadId, setThreadId] = useState<string>(getOrCreateThreadId);
  const [threads, setThreads] = useState<Thread[]>([]);

  function fetchThreads() {
    fetch("/api/threads")
      .then((r) => r.json())
      .then(({ threads: list }: { threads: Thread[] }) => setThreads(list))
      .catch(() => {});
  }

  function handleSelectThread(id: string) {
    if (id === threadId) return;
    localStorage.setItem(THREAD_ID_KEY, id);
    setThreadId(id);
    setMessages(initialMessages);
  }

  async function handleDeleteThread(id: string) {
    await fetch(`/api/threads/${id}`, { method: "DELETE" });
    if (id === threadId) {
      localStorage.removeItem(THREAD_ID_KEY);
      setThreadId(getOrCreateThreadId());
      setMessages(initialMessages);
    }
    fetchThreads();
  }

  useEffect(() => {
    fetchThreads();
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/threads/${threadId}`)
      .then((r) => r.json())
      .then(({ messages: history }: { messages: Array<{ role: ChatRole; content: string }> }) => {
        if (cancelled || history.length === 0) return;
        setMessages([
          ...initialMessages,
          ...history.map((m) => ({ id: crypto.randomUUID(), role: m.role, content: m.content }))
        ]);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [threadId]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const prompt = input.trim();
    if (prompt === "" || isStreaming) return;

    const userMessage: ChatMessage = { id: crypto.randomUUID(), role: "user", content: prompt };
    const assistantMessage: ChatMessage = { id: crypto.randomUUID(), role: "assistant", content: "" };

    setMessages([...messages, userMessage, assistantMessage]);
    setInput("");
    setError(null);
    setIsStreaming(true);

    try {
      await streamChatResponse(prompt, threadId, assistantMessage.id);
    } catch (streamError) {
      setError(streamError instanceof Error ? streamError.message : "The chat stream failed.");
    } finally {
      setIsStreaming(false);
      inputRef.current?.focus();
      fetchThreads();
    }
  }

  async function streamChatResponse(message: string, threadId: string, assistantMessageId: string) {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, threadId })
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
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const { frames, remainder } = extractSseFrames(buffer);
      buffer = remainder;

      for (const frame of frames) {
        const parsed = parseSseFrame(frame);
        if (!parsed) continue;

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
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-header">
          <Button
            variant="default"
            className="w-full h-12 text-sm font-medium"
            disabled={isStreaming}
            onClick={() => {
              localStorage.removeItem(THREAD_ID_KEY);
              setThreadId(getOrCreateThreadId());
              setMessages(initialMessages);
              fetchThreads();
            }}
          >
              <SquarePen size={15} strokeWidth={2} className="transition-transform duration-200 group-hover/button:-rotate-12" />
            New Chat
          </Button>
        </div>
        <ScrollArea className="flex-1">
          <div className="px-2 pb-4 pt-1">
            {threads.map((thread) => (
              <button
                key={thread.id}
                type="button"
                className={`thread-item${thread.id === threadId ? " active" : ""}`}
                onClick={() => handleSelectThread(thread.id)}
              >
                <span className="thread-title">{thread.title}</span>
                <span className="thread-time">{formatRelativeTime(thread.createdAt)}</span>
                <span
                  className="thread-delete"
                  role="button"
                  aria-label="Delete conversation"
                  onClick={(e) => { e.stopPropagation(); handleDeleteThread(thread.id); }}
                >
                  <X size={14} strokeWidth={2} />
                </span>
              </button>
            ))}
          </div>
        </ScrollArea>
      </aside>

      <main className="chat-panel" aria-label="Chat conversation">
        <header className="chat-header">
          <div>
            <h1>Mastra SSE Chat</h1>
            <p>POST a message, stream the agent response back as SSE.</p>
          </div>
          <span className={isStreaming ? "status live" : "status"} />
        </header>

        <ScrollArea className="flex-1 overflow-hidden">
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
        </ScrollArea>

        {error && <div className="error-banner">{error}</div>}

        <form className="composer" onSubmit={handleSubmit}>
          <Textarea
            ref={inputRef}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Send a message"
            rows={2}
            disabled={isStreaming}
            className="min-h-[56px] max-h-40 resize-y text-base leading-relaxed"
          />
          <Button
            type="submit"
            disabled={isStreaming || input.trim() === ""}
            className="h-[56px] min-w-[88px] text-base font-medium gap-2"
          >
            <Send size={16} strokeWidth={2} className="transition-transform duration-200 group-hover/button:translate-x-0.5 group-hover/button:-translate-y-0.5" />
            Send
          </Button>
        </form>
      </main>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
