import { createFileRoute } from "@tanstack/react-router";

import { CustomerPasswordPage } from "@/components/shopify/CustomerPasswordPage";
import { activateShopifyCustomer } from "@/lib/api/shopify.functions";

export const Route = createFileRoute("/account_/activate/$id/$token")({
  head: () => ({
    meta: [
      { title: "Activate Account | Spares Automation" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: ActivateAccountPage,
});

function ActivateAccountPage() {
  const { id, token } = Route.useParams();

  return (
    <CustomerPasswordPage
      mode="activate"
      onSubmit={async (password) => {
        const response = await activateShopifyCustomer({
          data: { customerId: id, activationToken: token, password },
        });
        return { complete: response.activated, errors: response.errors };
      }}
    />
  );
}
