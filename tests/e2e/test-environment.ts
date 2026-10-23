import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

function localEnvironment(): Record<string, string> {
  const envPath = path.resolve(process.cwd(), ".env");
  if (!existsSync(envPath)) return {};

  return Object.fromEntries(
    readFileSync(envPath, "utf8")
      .split(/\r?\n/)
      .filter((line) => line && !line.trimStart().startsWith("#") && line.includes("="))
      .map((line) => {
        const separator = line.indexOf("=");
        return [line.slice(0, separator), line.slice(separator + 1)];
      }),
  );
}

const fileEnvironment = localEnvironment();
const environmentValue = (name: string) =>
  process.env[name] || (!process.env.CI ? fileEnvironment[name] : undefined);

export const shopifyE2EConfigured = Boolean(
  environmentValue("SHOPIFY_STORE_DOMAIN") &&
    (environmentValue("SHOPIFY_STOREFRONT_ACCESS_TOKEN") ||
      environmentValue("SHOPIFY_STOREFRONT_PRIVATE_ACCESS_TOKEN")),
);
