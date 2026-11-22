import { z } from "zod";
import {
  KNOWLEDGE_FILE_MIME_TYPES,
  KNOWLEDGE_FILE_TYPES,
  MAX_KNOWLEDGE_FILE_BYTES,
  MAX_KNOWLEDGE_TEXT_LENGTH,
  MAX_KNOWLEDGE_TITLE_LENGTH,
  MAX_MESSAGE_LENGTH,
  MAX_PROJECT_NAME_LENGTH,
  MAX_VISITOR_ID_LENGTH,
  PUBLIC_KEY_PREFIX,
} from "./limits";
import {
  KNOWLEDGE_SOURCE_STATUSES,
  KNOWLEDGE_SOURCE_TYPES,
  MESSAGE_ROLES,
} from "./enums";
import {
  MAX_WIDGET_HEADER_LENGTH,
  MAX_WIDGET_LABEL_LENGTH,
  WIDGET_ANIMATIONS,
  WIDGET_POSITIONS,
} from "./widget";

// ---------- shared building blocks ----------

export const publicKeySchema = z
  .string()
  .startsWith(PUBLIC_KEY_PREFIX)
  .max(200);
export const idSchema = z.uuid();
/** Path params: `/api/projects/:id`, `/api/knowledge/:id`, `/api/conversations/:id`. */
export const idParamsSchema = z.object({ id: idSchema });
export type IdParams = z.infer<typeof idParamsSchema>;

const projectNameSchema = z.string().trim().min(1).max(MAX_PROJECT_NAME_LENGTH);

export const widgetConfigSchema = z.object({
  buttonColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  position: z.enum(WIDGET_POSITIONS),
  label: z.string().trim().min(1).max(MAX_WIDGET_LABEL_LENGTH),
  animation: z.enum(WIDGET_ANIMATIONS),
  headerText: z.string().trim().min(1).max(MAX_WIDGET_HEADER_LENGTH),
  showBadge: z.boolean(),
});

/** Returned by routes that have nothing else to say. */
export type OkResponse = { ok: true };

// ---------- response entities (camelCase; DB rows stay snake_case) ----------

export type Project = {
  id: string;
  name: string;
  publicKey: string;
  messagesUsed: number;
  /** ISO timestamp of the start of the current monthly period. */
  periodStart: string;
  createdAt: string;
};

export type KnowledgeSource = {
  id: string;
  title: string;
  type: (typeof KNOWLEDGE_SOURCE_TYPES)[number];
  status: (typeof KNOWLEDGE_SOURCE_STATUSES)[number];
  createdAt: string;
};

export type ConversationSummary = {
  id: string;
  visitorId: string;
  /** First visitor message, shortened. */
  preview: string;
  messageCount: number;
  createdAt: string;
};

export type ConversationMessage = {
  id: string;
  role: (typeof MESSAGE_ROLES)[number];
  body: string;
  createdAt: string;
};

// ---------- GET /api/widget/config ----------

export const widgetConfigQuerySchema = z.object({ key: publicKeySchema });
export type WidgetConfigQuery = z.infer<typeof widgetConfigQuerySchema>;
/** Plan-applied: Free gets defaults + badge. */
export type WidgetConfigResponse = z.infer<typeof widgetConfigSchema>;

// ---------- POST /api/widget/chat ----------

export const widgetChatRequestSchema = z.object({
  key: publicKeySchema,
  visitorId: z.string().min(1).max(MAX_VISITOR_ID_LENGTH),
  conversationId: idSchema.optional(),
  message: z.string().trim().min(1).max(MAX_MESSAGE_LENGTH),
});
export type WidgetChatRequest = z.infer<typeof widgetChatRequestSchema>;
export type WidgetChatResponse = { conversationId: string; reply: string };

// ---------- GET/POST /api/projects, PATCH/DELETE /api/projects/:id ----------

export type ProjectListResponse = { projects: Project[] };

export const createProjectRequestSchema = z.object({ name: projectNameSchema });
export type CreateProjectRequest = z.infer<typeof createProjectRequestSchema>;
export type CreateProjectResponse = { project: Project };

export const renameProjectRequestSchema = z.object({ name: projectNameSchema });
export type RenameProjectRequest = z.infer<typeof renameProjectRequestSchema>;
export type RenameProjectResponse = { project: Project };

export type DeleteProjectResponse = OkResponse;

// ---------- POST /api/projects/:id/knowledge (paste text) ----------

export const pasteKnowledgeRequestSchema = z.object({
  title: z.string().trim().min(1).max(MAX_KNOWLEDGE_TITLE_LENGTH),
  text: z.string().trim().min(1).max(MAX_KNOWLEDGE_TEXT_LENGTH),
});
export type PasteKnowledgeRequest = z.infer<typeof pasteKnowledgeRequestSchema>;
export type PasteKnowledgeResponse = { source: KnowledgeSource };

// ---------- POST /api/projects/:id/knowledge/upload-url ----------

const fileExtension = (name: string): string => {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot + 1).toLowerCase();
};

export const uploadUrlRequestSchema = z
  .object({
    fileName: z.string().trim().min(1).max(255),
    size: z.number().int().positive().max(MAX_KNOWLEDGE_FILE_BYTES),
    mime: z.enum(
      Object.values(KNOWLEDGE_FILE_MIME_TYPES) as [string, ...string[]],
    ),
  })
  .refine(
    (v) => {
      const ext = fileExtension(v.fileName);
      return (
        (KNOWLEDGE_FILE_TYPES as readonly string[]).includes(ext) &&
        KNOWLEDGE_FILE_MIME_TYPES[ext as (typeof KNOWLEDGE_FILE_TYPES)[number]] ===
          v.mime
      );
    },
    { message: "File extension must be pdf, md or txt and match the MIME type", path: ["fileName"] },
  );
export type UploadUrlRequest = z.infer<typeof uploadUrlRequestSchema>;
export type UploadUrlResponse = {
  sourceId: string;
  /** Storage object path the browser uploads to. */
  path: string;
  /** One-time signed upload token for that path. */
  token: string;
};

// ---------- POST /api/projects/:id/knowledge/finalize ----------

export const finalizeKnowledgeRequestSchema = z.object({ sourceId: idSchema });
export type FinalizeKnowledgeRequest = z.infer<typeof finalizeKnowledgeRequestSchema>;
export type FinalizeKnowledgeResponse = { source: KnowledgeSource };

// ---------- DELETE /api/knowledge/:id ----------

export type DeleteKnowledgeResponse = OkResponse;

// ---------- GET /api/projects/:id/conversations, GET /api/conversations/:id ----------

export type ConversationListResponse = { conversations: ConversationSummary[] };
export type ConversationThreadResponse = {
  conversation: { id: string; visitorId: string; createdAt: string };
  messages: ConversationMessage[];
};

// ---------- PATCH /api/projects/:id/config ----------

export const updateConfigRequestSchema = widgetConfigSchema
  .partial()
  .refine((v) => Object.keys(v).length > 0, {
    message: "Send at least one field",
  });
export type UpdateConfigRequest = z.infer<typeof updateConfigRequestSchema>;
export type UpdateConfigResponse = { config: WidgetConfigResponse };

// ---------- GET /api/posthog-config ----------

export type PosthogConfigResponse = { key: string; host: string };
