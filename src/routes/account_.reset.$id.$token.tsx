import { createFileRoute } from "@tanstack/react-router";

import { CustomerPasswordPage } from "@/components/shopify/CustomerPasswordPage";
import { resetShopifyCustomerPassword } from "@/lib/api/shopify.functions";

export const Route = createFileRoute("/account_/reset/$id/$token")({
  head: () => ({
    meta: [
      { title: "Reset Password | Spares Automation" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const { id, token } = Route.useParams();

  return (
    <CustomerPasswordPage
      mode="reset"
      onSubmit={async (password) => {
        const response = await resetShopifyCustomerPassword({
          data: { customerId: id, resetToken: token, password },
        });
        return { complete: response.reset, errors: response.errors };
      }}
    />
  );
}
