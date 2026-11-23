import { useState } from "react";
import type { Message } from "../types";
import { copyText } from "../lib/clipboard";
import CopyButton from "./CopyButton";
import giyuAvatar from "../../assets/giyu.jpg";

interface Part {
  type: "text" | "code";
  value: string;
  lang?: string;
}

/* ------------------------------------------------------------------ */
/* Animasi (di-inject sekali ke <head>, tidak perlu ubah tailwind config) */
/* ------------------------------------------------------------------ */
const STYLE_ID = "jidan-bubble-styles";

const BUBBLE_CSS = `
@keyframes jidan-wave {
  0%, 60%, 100% { transform: translateY(0) scale(0.85); opacity: 0.4; }
  30%           { transform: translateY(-5px) scale(1);  opacity: 1; }
}
@keyframes jidan-ring {
  0%   { box-shadow: 0 0 0 0 rgba(217, 119, 87, 0.50); }
  70%  { box-shadow: 0 0 0 9px rgba(217, 119, 87, 0); }
  100% { box-shadow: 0 0 0 0 rgba(217, 119, 87, 0); }
}
@keyframes jidan-shimmer {
  0%   { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
@keyframes jidan-in {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}

.jidan-msg-in { animation: jidan-in 0.28s ease-out both; }

.jidan-avatar-pulse { animation: jidan-ring 1.8s ease-out infinite; }

.jidan-dot {
  display: inline-block;
  height: 7px;
  width: 7px;
  border-radius: 9999px;
  background: linear-gradient(135deg, #E5987E, #D97757);
  animation: jidan-wave 1.2s ease-in-out infinite;
}

.jidan-shimmer-text {
  background-image: linear-gradient(
    90deg,
    #7F7E7A 0%,
    #7F7E7A 40%,
    #E5987E 50%,
    #7F7E7A 60%,
    #7F7E7A 100%
  );
  background-size: 200% 100%;
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  color: transparent;
  animation: jidan-shimmer 2.4s linear infinite;
}

@media (prefers-reduced-motion: reduce) {
  .jidan-msg-in,
  .jidan-avatar-pulse,
  .jidan-dot,
  .jidan-shimmer-text { animation: none; }
  .jidan-dot { opacity: 0.8; }
  .jidan-shimmer-text { -webkit-text-fill-color: #9B9A97; color: #9B9A97; }
}
`;

if (typeof document !== "undefined" && !document.getElementById(STYLE_ID)) {
  const el = document.createElement("style");
  el.id = STYLE_ID;
  el.textContent = BUBBLE_CSS;
  document.head.appendChild(el);
}

/* ------------------------------------------------------------------ */
/* Parsing konten                                                      */
/* ------------------------------------------------------------------ */

// Pisahkan teks biasa dan blok kode ```...``` (aman untuk blok yang belum selesai saat streaming)
function parseContent(content: string): Part[] {
  const parts: Part[] = [];
  const re = /```(\w*)\n?([\s\S]*?)(?:```|$)/g;
  let last = 0;
  let match: RegExpExecArray | null;

  while ((match = re.exec(content)) !== null) {
    if (match.index > last) {
      parts.push({ type: "text", value: content.slice(last, match.index) });
    }
    parts.push({ type: "code", lang: match[1], value: match[2].replace(/\n$/, "") });
    last = re.lastIndex;
  }

  if (last < content.length) {
    parts.push({ type: "text", value: content.slice(last) });
  }
  return parts;
}

// `kode` inline dan **tebal** (bold yang belum ditutup saat streaming tetap tampil apa adanya)
function InlineText({ text }: { text: string }) {
  const chunks = text.split(/(`[^`\n]+`|\*\*[^*\n]+\*\*)/g);
  return (
    <>
      {chunks.map((chunk, i) => {
        if (chunk.startsWith("`") && chunk.endsWith("`") && chunk.length > 2) {
          return (
            <code
              key={i}
              className="rounded bg-[#30302E] px-1.5 py-0.5 font-mono text-[0.85em] text-[#E5987E]"
            >
              {chunk.slice(1, -1)}
            </code>
          );
        }
        if (chunk.startsWith("**") && chunk.endsWith("**") && chunk.length > 4) {
          return (
            <strong key={i} className="font-semibold text-white">
              <InlineText text={chunk.slice(2, -2)} />
            </strong>
          );
        }
        return <span key={i}>{chunk}</span>;
      })}
    </>
  );
}

function CodeBlock({ code, lang }: { code: string; lang?: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    const ok = await copyText(code);
    if (!ok) return;
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="my-3 overflow-hidden rounded-xl border border-[#3E3E3B] bg-[#181816]">
      <div className="flex items-center justify-between border-b border-[#2E2E2B] bg-[#1F1F1D] px-3 py-1.5 text-xs text-[#9B9A97]">
        <span>{lang || "kode"}</span>
        <button type="button" onClick={copy} className="transition hover:text-[#ECEBE8]">
          {copied ? "Tersalin ✓" : "Salin kode"}
        </button>
      </div>
      <pre className="overflow-x-auto p-3 text-[13px] leading-6 text-[#ECEBE8]">
        <code className="font-mono">{code}</code>
      </pre>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Indikator loading AI (bubble + 3 titik gelombang + teks shimmer)    */
/* ------------------------------------------------------------------ */
function TypingIndicator() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Jidan AI sedang mengetik"
      className="inline-flex items-center gap-3 rounded-2xl rounded-tl-md border border-[#3E3E3B] bg-[#1F1F1D] px-4 py-3 shadow-sm shadow-black/20"
    >
      <span className="flex items-center gap-1.5">
        <span className="jidan-dot" style={{ animationDelay: "0s" }} />
        <span className="jidan-dot" style={{ animationDelay: "0.15s" }} />
        <span className="jidan-dot" style={{ animationDelay: "0.3s" }} />
      </span>
      <span className="jidan-shimmer-text text-xs font-medium tracking-wide">
        Jidan AI sedang berpikir…
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Komponen utama                                                      */
/* ------------------------------------------------------------------ */
export default function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";

  // Pesan user (kapsul gelap hangat ala Claude)
  if (isUser) {
    const hasAttachments = Boolean(message.attachments && message.attachments.length > 0);

    return (
      <div className="jidan-msg-in group flex flex-col items-end gap-1.5">
        {hasAttachments && (
          <div className="flex max-w-[85%] flex-wrap justify-end gap-2 sm:max-w-[75%]">
            {message.attachments!.map((att) =>
              att.isImage ? (
                <a
                  key={att.id}
                  href={att.dataUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="overflow-hidden rounded-xl border border-[#3E3E3B] bg-[#181816]"
                >
                  <img
                    src={att.dataUrl}
                    alt={att.name}
                    className="max-h-48 max-w-[220px] object-cover transition hover:opacity-90"
                  />
                </a>
              ) : (
                <div
                  key={att.id}
                  className="flex items-center gap-2 rounded-xl border border-[#3E3E3B] bg-[#181816] px-3 py-2 text-xs text-[#D6D4CE]"
                >
                  <svg
                    viewBox="0 0 24 24"
                    className="h-4 w-4 shrink-0 text-[#D97757]"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                  <span className="max-w-[180px] truncate">{att.name}</span>
                </div>
              )
            )}
          </div>
        )}

        {message.content && (
          <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md border border-[#2E2E2B] bg-[#181816] px-4 py-2.5 text-sm leading-6 text-[#ECEBE8] shadow-sm shadow-black/20 sm:max-w-[75%]">
            {message.content}
          </div>
        )}

        {message.content && <CopyButton text={message.content} />}
      </div>
    );
  }

  // Pesan AI
  const parts = parseContent(message.content);
  const isLoading = message.content === "";
  const canCopy = !isLoading && !message.error;

  return (
    <div className="jidan-msg-in group flex items-start gap-3">
      <img
        src={giyuAvatar}
        alt="Jidan AI"
        className={`mt-0.5 h-8 w-8 shrink-0 rounded-full object-cover object-top ring-1 ring-[#3E3E3B] ${
          isLoading ? "jidan-avatar-pulse" : ""
        }`}
      />

      <div className="min-w-0 flex-1 text-sm leading-7 text-[#ECEBE8]">
        {isLoading ? (
          <TypingIndicator />
        ) : message.error ? (
          <div className="rounded-2xl rounded-tl-md border border-red-900/60 bg-red-950/40 px-4 py-2.5 text-red-300">
            ⚠️ {message.content}
          </div>
        ) : (
          parts.map((part, i) =>
            part.type === "code" ? (
              <CodeBlock key={i} code={part.value} lang={part.lang} />
            ) : (
              <p key={i} className="whitespace-pre-wrap break-words">
                <InlineText text={part.value} />
              </p>
            )
          )
        )}

        {canCopy && (
          <div className="-ml-1.5 mt-1">
            <CopyButton text={message.content} />
          </div>
        )}
      </div>
    </div>
  );
}