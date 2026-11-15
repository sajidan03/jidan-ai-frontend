import type { Conversation, Message } from "../types";

const API_URL = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");

export type ChatContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export interface ChatPayload {
  role: Message["role"];
  content: string | ChatContentPart[];
}

export interface StreamMeta {
  conversationId: string;
  userMessage: Message;
  botMessageId: string;
}

/**
 * Ambil daftar percakapan untuk sidebar riwayat chat.
 */
export async function fetchConversations(): Promise<Conversation[]> {
  const res = await fetch(`${API_URL}/api/conversations`);
  if (!res.ok) {
    throw new Error(`Gagal memuat daftar percakapan (${res.status})`);
  }
  const data = await res.json();
  return data.conversations ?? [];
}

/**
 * Ambil seluruh pesan dalam satu percakapan dari database.
 */
export async function fetchConversationMessages(conversationId: string): Promise<Message[]> {
  const res = await fetch(`${API_URL}/api/conversations/${encodeURIComponent(conversationId)}`);
  if (!res.ok) {
    throw new Error(`Gagal memuat isi percakapan (${res.status})`);
  }
  const data = await res.json();
  return data.messages ?? [];
}

/**
 * Hapus satu percakapan beserta seluruh pesannya.
 */
export async function deleteConversation(conversationId: string): Promise<void> {
  const res = await fetch(`${API_URL}/api/conversations/${encodeURIComponent(conversationId)}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    throw new Error(`Gagal menghapus percakapan (${res.status})`);
  }
}

/**
 * Kirim percakapan ke backend dan baca balasan secara streaming (SSE).
 * Setiap potongan teks dikirim lewat onToken, sekaligus menyimpan riwayat ke database.
 */
export async function streamChat(
  messages: ChatPayload[],
  onToken: (token: string) => void,
  signal: AbortSignal,
  meta?: StreamMeta
): Promise<void> {
  const res = await fetch(`${API_URL}/api/chat/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages,
      ...(meta ?? {}),
    }),
    signal,
  });

  if (!res.ok || !res.body) {
    let message = `Server error (${res.status})`;
    try {
      const data = await res.json();
      if (data?.error) message = data.error;
    } catch {
      // abaikan, pakai pesan default
    }
    throw new Error(message);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";
  let gotToken = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    full += chunk;
    buffer += chunk;

    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const raw of lines) {
      const line = raw.trim();
      if (!line.startsWith("data:")) continue;

      const payload = line.slice(5).trim();
      if (payload === "[DONE]") return;

      try {
        const json = JSON.parse(payload);
        const token =
          json?.choices?.[0]?.delta?.content ??
          json?.delta?.text;
        if (typeof token === "string" && token) {
          gotToken = true;
          onToken(token);
        }
      } catch {
        // baris SSE tidak lengkap / bukan JSON, lewati
      }
    }
  }

  // Cadangan: kalau provider membalas JSON biasa (bukan SSE)
  if (!gotToken) {
    try {
      const json = JSON.parse(full);
      const text =
        json?.choices?.[0]?.message?.content ??
        json?.reply ??
        json?.output ??
        json?.text;
      if (typeof text === "string" && text) onToken(text);
    } catch {
      // tidak ada isi yang bisa dibaca
    }
  }
}