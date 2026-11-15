import type { Conversation, Message } from "../types";

const API_URL = (
  import.meta.env.VITE_API_URL ||
  "https://api-jidan-ai.vercel.app"
).replace(/\/+$/, "");

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
 *
 * onIncomplete (opsional) dipanggil kalau stream berakhir TANPA sinyal selesai
 * (tidak ada [DONE] / finish_reason), misalnya koneksi diputus server/hosting,
 * atau jawaban terpotong karena batas token (finish_reason "length").
 */
export async function streamChat(
  messages: ChatPayload[],
  onToken: (token: string) => void,
  signal: AbortSignal,
  meta?: StreamMeta,
  onIncomplete?: (reason: string) => void
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
  let sawDone = false;
  let finishReason: string | null = null;
  let readError: unknown = null;

  // Proses satu baris SSE. Mengembalikan true kalau stream sudah selesai ([DONE]).
  const handleLine = (raw: string): boolean => {
    const line = raw.trim();
    if (!line.startsWith("data:")) return false;

    const payload = line.slice(5).trim();
    if (payload === "[DONE]") {
      sawDone = true;
      return true;
    }

    try {
      const json = JSON.parse(payload);
      const token = json?.choices?.[0]?.delta?.content ?? json?.delta?.text;
      if (typeof token === "string" && token) {
        gotToken = true;
        onToken(token);
      }
      const fr = json?.choices?.[0]?.finish_reason ?? json?.delta?.stop_reason;
      if (fr) finishReason = String(fr);
    } catch {
      // baris SSE tidak lengkap / bukan JSON, lewati
    }
    return false;
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      full += chunk;
      buffer += chunk;

      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const raw of lines) {
        if (handleLine(raw)) {
          // [DONE]: stream selesai normal
          try {
            await reader.cancel();
          } catch {
            // abaikan
          }
          return;
        }
      }
    }
  } catch (err) {
    // Dibatalkan pengguna (tombol stop): lempar ulang seperti perilaku fetch biasa
    if ((err as { name?: string })?.name === "AbortError") throw err;
    // Koneksi putus di tengah jalan: simpan, lalu laporkan di bawah
    readError = err;
  }

  // Proses sisa buffer yang belum berakhir dengan newline
  buffer += decoder.decode();
  if (buffer.trim()) {
    for (const raw of buffer.split("\n")) handleLine(raw);
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
      if (typeof text === "string" && text) {
        gotToken = true;
        onToken(text);
      }
    } catch {
      // tidak ada isi yang bisa dibaca
    }
  }

  // Deteksi stream yang tidak selesai dengan benar
  if (gotToken && !sawDone) {
    if (finishReason === "length") {
      onIncomplete?.("Jawaban terpotong karena batas panjang (max_tokens).");
    } else if (!finishReason) {
      onIncomplete?.(
        readError
          ? "Koneksi terputus sebelum jawaban selesai."
          : "Server menutup koneksi sebelum jawaban selesai (kemungkinan timeout hosting)."
      );
    }
  }
}