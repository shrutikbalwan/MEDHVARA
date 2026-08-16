"use client";

import { useEffect, useRef, useState } from "react";

import type { ChatMessageRow } from "@/lib/supabase/messages";

import styles from "./ChatWindow.module.css";

type Bubble = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

export function ChatWindow({
  initialMessages,
  historyError,
}: {
  initialMessages: ChatMessageRow[];
  historyError: string | null;
}) {
  const [messages, setMessages] = useState<Bubble[]>(() =>
    initialMessages.map(({ id, role, content }) => ({ id, role, content })),
  );
  const [input, setInput] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Daily cap hit — the composer stays disabled until tomorrow. */
  const [limitReached, setLimitReached] = useState(false);
  const [usage, setUsage] = useState<{ used: number; limit: number } | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // Optimistic bubbles need ids that cannot collide with database uuids.
  const localId = useRef(0);

  // Pin to the newest message whenever the transcript grows or the thinking
  // indicator appears.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, isThinking]);

  async function send() {
    const text = input.trim();
    if (!text || isThinking || limitReached) return;

    const optimistic: Bubble = {
      id: `local-${localId.current++}`,
      role: "user",
      content: text,
    };

    setMessages((prev) => [...prev, optimistic]);
    setInput("");
    setError(null);
    setIsThinking(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        // 429 is the daily cap. The server already phrases it for humans, so
        // show that text rather than inventing a second wording here.
        if (response.status === 429) setLimitReached(true);

        setError(
          payload?.error ??
            "Something went wrong sending that message. Please try again.",
        );
        // Roll the optimistic bubble back — it was never saved.
        setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
        setInput(text);
        return;
      }

      setMessages((prev) => [
        ...prev,
        {
          id: `local-${localId.current++}`,
          role: "assistant",
          content: payload.reply,
        },
      ]);

      if (payload.usage) setUsage(payload.usage);
      if (payload.warning) setError(payload.warning);
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      setInput(text);
    } finally {
      setIsThinking(false);
      textareaRef.current?.focus();
    }
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends, Shift+Enter makes a newline — the convention people expect
    // from a chat composer.
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void send();
    }
  }

  const isEmpty = messages.length === 0 && !isThinking;

  return (
    <div className={styles.window}>
      <div className={styles.scroll} ref={scrollRef}>
        {historyError ? (
          <p className={styles.systemNote}>
            Past messages could not be loaded, so this conversation starts empty.
          </p>
        ) : null}

        {isEmpty ? (
          <p className={styles.empty}>
            Ask about basic electronics, embedded systems, or IoT.
          </p>
        ) : null}

        {messages.map((message) => (
          <div
            key={message.id}
            className={`${styles.row} ${
              message.role === "user" ? styles.rowUser : styles.rowAssistant
            }`}
          >
            <div
              className={`${styles.bubble} ${
                message.role === "user" ? styles.bubbleUser : styles.bubbleAssistant
              }`}
            >
              {message.content}
            </div>
          </div>
        ))}

        {isThinking ? (
          <div className={`${styles.row} ${styles.rowAssistant}`}>
            <div className={`${styles.bubble} ${styles.thinking}`} role="status">
              MEDHVARA is thinking
              <span className={styles.dots} aria-hidden="true">
                <span />
                <span />
                <span />
              </span>
            </div>
          </div>
        ) : null}
      </div>

      {error ? (
        <p
          className={limitReached ? styles.limit : styles.error}
          role={limitReached ? "status" : "alert"}
        >
          {error}
        </p>
      ) : null}

      <div className={styles.composer}>
        <textarea
          ref={textareaRef}
          className={styles.input}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          maxLength={4000}
          disabled={limitReached}
          placeholder={
            limitReached
              ? "Daily limit reached — back tomorrow"
              : "Ask a question…  (Enter to send, Shift+Enter for a new line)"
          }
          aria-label="Message"
        />
        <button
          type="button"
          className={styles.send}
          onClick={() => void send()}
          disabled={isThinking || limitReached || input.trim().length === 0}
        >
          {isThinking ? "Sending…" : "Send"}
        </button>
      </div>

      {usage ? (
        <p className={styles.usage}>
          {usage.used} of {usage.limit} messages used today
        </p>
      ) : null}
    </div>
  );
}
