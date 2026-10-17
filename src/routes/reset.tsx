import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { CustomerPasswordPage } from "@/components/shopify/CustomerPasswordPage";
import { resetShopifyCustomerPasswordByUrl } from "@/lib/api/shopify.functions";

export const Route = createFileRoute("/reset")({
  validateSearch: z.object({ reset_url: z.string().optional().catch(undefined) }),
  head: () => ({
    meta: [
      { title: "Reset Password | Spares Automation" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const { reset_url: resetUrl } = Route.useSearch();

  return (
    <CustomerPasswordPage
      mode="reset"
      unavailableMessage={
        resetUrl ? undefined : "This password-reset link is incomplete or invalid."
      }
      onSubmit={async (password) => {
        if (!resetUrl) return { complete: false, errors: [] };
        const response = await resetShopifyCustomerPasswordByUrl({
          data: { resetUrl, password },
        });
        return { complete: response.reset, errors: response.errors };
      }}
    />
  );
}
