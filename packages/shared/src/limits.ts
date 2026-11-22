export const MAX_MESSAGE_LENGTH = 1000;
export const MAX_KNOWLEDGE_TEXT_LENGTH = 100_000;
export const MAX_KNOWLEDGE_TITLE_LENGTH = 200;
export const MAX_PROJECT_NAME_LENGTH = 80;
export const MAX_VISITOR_ID_LENGTH = 100;
/** 10 MB. project.md §6.4 calls it MAX_KNOWLEDGE_FILE_BYTES. */
export const MAX_KNOWLEDGE_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_FILE_BYTES = MAX_KNOWLEDGE_FILE_BYTES;
export const PUBLIC_KEY_PREFIX = "pk_";

export const KNOWLEDGE_FILE_TYPES = ["pdf", "md", "txt"] as const;
export type KnowledgeFileType = (typeof KNOWLEDGE_FILE_TYPES)[number];

export const KNOWLEDGE_FILE_MIME_TYPES: Record<KnowledgeFileType, string> = {
  pdf: "application/pdf",
  md: "text/markdown",
  txt: "text/plain",
};
