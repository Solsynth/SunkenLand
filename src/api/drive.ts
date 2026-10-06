import { ApiClient, getApiClient } from "./client";
import { snFileAttachmentSchema, type SnFileAttachment } from "./schemas/posts";

/**
 * Drive API — metadata for a Solian drive file id.
 *
 * Files are addressed by id everywhere on the wire (`publisher.picture`,
 * `post.attachments`, markdown `solian://files/{id}` links); the bytes come
 * from `GET /drive/files/{id}`. Rendering one therefore needs its metadata —
 * name, MIME type, `fileMeta.width/height`, `fileMeta.blurhash` — which is what
 * this module wraps, so `sk-media` can render a bare file id without going
 * through a post.
 *
 * Public read: no token required, so embedded widgets resolve files for
 * anonymous visitors. (The info payload carries more than a post attachment —
 * size, status, storage URL — and the schema keeps the file-reference subset
 * the elements render.)
 */
export class DriveApi {
  constructor(private readonly client: ApiClient = getApiClient()) {}

  /** `GET /drive/files/{id}/info` — a file reference for the given id. */
  fetchFileInfo(fileId: string): Promise<SnFileAttachment> {
    return this.client.request<SnFileAttachment>(
      `/drive/files/${encodeURIComponent(fileId)}/info`,
      { auth: false, schema: snFileAttachmentSchema },
    );
  }
}

export const driveApi = new DriveApi();
