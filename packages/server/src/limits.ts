/** Max decoded image size stored under project assets/. */
export const MAX_ASSET_BYTES = 8 * 1024 * 1024;

/** Max decoded font file size. */
export const MAX_FONT_BYTES = 8 * 1024 * 1024;

/** Max decoded text fixture/template upload. */
export const MAX_TEXT_UPLOAD_BYTES = 2 * 1024 * 1024;

/**
 * Fastify `bodyLimit` for JSON bodies with base64 file payloads (~37% larger than raw bytes).
 */
export const HTTP_BODY_LIMIT_BYTES = 16 * 1024 * 1024;
