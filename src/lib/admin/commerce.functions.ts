import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireAdminRole, requireStaff } from "./auth.server";
import { writeAdminAudit } from "./audit.server";
import { getDb } from "../db/index.server";
import {
  applyPricePreview,
  buildPricePreview,
  listAdminQuotes,
  listProductsForPriceSelection,
  sendAdminQuoteEmail,
} from "../shopify/commerce.server";
import { MAX_PRICE_PERCENTAGE, MIN_PRICE_PERCENTAGE } from "../shopify/commerce";

export const listQuotes = createServerFn({ method: "GET" })
  .inputValidator(z.object({ search: z.string().trim().max(160).default("") }))
  .handler(async ({ data }) => {
    await requireStaff();
    return listAdminQuotes(data.search);
  });

export const sendQuoteEmail = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      id: z.string().regex(/^gid:\/\/shopify\/DraftOrder\/\d+$/),
      to: z.string().trim().email().max(254),
      subject: z.string().trim().min(1).max(200),
      message: z.string().trim().min(1).max(2_000),
    }),
  )
  .handler(async ({ data }) => {
    const staff = await requireStaff();
    const sent = await sendAdminQuoteEmail(data);
    try {
      await writeAdminAudit(getDb(), {
        staffId: staff.id,
        action: "quote.email_sent",
        targetType: "shopify_draft_order",
        targetId: sent.id,
        details: { reference: sent.name, recipient: data.to },
      });
    } catch (error) {
      // Shopify has already sent the message. An audit-log outage must not
      // report a false failure and encourage staff to send it twice.
      console.error("[commerce] Quote email sent but audit logging failed:", error);
    }
    return { ok: true, invoiceSentAt: sent.invoiceSentAt };
  });

const productId = z.string().regex(/^gid:\/\/shopify\/Product\/\d+$/);

const priceInput = z.object({
  productIds: z.array(productId).min(1, "Select at least one product.").max(10_000),
  percentage: z.coerce
    .number()
    .min(MIN_PRICE_PERCENTAGE)
    .max(MAX_PRICE_PERCENTAGE)
    .refine((value) => value !== 0, "Enter a percentage other than zero."),
});

export const listPricingProducts = createServerFn({ method: "GET" }).handler(async () => {
  await requireAdminRole();
  return listProductsForPriceSelection();
});

export const previewBulkPriceUpdate = createServerFn({ method: "POST" })
  .inputValidator(priceInput)
  .handler(async ({ data }) => {
    await requireAdminRole();
    return buildPricePreview(data.productIds, data.percentage);
  });

export const applyBulkPriceUpdate = createServerFn({ method: "POST" })
  .inputValidator(
    priceInput.extend({
      expectedVariantCount: z.number().int().min(1).max(5_000),
      expectedFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
      confirmation: z.string().max(80),
    }),
  )
  .handler(async ({ data }) => {
    const staff = await requireAdminRole();
    const expectedConfirmation = `UPDATE ${data.expectedVariantCount} PRICES`;
    if (data.confirmation !== expectedConfirmation) {
      throw new Error(`Type ${expectedConfirmation} to confirm this price update.`);
    }

    // Re-query immediately before mutation so stale browser previews never
    // overwrite a newer Shopify price with an old calculation.
    const preview = await buildPricePreview(data.productIds, data.percentage);
    if (preview.variantCount !== data.expectedVariantCount) {
      throw new Error(
        `The selection changed from ${data.expectedVariantCount} to ${preview.variantCount} variants. Preview it again before applying prices.`,
      );
    }
    if (preview.fingerprint !== data.expectedFingerprint) {
      throw new Error(
        "One or more selected products or prices changed after the preview. Preview again before applying prices.",
      );
    }

    let result: Awaited<ReturnType<typeof applyPricePreview>>;
    try {
      result = await applyPricePreview(preview);
    } catch (error) {
      try {
        await writeAdminAudit(getDb(), {
          staffId: staff.id,
          action: "catalogue.bulk_price_failed",
          targetType: "shopify_product_variant",
          targetId: `${preview.variantCount}-variants`,
          details: {
            selectedProductCount: preview.productIds.length,
            selectedProductIds: preview.productIds.slice(0, 250),
            productIdsTruncated: preview.productIds.length > 250,
            percentage: preview.percentage,
            error: error instanceof Error ? error.message.slice(0, 1_000) : "Unknown error",
          },
        });
      } catch (auditError) {
        console.error("[commerce] Price update and audit logging both failed:", auditError);
      }
      throw error;
    }

    try {
      await writeAdminAudit(getDb(), {
        staffId: staff.id,
        action: "catalogue.bulk_price_updated",
        targetType: "shopify_product_variant",
        targetId: `${result.updatedVariants}-variants`,
        details: {
          selectedProductCount: preview.productIds.length,
          selectedProductIds: preview.productIds.slice(0, 250),
          productIdsTruncated: preview.productIds.length > 250,
          percentage: preview.percentage,
          productCount: result.updatedProducts,
          variantCount: result.updatedVariants,
          skippedZeroPrices: preview.skippedZeroPrices,
        },
      });
    } catch (error) {
      console.error("[commerce] Prices updated but audit logging failed:", error);
    }
    return { ok: true, ...result };
  });
