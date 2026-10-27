import { createHmac, timingSafeEqual } from "node:crypto";

export function verifyShopifyWebhook(
  rawBody: string,
  providedSignature: string | null,
  secret: string,
): boolean {
  if (!providedSignature || !secret) return false;
  try {
    const provided = Buffer.from(providedSignature, "base64");
    const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest();
    return provided.length === expected.length && timingSafeEqual(provided, expected);
  } catch {
    return false;
  }
}

export function normalizeShopDomain(value: string | null | undefined): string {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/$/, "");
}
