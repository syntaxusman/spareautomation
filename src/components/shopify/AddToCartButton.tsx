import { ShoppingCart } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";

import { addToShopifyCart } from "@/lib/api/shopify.functions";
import { getStoredCartId, setStoredCartId } from "@/lib/shopify/cart";

type AddToCartButtonProps = {
  variantId: string;
  disabled?: boolean;
  quantity?: number;
  className?: string;
  children?: ReactNode;
};

export function AddToCartButton({
  variantId,
  disabled,
  quantity = 1,
  className,
  children,
}: AddToCartButtonProps) {
  const [status, setStatus] = useState<"idle" | "adding" | "added" | "error">("idle");

  return (
    <button
      type="button"
      aria-live="polite"
      disabled={disabled || status === "adding"}
      onClick={async () => {
        try {
          setStatus("adding");
          const cart = await addToShopifyCart({
            data: {
              cartId: getStoredCartId(),
              variantId,
              quantity,
            },
          });
          setStoredCartId(cart.id);
          window.dispatchEvent(new Event("shopify-cart-updated"));
          setStatus("added");
          window.setTimeout(() => setStatus("idle"), 1600);
        } catch (error) {
          console.error(error);
          setStatus("error");
          window.setTimeout(() => setStatus("idle"), 2200);
        }
      }}
      className={
        className ??
        "inline-flex h-11 items-center justify-center gap-2 bg-accent px-5 font-mono text-[10px] uppercase tracking-[0.22em] text-accent-foreground transition-colors hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50"
      }
    >
      <ShoppingCart aria-hidden="true" className="h-4 w-4" />
      {status === "adding"
        ? "Adding"
        : status === "added"
          ? "Added to cart"
          : status === "error"
            ? "Try Again"
            : (children ?? "Add to Cart")}
    </button>
  );
}
