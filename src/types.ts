export type Role = "user" | "assistant";

export interface Attachment {
  id: string;
  name: string;
  type: string;
  size: number;
  dataUrl: string;
  isImage: boolean;
}

export interface Message {
  id: string;
  role: Role;
  content: string;
  attachments?: Attachment[];
  error?: boolean;
}

export interface Conversation {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}