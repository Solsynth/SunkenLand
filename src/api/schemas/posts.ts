import { z } from "zod";
import { snId, snTimestamp } from "./common";
// Posts embed their author's account, whose profile carries the username
// colour and the Stellar tier that gates it.
import { snPerkSubscriptionSchema, snUsernameColorSchema } from "./account";

/**
 * Post / reply schemas for the Sphere data API.
 *
 * Ported from FloatLand's `app/types/post.ts` and consumed as camelCase (the
 * client snake→camelizes wire payloads before validation). Only the shapes the
 * reply list needs are modeled: posts with publishers, attachments, tags, and
 * recursive replied/forwarded post references.
 */

/** Attachment file metadata. */
export const snFileAttachmentSchema = z.object({
  id: snId,
  name: z.string(),
  // The wire sends `null` for files without a public URL (e.g. publisher
  // avatars/backgrounds before a CDN URL is resolved) — not just omission.
  url: z.string().nullable().optional(),
  mimeType: z.string(),
  hasCompression: z.boolean(),
  hasThumbnail: z.boolean(),
  fileMeta: z.record(z.string(), z.unknown()),
});
export type SnFileAttachment = z.infer<typeof snFileAttachmentSchema>;

/** Author account embedded in a publisher. */
export const snPostAccountSchema = z.object({
  id: snId,
  name: z.string(),
  nick: z.string().nullable(),
  profile: z
    .object({
      id: snId,
      firstName: z.string().nullable(),
      lastName: z.string().nullable(),
      bio: z.string().nullable(),
      picture: snFileAttachmentSchema.nullable(),
      background: snFileAttachmentSchema.nullable(),
      // Present on real payloads; what makes an embedded name colourful.
      usernameColor: snUsernameColorSchema.nullable().optional(),
    })
    .nullable(),
  // Also present on the embedded account: the colour gate and the bot mark
  // both live here, so a post/reply payload alone can style the name.
  automatedId: z.string().nullable().optional(),
  perkSubscription: snPerkSubscriptionSchema.nullable().optional(),
});

/** Post publisher (author). */
export const snPublisherSchema = z.object({
  id: snId,
  name: z.string(),
  nick: z.string().nullable(),
  bio: z.string().nullable(),
  picture: snFileAttachmentSchema.nullable(),
  background: snFileAttachmentSchema.nullable(),
  verification: z
    .object({
      type: z.number(),
      title: z.string().nullable(),
      description: z.string().nullable(),
      verifiedBy: z.string().nullable(),
    })
    .nullable(),
  account: snPostAccountSchema.nullable(),
  stat: z
    .object({
      totalPosts: z.number(),
      totalSubscribers: z.number(),
      totalViews: z.number(),
    })
    .nullable()
    .optional(),
  createdAt: snTimestamp,
});
export type SnPublisher = z.infer<typeof snPublisherSchema>;

/** Post tag. */
export const snTagSchema = z.object({
  id: snId,
  slug: z.string(),
  // Tags created by auto-tagging carry no curated name — the wire sends
  // `null`, not an omission.
  name: z.string().nullable(),
});

const snPostBaseSchema = z.object({
  id: snId,
  title: z.string().nullable(),
  description: z.string().nullable(),
  content: z.string(),
  contentType: z.number(),
  publishedAt: snTimestamp,
  visibility: z.number(),
  boostCount: z.number(),
  upvotes: z.number(),
  downvotes: z.number(),
  repliesCount: z.number(),
  reactionsCount: z.record(z.string(), z.number()),
  reactionsMade: z.record(z.string(), z.boolean()).nullable(),
  viewsUnique: z.number(),
  viewsTotal: z.number(),
  isTruncated: z.boolean(),
  // The wire sends `null` when the author's publisher row is gone (deleted
  // account) or the post is federated (`publisher_id` empty) — the backend
  // loads the embedded publisher best-effort and leaves the property null.
  // The elements already fall back to "Unknown" (`getDisplayName`), so accept
  // it instead of failing the whole reply list.
  publisher: snPublisherSchema.nullable(),
  attachments: z.array(snFileAttachmentSchema),
  tags: z.array(snTagSchema),
  // Both spellings have appeared on the wire; keep the union optional.
  meta: z.record(z.string(), z.unknown()).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  resourceIdentifier: z.string(),
  createdAt: snTimestamp,
  editedAt: snTimestamp.nullable(),
  updatedAt: snTimestamp,
  type: z.number().optional(),
});

export interface SnPost extends z.infer<typeof snPostBaseSchema> {
  /** Reply that this post replies to (recursive). */
  repliedPost: SnPost | null;
  /** Post that this post forwards (recursive). */
  forwardedPost: SnPost | null;
}

/**
 * A post or reply. `repliedPost` / `forwardedPost` are self-referential, so
 * the schema is recursive via `z.lazy`.
 */
export const snPostSchema: z.ZodType<SnPost> = snPostBaseSchema.extend({
  repliedPost: z.lazy(() => snPostSchema.nullable()),
  forwardedPost: z.lazy(() => snPostSchema.nullable()),
});

export type ThreadedReplyNode = z.infer<typeof snThreadedReplyNodeSchema>;

/**
 * One node of the threaded replies tree: the reply post plus its indentation
 * depth and parent post id. Wire shape is `{ post, depth, parent_id }`.
 */
export const snThreadedReplyNodeSchema = z.object({
  post: snPostSchema,
  depth: z.number().default(0),
  parentId: z.string().nullable().default(null),
});

/**
 * Payload for `POST /sphere/posts?pub=<publisher>` (creating a post or
 * reply). camelCase — the client serializes to snake_case on the wire
 * (`repliedPostId` → `replied_post_id`, etc.). Ported from FloatLand's
 * ComposeDialog payload.
 */
export const createPostPayloadSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  content: z.string().min(1),
  visibility: z.number().int().default(0),
  language: z.string().optional(),
  tags: z.array(z.string()).optional(),
  categories: z.array(z.string()).optional(),
  attachments: z.array(z.string()).optional(),
  type: z.number().int().optional(),
  slug: z.string().optional(),
  realmId: z.string().optional(),
  /** Parent post id — present on replies. */
  repliedPostId: z.string().optional(),
  forwardedPostId: z.string().optional(),
});
export type CreatePostPayload = z.infer<typeof createPostPayloadSchema>;

/** Reaction summary on a post (`GET /sphere/posts/{id}/reactions`). */
export const snReactionSchema = z.object({
  symbol: z.string(),
  attitude: z.number(),
  count: z.number(),
});
export type SnReaction = z.infer<typeof snReactionSchema>;

/** One account's reaction on a post (list endpoint items). */
export const snPostReactionSchema = z.object({
  id: snId,
  postId: z.string(),
  symbol: z.string(),
  attitude: z.number(),
  accountId: z.string().optional(),
  actorId: z.string().optional(),
  account: z
    .object({
      id: snId,
      name: z.string(),
      nick: z.string().nullable().optional(),
      profile: z
        .object({ picture: z.object({ id: z.string() }).optional() })
        .optional(),
    })
    .optional(),
  createdAt: snTimestamp,
});
export type SnPostReaction = z.infer<typeof snPostReactionSchema>;
