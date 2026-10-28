import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

import { eq } from "drizzle-orm";

import { getServerConfig } from "../config.server";
import { getDb } from "../db/index.server";
import { shopifyAppInstallations } from "../db/schema";
import { normalizeShopDomain } from "./webhook.server";

const TOKEN_FORMAT = "v1";
let cachedInstallation: { shopDomain: string; token: string } | null = null;

function encryptionKey() {
  const secret = getServerConfig().appSessionSecret;
  if (!secret) throw new Error("APP_SESSION_SECRET is required to protect Shopify credentials.");
  return createHash("sha256").update(secret).digest();
}

function encryptAccessToken(token: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [TOKEN_FORMAT, iv, tag, encrypted]
    .map((value) => (typeof value === "string" ? value : value.toString("base64url")))
    .join(":");
}

function decryptAccessToken(value: string) {
  const [version, ivValue, tagValue, encryptedValue] = value.split(":");
  if (version !== TOKEN_FORMAT || !ivValue || !tagValue || !encryptedValue) {
    throw new Error("The stored Shopify credential has an unsupported format.");
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(ivValue, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export async function getInstalledAdminAccessToken(shop: string) {
  const shopDomain = normalizeShopDomain(shop);
  if (!shopDomain) return null;
  if (cachedInstallation?.shopDomain === shopDomain) return cachedInstallation.token;

  const [installation] = await getDb()
    .select({ encryptedAccessToken: shopifyAppInstallations.encryptedAccessToken })
    .from(shopifyAppInstallations)
    .where(eq(shopifyAppInstallations.shopDomain, shopDomain))
    .limit(1);
  if (!installation) return null;

  const token = decryptAccessToken(installation.encryptedAccessToken);
  cachedInstallation = { shopDomain, token };
  return token;
}

export async function saveInstalledAdminAccessToken(
  shop: string,
  token: string,
  scopes: string,
) {
  const shopDomain = normalizeShopDomain(shop);
  if (!shopDomain) throw new Error("Shopify returned an invalid shop domain.");
  const encryptedAccessToken = encryptAccessToken(token);
  const now = new Date();

  await getDb()
    .insert(shopifyAppInstallations)
    .values({ shopDomain, encryptedAccessToken, scopes, installedAt: now, updatedAt: now })
    .onConflictDoUpdate({
      target: shopifyAppInstallations.shopDomain,
      set: { encryptedAccessToken, scopes, updatedAt: now },
    });
  cachedInstallation = { shopDomain, token };
}

export function clearInstalledAdminTokenCache(shop: string) {
  const shopDomain = normalizeShopDomain(shop);
  if (cachedInstallation?.shopDomain === shopDomain) cachedInstallation = null;
}
