import { useEffect, useRef, useState } from "react";
import type { ChangeEvent, DragEvent, KeyboardEvent, ClipboardEvent } from "react";
import type { Attachment } from "../types";

interface Props {
  value: string;
  loading: boolean;
  onChange: (value: string) => void;
  onSend: (attachments: Attachment[]) => void;
  onStop: () => void;
}

const MAX_FILES = 5;
const MAX_FILE_SIZE_MB = 500;
const ACCEPTED_TYPES =
  "image/*,.pdf,.doc,.docx,.txt,.csv,.json,.md,.xls,.xlsx,.js,.ts,.py";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function ChatInput({ value, loading, onChange, onSend, onStop }: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [dragging, setDragging] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);

  // Tinggi textarea menyesuaikan isi (maks 200px)
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [value]);

  const processFiles = async (fileList: FileList | File[]) => {
    setFileError(null);
    const incoming = Array.from(fileList);
    if (incoming.length === 0) return;

    if (attachments.length + incoming.length > MAX_FILES) {
      setFileError(`Maksimal ${MAX_FILES} file per pesan.`);
      return;
    }

    const validFiles: Attachment[] = [];

    for (const file of incoming) {
      if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
        setFileError(`"${file.name}" melebihi batas ${MAX_FILE_SIZE_MB}MB.`);
        continue;
      }

      const dataUrl = await readFileAsDataUrl(file);
      validFiles.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: file.name,
        type: file.type || "application/octet-stream",
        size: file.size,
        dataUrl,
        isImage: file.type.startsWith("image/"),
      });
    }

    if (validFiles.length > 0) {
      setAttachments((prev) => [...prev, ...validFiles]);
    }
  };

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      await processFiles(e.target.files);
      e.target.value = "";
    }
  };

  const handlePaste = async (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const files = e.clipboardData?.files;
    if (files && files.length > 0) {
      e.preventDefault();
      await processFiles(files);
    }
  };

  const handleDrop = async (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer?.files) {
      await processFiles(e.dataTransfer.files);
    }
  };

  const removeAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((item) => item.id !== id));
    setFileError(null);
  };

  const triggerSend = () => {
    if (loading) return;
    if (value.trim().length === 0 && attachments.length === 0) return;
    onSend(attachments);
    setAttachments([]);
    setFileError(null);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      triggerSend();
    }
  };

  const canSend = (value.trim().length > 0 || attachments.length > 0) && !loading;

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      className={`flex flex-col rounded-2xl border bg-[#30302E] p-2.5 shadow-lg transition ${
        dragging
          ? "border-[#D97757] bg-[#36332E]"
          : "border-[#3E3E3B] focus-within:border-[#575651]"
      }`}
    >
      {/* Error info jika file ditolak */}
      {fileError && (
        <div className="mb-2 flex items-center justify-between rounded-lg border border-red-900/60 bg-red-950/50 px-3 py-1.5 text-xs text-red-300">
          <span>⚠️ {fileError}</span>
          <button type="button" onClick={() => setFileError(null)} className="hover:text-white">
            ✕
          </button>
        </div>
      )}

      {/* Area Preview Foto & Dokumen */}
      {attachments.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2 px-1 pt-1">
          {attachments.map((item) =>
            item.isImage ? (
              <div
                key={item.id}
                className="group relative h-16 w-16 overflow-hidden rounded-xl border border-[#4A4945] bg-[#262624]"
              >
                <img
                  src={item.dataUrl}
                  alt={item.name}
                  className="h-full w-full object-cover"
                />
                <button
                  type="button"
                  onClick={() => removeAttachment(item.id)}
                  aria-label={`Hapus ${item.name}`}
                  className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-[#181816]/85 text-[11px] text-[#ECEBE8] transition hover:bg-red-600 hover:text-white"
                >
                  ✕
                </button>
              </div>
            ) : (
              <div
                key={item.id}
                className="flex max-w-[210px] items-center gap-2 rounded-xl border border-[#4A4945] bg-[#262624] px-2.5 py-1.5 text-xs text-[#ECEBE8]"
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
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-[#ECEBE8]">{item.name}</p>
                  <p className="text-[10px] text-[#9B9A97]">{formatSize(item.size)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => removeAttachment(item.id)}
                  aria-label={`Hapus ${item.name}`}
                  className="ml-1 rounded p-0.5 text-[#9B9A97] transition hover:bg-[#383835] hover:text-[#ECEBE8]"
                >
                  ✕
                </button>
              </div>
            )
          )}
        </div>
      )}

      {/* Baris Input Utama */}
      <div className="flex items-end gap-2">
        {/* Input File Tersembunyi */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ACCEPTED_TYPES}
          onChange={handleFileChange}
          className="hidden"
        />

        {/* Tombol Tambah Lampiran (+) */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={loading}
          title="Lampirkan foto atau dokumen"
          aria-label="Lampirkan foto atau dokumen"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[#9B9A97] transition hover:bg-[#3A3A37] hover:text-[#ECEBE8] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <svg
            viewBox="0 0 24 24"
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 5v14" />
            <path d="M5 12h14" />
          </svg>
        </button>

        <textarea
          ref={textareaRef}
          value={value}
          rows={1}
          placeholder={
            dragging
              ? "Lepaskan file di sini..."
              : "Balas..."
          }
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          className="max-h-[200px] flex-1 resize-none bg-transparent px-1 py-1.5 text-sm leading-6 text-[#ECEBE8] placeholder-[#9B9A97] outline-none"
        />

        {loading ? (
          <button
            type="button"
            onClick={onStop}
            aria-label="Hentikan"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#42423E] text-[#ECEBE8] transition hover:bg-[#52524E]"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
              <rect x="6" y="6" width="12" height="12" rx="2" />
            </svg>
          </button>
        ) : (
          <button
            type="button"
            onClick={triggerSend}
            disabled={!canSend}
            aria-label="Kirim"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#D97757] text-white transition hover:bg-[#C66647] disabled:cursor-not-allowed disabled:bg-[#3A3A37] disabled:text-[#73726E]"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 19V5" />
              <path d="m5 12 7-7 7 7" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}