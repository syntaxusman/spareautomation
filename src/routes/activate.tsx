import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { CustomerPasswordPage } from "@/components/shopify/CustomerPasswordPage";
import { activateShopifyCustomerByUrl } from "@/lib/api/shopify.functions";

export const Route = createFileRoute("/activate")({
  validateSearch: z.object({ activation_url: z.string().optional().catch(undefined) }),
  head: () => ({
    meta: [
      { title: "Activate Account | Spares Automation" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: ActivateAccountPage,
});

function ActivateAccountPage() {
  const { activation_url: activationUrl } = Route.useSearch();

  return (
    <CustomerPasswordPage
      mode="activate"
      unavailableMessage={
        activationUrl ? undefined : "This activation link is incomplete or invalid."
      }
      onSubmit={async (password) => {
        if (!activationUrl) return { complete: false, errors: [] };
        const response = await activateShopifyCustomerByUrl({
          data: { activationUrl, password },
        });
        return { complete: response.activated, errors: response.errors };
      }}
    />
  );
}
