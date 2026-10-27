import { createFileRoute, redirect } from "@tanstack/react-router";
import { ExternalLink, Mail, RefreshCw, Search, Send } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { CmsShell } from "@/components/admin/CmsShell";
import {
  EmptyState,
  formatDateTime,
  Notice,
  Pill,
  SectionCard,
  Spinner,
} from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getAdminSession } from "@/lib/admin/admin.functions";
import { listQuotes, sendQuoteEmail } from "@/lib/admin/commerce.functions";
import { cmsHead } from "@/lib/admin/head";
import { moneyAmount } from "@/lib/shopify/commerce";

type Quote = Awaited<ReturnType<typeof listQuotes>>[number];

export const Route = createFileRoute("/admin/quotes")({
  head: () => cmsHead("Quotations"),
  loader: async () => {
    const staff = await getAdminSession();
    if (!staff) throw redirect({ to: "/admin/login" });
    if (staff.mustChangePassword) throw redirect({ to: "/admin/change-password" });
    try {
      return { staff, quotes: await listQuotes({ data: { search: "" } }), error: "" };
    } catch (error) {
      return {
        staff,
        quotes: [] as Quote[],
        error: error instanceof Error ? error.message : "Shopify quotations are unavailable.",
      };
    }
  },
  component: QuotesPage,
});

function QuotesPage() {
  const loaded = Route.useLoaderData();
  const [quotes, setQuotes] = useState(loaded.quotes);
  const [error, setError] = useState(loaded.error);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<Quote | null>(null);

  const counts = useMemo(
    () => ({
      open: quotes.filter((quote) => quote.status === "OPEN").length,
      sent: quotes.filter((quote) => quote.status === "INVOICE_SENT").length,
      completed: quotes.filter((quote) => quote.status === "COMPLETED").length,
    }),
    [quotes],
  );

  async function refresh(search = query) {
    setBusy(true);
    setError("");
    try {
      setQuotes(await listQuotes({ data: { search } }));
    } catch (refreshError) {
      setError(
        refreshError instanceof Error
          ? refreshError.message
          : "Shopify quotations are unavailable.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <CmsShell
      staff={loaded.staff}
      title="Quotations"
      subtitle="Review Shopify draft orders and send the branded quotation email with its secure checkout link. Website quote requests appear here automatically."
      actions={
        <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={busy}>
          <RefreshCw className={busy ? "animate-spin" : ""} /> Refresh
        </Button>
      }
    >
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Summary label="Awaiting email" value={counts.open} />
        <Summary label="Email sent" value={counts.sent} />
        <Summary label="Converted to order" value={counts.completed} />
      </div>

      <form
        className="mb-4 flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void refresh();
        }}
      >
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Customer, email, reference or Shopify search…"
            aria-label="Search quotations"
            className="pl-8"
          />
        </div>
        <Button type="submit" variant="outline" disabled={busy}>
          {busy ? <Spinner /> : <Search />} Search
        </Button>
      </form>

      {error ? (
        <Notice tone="danger" title="Shopify quotations could not be loaded">
          {error}
        </Notice>
      ) : quotes.length === 0 ? (
        <EmptyState
          icon={<Mail />}
          title="No quotations found"
          copy="Customer quote requests create Shopify draft orders. Clear the search or submit a test quote from the storefront."
        />
      ) : (
        <div className="space-y-3">
          {quotes.map((quote) => (
            <SectionCard key={quote.id}>
              <article className="p-4">
                <div className="flex flex-wrap items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-sm font-semibold">{quote.name}</h2>
                      <QuoteStatus status={quote.status} />
                      {quote.tags.includes("Website quote request") ? (
                        <Pill tone="info">Website request</Pill>
                      ) : null}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {[quote.customerName, quote.company, quote.email]
                        .filter(Boolean)
                        .join(" · ") || "No customer details"}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-base font-semibold tabular-nums">
                      {moneyAmount(quote.total.amount, quote.total.currencyCode)}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      Updated {formatDateTime(quote.updatedAt)}
                    </p>
                  </div>
                </div>

                <ul className="mt-3 divide-y rounded-md border bg-muted/20">
                  {quote.lines.map((line, index) => (
                    <li
                      key={`${line.sku ?? line.name}-${index}`}
                      className="flex gap-3 px-3 py-2 text-xs"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="font-medium">{line.name}</span>
                        {line.sku ? (
                          <span className="ml-2 font-mono text-muted-foreground">{line.sku}</span>
                        ) : null}
                      </span>
                      <span className="shrink-0 text-muted-foreground">× {line.quantity}</span>
                      <span className="w-24 shrink-0 text-right font-medium tabular-nums">
                        {moneyAmount(line.total.amount, line.total.currencyCode)}
                      </span>
                    </li>
                  ))}
                </ul>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    onClick={() => setSelected(quote)}
                    disabled={!quote.email || quote.status === "COMPLETED"}
                  >
                    <Send /> {quote.invoiceSentAt ? "Resend quotation" : "Send quotation"}
                  </Button>
                  {quote.invoiceUrl ? (
                    <Button size="sm" variant="outline" asChild>
                      <a href={quote.invoiceUrl} target="_blank" rel="noreferrer">
                        <ExternalLink /> Preview checkout
                      </a>
                    </Button>
                  ) : null}
                  {quote.invoiceSentAt ? (
                    <span className="text-xs text-muted-foreground">
                      Last sent {formatDateTime(quote.invoiceSentAt)}
                    </span>
                  ) : null}
                  {!quote.email ? (
                    <span className="text-xs text-destructive">
                      Add an email to this draft in Shopify first.
                    </span>
                  ) : null}
                </div>
              </article>
            </SectionCard>
          ))}
        </div>
      )}

      <SendQuoteDialog
        quote={selected}
        onOpenChange={(open) => !open && setSelected(null)}
        onSent={async () => {
          setSelected(null);
          await refresh();
        }}
      />
    </CmsShell>
  );
}

function Summary({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function QuoteStatus({ status }: { status: Quote["status"] }) {
  if (status === "COMPLETED")
    return (
      <Pill tone="success" dot>
        Completed
      </Pill>
    );
  if (status === "INVOICE_SENT")
    return (
      <Pill tone="accent" dot>
        Email sent
      </Pill>
    );
  return (
    <Pill tone="warning" dot>
      Open
    </Pill>
  );
}

function SendQuoteDialog({
  quote,
  onOpenChange,
  onSent,
}: {
  quote: Quote | null;
  onOpenChange: (open: boolean) => void;
  onSent: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");

  const open = Boolean(quote);
  const initializedTo = quote?.email ?? "";
  const initializedSubject = quote ? `Your Spares Automation quotation ${quote.name}` : "";
  const initializedMessage = quote
    ? `Hello${quote.customerName ? ` ${quote.customerName}` : ""},\n\nThank you for your enquiry. Please find your quotation below. Use the secure link in this email to review the items and complete payment when you are ready.\n\nIf you have any questions, reply to this email and our team will help.`
    : "";

  useEffect(() => {
    if (!quote) return;
    setTo(initializedTo);
    setSubject(initializedSubject);
    setMessage(initializedMessage);
  }, [quote, initializedMessage, initializedSubject, initializedTo]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Send quotation {quote?.name}</DialogTitle>
          <DialogDescription>
            Shopify sends the secure checkout link using the store’s branded draft-order invoice
            template.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="quote-to">Recipient</Label>
            <Input
              id="quote-to"
              type="email"
              value={to}
              onChange={(event) => setTo(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="quote-subject">Subject</Label>
            <Input
              id="quote-subject"
              value={subject}
              maxLength={200}
              onChange={(event) => setSubject(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="quote-message">Message</Label>
            <Textarea
              id="quote-message"
              rows={8}
              value={message}
              maxLength={2000}
              onChange={(event) => setMessage(event.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button
            disabled={busy || !quote}
            onClick={async () => {
              if (!quote) return;
              setBusy(true);
              try {
                await sendQuoteEmail({
                  data: {
                    id: quote.id,
                    to,
                    subject,
                    message,
                  },
                });
                toast.success(`Quotation ${quote.name} sent`);
                await onSent();
              } catch (error) {
                toast.error("Quotation not sent", {
                  description:
                    error instanceof Error ? error.message : "Shopify rejected the email.",
                });
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? <Spinner /> : <Send />} Send quotation
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
