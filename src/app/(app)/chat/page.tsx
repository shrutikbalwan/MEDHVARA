import type { Metadata } from "next";

import { ChatWindow } from "@/components/chat/ChatWindow";
import { getChatHistory } from "@/lib/supabase/messages";

import styles from "../app.module.css";

export const metadata: Metadata = { title: "Chat · MEDHVARA" };

// History is per-user and changes on every send, so never serve it from cache.
export const dynamic = "force-dynamic";

/**
 * The signed-in gate lives in src/app/(app)/layout.tsx, which redirects to
 * /login before this renders. History is loaded on the server so the transcript
 * is present in the first paint rather than after a client round trip.
 */
export default async function ChatPage() {
  const { messages, error } = await getChatHistory();

  return (
    <>
      <h1 className={styles.title}>Chat</h1>
      <ChatWindow initialMessages={messages} historyError={error} />
    </>
  );
}
