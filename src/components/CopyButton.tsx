import { useEffect, useRef, useState } from "react";
import { copyText } from "../lib/clipboard";

interface Props {
  text: string;
  /** Tampilkan teks "Salin" di samping ikon */
  label?: boolean;
}

/**
 * Tombol salin. Letakkan di dalam elemen induk ber-class "group":
 * di desktop muncul saat kursor di atas pesan, di layar sentuh selalu terlihat.
 */
export default function CopyButton({ text, label = true }: Props) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const handleCopy = async () => {
    const ok = await copyText(text);
    if (!ok) return;
    setCopied(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(false), 1500);
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={copied ? "Tersalin" : "Salin pesan"}
      title="Salin"
      className={`inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-xs transition focus-visible:opacity-100 sm:opacity-0 sm:group-hover:opacity-100 ${
        copied ? "text-[#D97757] sm:opacity-100" : "text-[#8E8D8A] hover:text-[#ECEBE8]"
      }`}
    >
      {copied ? (
        <svg
          viewBox="0 0 24 24"
          className="h-3.5 w-3.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M20 6 9 17l-5-5" />
        </svg>
      ) : (
        <svg
          viewBox="0 0 24 24"
          className="h-3.5 w-3.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="9" y="9" width="13" height="13" rx="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      )}
      {label && <span>{copied ? "Tersalin" : "Salin"}</span>}
    </button>
  );
}