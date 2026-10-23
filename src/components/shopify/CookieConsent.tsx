import { Link } from "@tanstack/react-router";
import { Cookie, Settings2, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { useContent } from "@/lib/content/ContentContext";

const CONSENT_KEY = "spares-automation-cookie-consent-v1";

type ConsentPreferences = {
  necessary: true;
  analytics: boolean;
  marketing: boolean;
};

const DEFAULT_PREFERENCES: ConsentPreferences = {
  necessary: true,
  analytics: false,
  marketing: false,
};

export function CookieConsent() {
  const { messages } = useContent();
  const [visible, setVisible] = useState(false);
  const [showPreferences, setShowPreferences] = useState(false);
  const [preferences, setPreferences] = useState(DEFAULT_PREFERENCES);

  useEffect(() => {
    try {
      const savedConsent = window.localStorage.getItem(CONSENT_KEY);
      if (savedConsent === null) {
        setVisible(true);
      } else {
        const savedPreferences = JSON.parse(savedConsent) as Partial<ConsentPreferences>;
        setPreferences({
          necessary: true,
          analytics: savedPreferences.analytics === true,
          marketing: savedPreferences.marketing === true,
        });
      }
    } catch {
      setVisible(true);
    }

    function openPreferences() {
      setShowPreferences(true);
      setVisible(true);
    }

    window.addEventListener("open-cookie-preferences", openPreferences);
    return () => window.removeEventListener("open-cookie-preferences", openPreferences);
  }, []);

  function save(nextPreferences: ConsentPreferences) {
    try {
      window.localStorage.setItem(
        CONSENT_KEY,
        JSON.stringify({ ...nextPreferences, savedAt: new Date().toISOString() }),
      );
    } catch {
      // Consent still applies to this page view if browser storage is unavailable.
    }

    window.dispatchEvent(new CustomEvent("cookie-consent-updated", { detail: nextPreferences }));
    setPreferences(nextPreferences);
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <section
      aria-label="Cookie preferences"
      className="fixed inset-x-2 bottom-2 z-[100] mx-auto max-h-[calc(100dvh-1rem)] max-w-5xl overflow-y-auto border border-white/15 bg-charcoal-deep text-white shadow-2xl shadow-black/30 md:inset-x-6 md:bottom-6"
    >
      <div className="px-4 py-3.5 md:p-6">
        <div className="flex items-start gap-3 md:gap-4">
          <span className="hidden h-11 w-11 shrink-0 items-center justify-center bg-accent/15 text-accent sm:flex">
            <Cookie aria-hidden="true" className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.24em] text-accent">
              {messages["cookie.eyebrow"]}
            </p>
            <h2 className="mt-1 font-display text-lg font-bold uppercase tracking-tight sm:text-xl md:mt-2">
              {messages["cookie.title"]}
            </h2>
            <p className="mt-1 max-w-3xl text-[13px] leading-5 text-white/70 md:mt-2 md:text-sm md:leading-6">
              {messages["cookie.copy"]}{" "}
              <Link
                to="/cookies"
                className="font-semibold text-white underline underline-offset-4 hover:text-accent"
              >
                {messages["cookie.link"]}
              </Link>
              .
            </p>
          </div>
        </div>

        {showPreferences ? (
          <div
            id="cookie-preferences"
            className="mt-4 grid gap-px border border-white/15 bg-white/15 md:mt-5 md:grid-cols-3"
          >
            <PreferenceCard
              icon={<ShieldCheck aria-hidden="true" className="h-4 w-4" />}
              title={messages["cookie.necessary"]}
              description={messages["cookie.necessaryCopy"]}
              checked
              disabled
              onChange={() => undefined}
            />
            <PreferenceCard
              title={messages["cookie.analytics"]}
              description={messages["cookie.analyticsCopy"]}
              checked={preferences.analytics}
              onChange={(analytics) => setPreferences((current) => ({ ...current, analytics }))}
            />
            <PreferenceCard
              title={messages["cookie.marketing"]}
              description={messages["cookie.marketingCopy"]}
              checked={preferences.marketing}
              onChange={(marketing) => setPreferences((current) => ({ ...current, marketing }))}
            />
          </div>
        ) : null}

        <div className="mt-4 grid grid-cols-2 gap-2 sm:mt-5 sm:flex sm:flex-wrap sm:justify-end">
          <button
            type="button"
            aria-expanded={showPreferences}
            aria-controls="cookie-preferences"
            onClick={() => setShowPreferences((current) => !current)}
            className="col-span-2 inline-flex h-11 w-full items-center justify-center gap-2 border border-white/25 px-4 font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-white hover:border-white sm:w-auto"
          >
            <Settings2 aria-hidden="true" className="h-4 w-4" />
            {showPreferences ? messages["cookie.hide"] : messages["cookie.manage"]}
          </button>
          <button
            type="button"
            onClick={() => save(DEFAULT_PREFERENCES)}
            className="inline-flex h-11 w-full items-center justify-center border border-white/25 px-4 font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-white hover:border-white sm:w-auto"
          >
            {messages["cookie.reject"]}
          </button>
          <button
            type="button"
            onClick={() => save({ necessary: true, analytics: true, marketing: true })}
            className="inline-flex h-11 w-full items-center justify-center bg-accent px-4 font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-white hover:brightness-110 sm:w-auto"
          >
            {messages["cookie.accept"]}
          </button>
          {showPreferences ? (
            <button
              type="button"
              onClick={() => save(preferences)}
              className="col-span-2 inline-flex h-11 w-full items-center justify-center bg-white px-4 font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-ink hover:bg-white/90 sm:w-auto"
            >
              {messages["cookie.save"]}
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function PreferenceCard({
  icon,
  title,
  description,
  checked,
  disabled = false,
  onChange,
}: {
  icon?: React.ReactNode;
  title: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 bg-charcoal-deep p-3 md:p-4">
      <span>
        <span className="flex items-center gap-2 font-display text-sm font-bold uppercase tracking-tight">
          {icon}
          {title}
        </span>
        <span className="mt-1 block text-xs leading-5 text-white/55">{description}</span>
      </span>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-1 h-4 w-4 shrink-0 accent-blue-500"
      />
    </label>
  );
}
