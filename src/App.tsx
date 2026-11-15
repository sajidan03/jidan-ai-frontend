import { useEffect, useRef, useState } from "react";
import type { Attachment, Conversation, Message } from "./types";
import {
  deleteConversation,
  fetchConversationMessages,
  fetchConversations,
  streamChat,
  type ChatPayload,
} from "./lib/api";
import MessageBubble from "./components/MessageBubble";
import ChatInput from "./components/ChatInput";
import giyuAvatar from "../assets/giyu.jpg";

const SUGGESTIONS = [
  "Jelaskan perbedaan REST API dan GraphQL",
  "Buatkan contoh fungsi debounce di TypeScript",
  "Bagaimana cara deploy Laravel ke VPS?",
  "Beri ide nama untuk aplikasi to-do list",
];

const TEXT_FILE_EXT = /\.(txt|md|csv|json|js|jsx|ts|tsx|py|php|html|css|sql|xml|yaml|yml|env|log)$/i;

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

function decodeTextDataUrl(dataUrl: string): string | null {
  try {
    const commaIdx = dataUrl.indexOf(",");
    if (commaIdx === -1) return null;
    const base64 = dataUrl.slice(commaIdx + 1);
    const binary = atob(base64);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    return new TextDecoder("utf-8").decode(bytes);
  } catch {
    return null;
  }
}

function formatMessageForApi(m: Message): ChatPayload {
  const attachments = m.attachments || [];
  if (attachments.length === 0) {
    return { role: m.role, content: m.content };
  }

  const images = attachments.filter((a) => a.isImage && a.dataUrl);
  const docs = attachments.filter((a) => !a.isImage);

  let combinedText = m.content.trim();

  if (docs.length > 0) {
    const docSections = docs.map((doc) => {
      const isReadableText =
        doc.type.startsWith("text/") ||
        doc.type === "application/json" ||
        TEXT_FILE_EXT.test(doc.name);

      if (isReadableText && doc.dataUrl) {
        const extracted = decodeTextDataUrl(doc.dataUrl);
        if (extracted) {
          return `[Lampiran Dokumen: ${doc.name}]\n\`\`\`\n${extracted.slice(0, 15000)}\n\`\`\``;
        }
      }
      return `[Lampiran File: ${doc.name} (${doc.type || "dokumen"})]`;
    });

    combinedText = [combinedText, ...docSections].filter(Boolean).join("\n\n");
  }

  if (images.length > 0) {
    return {
      role: m.role,
      content: [
        { type: "text", text: combinedText || "Tolong analisis gambar ini." },
        ...images.map((img) => ({
          type: "image_url" as const,
          image_url: { url: img.dataUrl },
        })),
      ],
    };
  }

  return {
    role: m.role,
    content: combinedText || "Tolong analisis lampiran ini.",
  };
}

export default function App() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string>(() => uid());
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const refreshConversations = async () => {
    try {
      const list = await fetchConversations();
      setConversations(list);
    } catch (err) {
      console.error(err);
    }
  };

  // Muat daftar percakapan dari MySQL saat pertama kali dibuka
  useEffect(() => {
    refreshConversations();
  }, []);

  // Auto-scroll ke pesan terbaru
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: loading ? "auto" : "smooth" });
  }, [messages, loading]);

  const handleSelectConversation = async (convId: string) => {
    if (convId === activeConvId) return;
    abortRef.current?.abort();
    setLoading(false);
    setActiveConvId(convId);
    setLoadingHistory(true);

    try {
      const loaded = await fetchConversationMessages(convId);
      setMessages(loaded);
    } catch (err) {
      console.error(err);
      setMessages([]);
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleNewChat = () => {
    abortRef.current?.abort();
    setLoading(false);
    setActiveConvId(uid());
    setMessages([]);
    setInput("");
  };

  const handleDeleteConversation = async (e: React.MouseEvent, convId: string) => {
    e.stopPropagation();
    try {
      await deleteConversation(convId);
      setConversations((prev) => prev.filter((c) => c.id !== convId));
      if (convId === activeConvId) {
        setActiveConvId(uid());
        setMessages([]);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const send = async (text: string, attachments: Attachment[] = []) => {
    const content = text.trim();
    const hasAttachments = attachments.length > 0;
    if ((!content && !hasAttachments) || loading) return;

    const currentConvId = activeConvId;
    const userMsg: Message = {
      id: uid(),
      role: "user",
      content,
      attachments: hasAttachments ? attachments : undefined,
    };
    const botMsg: Message = { id: uid(), role: "assistant", content: "" };
    const history = [...messages, userMsg];

    setMessages([...history, botMsg]);
    setInput("");
    setLoading(true);

    // Optimistic update judul di sidebar jika ini pesan pertama
    setConversations((prev) => {
      const exists = prev.some((c) => c.id === currentConvId);
      if (exists) {
        return [
          { ...prev.find((c) => c.id === currentConvId)!, updated_at: new Date().toISOString() },
          ...prev.filter((c) => c.id !== currentConvId),
        ];
      }
      const previewTitle =
        content.slice(0, 45) || (attachments[0] ? `Lampiran: ${attachments[0].name}` : "Chat Baru");
      return [
        {
          id: currentConvId,
          title: previewTitle,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        ...prev,
      ];
    });

    const controller = new AbortController();
    abortRef.current = controller;

    const payload: ChatPayload[] = history
      .filter((m) => !m.error && (m.content || (m.attachments && m.attachments.length > 0)))
      .map(formatMessageForApi);

    try {
      await streamChat(
        payload,
        (token) =>
          setMessages((prev) =>
            prev.map((m) => (m.id === botMsg.id ? { ...m, content: m.content + token } : m))
          ),
        controller.signal,
        {
          conversationId: currentConvId,
          userMessage: userMsg,
          botMessageId: botMsg.id,
        }
      );
    } catch (err) {
      const error = err as Error;
      if (error.name !== "AbortError") {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === botMsg.id
              ? {
                  ...m,
                  content: m.content || error.message || "Terjadi kesalahan.",
                  error: m.content ? m.error : true,
                }
              : m
          )
        );
      }
    } finally {
      setMessages((prev) => prev.filter((m) => m.id !== botMsg.id || m.content !== ""));
      setLoading(false);
      abortRef.current = null;
      refreshConversations();
    }
  };

  const stop = () => abortRef.current?.abort();

  return (
    <div className="flex h-full bg-[#262624] text-[#ECEBE8]">
      {/* Sidebar Riwayat Chat ala Claude */}
      <aside
        className={`${
          sidebarOpen ? "w-64" : "w-0 overflow-hidden"
        } flex shrink-0 flex-col border-r border-[#333330] bg-[#1F1F1D] transition-all duration-200`}
      >
        <div className="flex h-14 items-center justify-between px-3">
          <div className="flex items-center gap-2">
            <img
              src={giyuAvatar}
              alt="Jidan AI"
              className="h-7 w-7 rounded-full object-cover object-top ring-1 ring-[#3E3E3B]"
            />
            <span className="text-sm font-semibold tracking-tight text-[#ECEBE8]">Jidan AI</span>
          </div>
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            title="Tutup sidebar"
            className="rounded-lg p-1.5 text-[#9B9A97] transition hover:bg-[#2C2C29] hover:text-[#ECEBE8]"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="M9 3v18" />
            </svg>
          </button>
        </div>

        <div className="px-3 pb-2">
          <button
            type="button"
            onClick={handleNewChat}
            className="flex w-full items-center gap-2 rounded-xl border border-[#3E3E3B] bg-[#2A2A27] px-3 py-2 text-xs font-medium text-[#ECEBE8] transition hover:border-[#D97757]/60 hover:bg-[#32322E]"
          >
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[#D97757] text-[12px] font-bold text-white">
              +
            </span>
            <span>Chat baru</span>
          </button>
        </div>

        <div className="px-3 pt-2 text-[11px] font-medium text-[#8E8D8A]">Terbaru</div>

        <nav className="mt-1 flex-1 space-y-0.5 overflow-y-auto px-2 pb-4">
          {conversations.length === 0 ? (
            <p className="px-2 py-3 text-xs text-[#73726E]">Belum ada riwayat chat.</p>
          ) : (
            conversations.map((conv) => {
              const isActive = conv.id === activeConvId;
              return (
                <div
                  key={conv.id}
                  onClick={() => handleSelectConversation(conv.id)}
                  className={`group flex cursor-pointer items-center justify-between rounded-lg px-2.5 py-2 text-xs transition ${
                    isActive
                      ? "bg-[#30302E] font-medium text-[#ECEBE8]"
                      : "text-[#B5B3AE] hover:bg-[#292926] hover:text-[#ECEBE8]"
                  }`}
                >
                  <span className="truncate pr-2">{conv.title}</span>
                  <button
                    type="button"
                    onClick={(e) => handleDeleteConversation(e, conv.id)}
                    title="Hapus chat"
                    aria-label="Hapus chat"
                    className="shrink-0 rounded p-1 text-[#73726E] opacity-0 transition hover:bg-[#3A3A37] hover:text-red-400 group-hover:opacity-100"
                  >
                    ✕
                  </button>
                </div>
              );
            })
          )}
        </nav>
      </aside>

      {/* Area Chat Utama */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Header */}
        <header className="shrink-0 border-b border-[#383835] bg-[#262624]/90 backdrop-blur">
          <div className="mx-auto flex h-14 w-full max-w-3xl items-center justify-between px-4">
            <div className="flex items-center gap-2.5">
              {!sidebarOpen && (
                <button
                  type="button"
                  onClick={() => setSidebarOpen(true)}
                  title="Buka sidebar"
                  className="rounded-lg p-1.5 text-[#9B9A97] transition hover:bg-[#30302E] hover:text-[#ECEBE8]"
                >
                  <svg
                    viewBox="0 0 24 24"
                    className="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <path d="M9 3v18" />
                  </svg>
                </button>
              )}
              <img
                src={giyuAvatar}
                alt="Jidan AI"
                className="h-8 w-8 rounded-full object-cover object-top ring-1 ring-[#3E3E3B]"
              />
              <h1 className="text-base font-medium tracking-tight text-[#ECEBE8]">Jidan AI</h1>
            </div>

            {messages.length > 0 && (
              <button
                type="button"
                onClick={handleNewChat}
                className="rounded-lg border border-[#3E3E3B] bg-[#30302E] px-3 py-1.5 text-xs font-medium text-[#C5C3BE] transition hover:border-[#52524E] hover:bg-[#383835] hover:text-[#ECEBE8]"
              >
                Chat baru
              </button>
            )}
          </div>
        </header>

        {/* Daftar pesan */}
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col px-4 py-6">
            {loadingHistory ? (
              <div className="flex flex-1 items-center justify-center text-sm text-[#9B9A97]">
                Memuat percakapan...
              </div>
            ) : messages.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-6 py-10 text-center">
                <img
                  src={giyuAvatar}
                  alt="Jidan AI"
                  className="h-20 w-20 rounded-2xl object-cover object-top shadow-md ring-1 ring-[#3E3E3B]"
                />
                <div>
                  <h2 className="text-2xl font-medium tracking-tight text-[#ECEBE8]">
                    Halo, ada yang bisa dibantu?
                  </h2>
                  <p className="mt-2 text-sm text-[#9B9A97]">
                    Tanya apa saja ke Jidan AI, mulai dari coding sampai ide proyek.
                  </p>
                </div>
                <div className="grid w-full max-w-xl grid-cols-1 gap-2 sm:grid-cols-2">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => send(s)}
                      className="rounded-xl border border-[#3E3E3B] bg-[#30302E]/80 px-4 py-3 text-left text-sm text-[#D6D4CE] transition hover:border-[#D97757]/60 hover:bg-[#30302E] hover:text-[#ECEBE8]"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-6">
                {messages.map((m) => (
                  <MessageBubble key={m.id} message={m} />
                ))}
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        </main>

        {/* Input */}
        <footer className="shrink-0 bg-[#262624] px-4 pb-4 pt-2">
          <div className="mx-auto w-full max-w-3xl">
            <ChatInput
              value={input}
              loading={loading}
              onChange={setInput}
              onSend={(attachments) => send(input, attachments)}
              onStop={stop}
            />
            <p className="mt-2 text-center text-[11px] text-[#8E8D8A]">
              Jidan AI adalah AI dan bisa membuat kesalahan. Cek kembali informasi penting.
            </p>
          </div>
        </footer>
      </div>
    </div>
  );
}