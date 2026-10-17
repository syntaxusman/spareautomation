import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2, Eye, EyeOff, Loader2 } from "lucide-react";
import { useState, type FormEvent } from "react";

import { SiteFooter } from "@/components/shopify/SiteFooter";
import { SiteHeader } from "@/components/shopify/SiteHeader";
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
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");

    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    const confirmation = String(form.get("passwordConfirmation") ?? "");

    if (password !== confirmation) {
      setError("The passwords do not match.");
      setBusy(false);
      return;
    }

    try {
      const response = await resetShopifyCustomerPassword({
        data: { customerId: id, resetToken: token, password },
      });

      if (!response.reset || response.errors.length) {
        setError(
          response.errors.map((item) => item.message).join(" ") ||
            "This password-reset link is invalid or has expired.",
        );
        return;
      }

      setComplete(true);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Your password could not be reset. Please request a new link.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-background text-ink">
      <SiteHeader />
      <main id="main-content" className="mx-auto max-w-[680px] px-4 py-8 md:px-6 md:py-20">
        <section className="border border-rule bg-surface p-6 md:p-9">
          <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-ink-muted">
            Customer account
          </div>
          <h1 className="mt-3 font-display text-3xl font-extrabold uppercase tracking-tight">
            Reset password
          </h1>

          {complete ? (
            <div className="mt-7">
              <p
                role="status"
                className="flex items-start gap-2 border border-accent/40 bg-accent/10 p-4 text-sm leading-6 text-ink"
              >
                <CheckCircle2 aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                Your password has been reset and you are signed in.
              </p>
              <Link
                to="/account"
                className="mt-5 inline-flex h-12 items-center justify-center bg-accent px-6 font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-white"
              >
                Go to my account
              </Link>
            </div>
          ) : (
            <form onSubmit={submit} className="mt-7 grid gap-4">
              <PasswordInput
                label="New password"
                name="password"
                visible={showPassword}
                onToggle={() => setShowPassword((current) => !current)}
              />
              <PasswordInput
                label="Confirm new password"
                name="passwordConfirmation"
                visible={showPassword}
                onToggle={() => setShowPassword((current) => !current)}
              />

              {error ? (
                <p
                  role="alert"
                  className="border border-red-300 bg-red-50 p-3 text-sm text-red-800"
                >
                  {error}
                </p>
              ) : null}

              <button
                disabled={busy}
                className="inline-flex h-12 items-center justify-center gap-2 bg-accent px-6 font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-white disabled:opacity-60"
              >
                {busy ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : null}
                Set new password
              </button>
              <Link to="/login" className="text-sm font-semibold text-accent hover:underline">
                Return to sign in
              </Link>
            </form>
          )}
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}

function PasswordInput({
  label,
  name,
  visible,
  onToggle,
}: {
  label: string;
  name: string;
  visible: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="grid gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-ink-muted">
      <label htmlFor={name}>{label}</label>
      <span className="relative block">
        <input
          id={name}
          name={name}
          type={visible ? "text" : "password"}
          autoComplete="new-password"
          minLength={8}
          maxLength={72}
          required
          className="h-12 w-full border border-rule bg-background px-4 pr-12 font-sans text-base normal-case tracking-normal text-ink focus:border-accent focus:outline-none sm:text-sm"
        />
        <button
          type="button"
          onClick={onToggle}
          aria-label={visible ? "Hide passwords" : "Show passwords"}
          aria-pressed={visible}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink"
        >
          {visible ? (
            <EyeOff aria-hidden="true" className="h-5 w-5" />
          ) : (
            <Eye aria-hidden="true" className="h-5 w-5" />
          )}
        </button>
      </span>
    </div>
  );
}
