import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, CheckCircle2, Eye, EyeOff, Loader2, UserPlus } from "lucide-react";
import { useState, type FormEvent } from "react";

import { SiteHeader } from "@/components/shopify/SiteHeader";
import { createShopifyCustomer } from "@/lib/api/shopify.functions";
import { useContent } from "@/lib/content/ContentContext";
import { useEditable } from "@/lib/content/edit-mode";
import { getPublishedContent } from "@/lib/content/content.functions";
import { contentPageHead } from "@/lib/seo";

export const Route = createFileRoute("/register")({
  loader: async () => {
    const { site, functional } = await getPublishedContent();
    return { site, seo: functional.register.seo };
  },
  head: ({ loaderData }) =>
    contentPageHead(loaderData?.seo, loaderData?.site, "/register", {
      title: "Create Account",
      description:
        "Create a Spares Automation trade account to track orders, build quotes, and apply for credit terms.",
    }, { noIndex: true }),
  component: RegisterPage,
});

type RegistrationResult = {
  status: "idle" | "success" | "error";
  message: string;
};

function normalizePhoneForShopify(countryCode: string, phone: string) {
  const cleaned = phone.replace(/[^\d+]/g, "");
  if (!cleaned) return "";

  const international = cleaned.startsWith("+")
    ? cleaned
    : `${countryCode}${cleaned.replace(/^0+/, "")}`;

  return /^\+[1-9]\d{6,14}$/.test(international) ? international : null;
}

function RegisterPage() {
  const navigate = useNavigate();
  const { functional } = useContent();
  const copy = functional.register;
  const edit = useEditable();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<RegistrationResult>({ status: "idle", message: "" });

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setBusy(true);
    setResult({ status: "idle", message: "" });

    const form = new FormData(formElement);

    if (form.get("acceptsLegal") !== "on") {
      setBusy(false);
      setResult({
        status: "error",
        message: "You must agree to the Terms & Conditions and acknowledge the Privacy Policy to create an account.",
      });
      return;
    }

    const phone = normalizePhoneForShopify(
      String(form.get("countryCode") ?? "+44"),
      String(form.get("phone") ?? ""),
    );

    if (phone === null) {
      setBusy(false);
      setResult({
        status: "error",
        message: "Enter a valid phone number with the correct country code.",
      });
      return;
    }

    try {
      const response = await createShopifyCustomer({
        data: {
          firstName: String(form.get("firstName") ?? ""),
          lastName: String(form.get("lastName") ?? ""),
          email: String(form.get("email") ?? ""),
          phone,
          password: String(form.get("password") ?? ""),
          acceptsMarketing: form.get("acceptsMarketing") === "on",
        },
      });

      if (response.errors.length) {
        setResult({
          status: "error",
          message: response.errors.map((error) => error.message).join(" "),
        });
        return;
      }

      if (response.activationRequired) {
        setResult({
          status: "success",
          message:
            "This account needs activation. We emailed you a secure link—open it to choose your password and finish here on Spares Automation.",
        });
        return;
      }

      if (!response.authenticated) {
        setResult({
          status: "error",
          message: "Your account was created, but we could not sign you in. Please try signing in.",
        });
        return;
      }

      setResult({
        status: "success",
        message: "Your account is ready and you are signed in.",
      });
      formElement.reset();
      await navigate({ to: "/account" });
    } catch (error) {
      setResult({
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "We could not create your account.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-background text-ink">
      <SiteHeader />

      <main id="main-content" className="mx-auto grid min-w-0 max-w-[1180px] gap-6 px-3 py-6 sm:px-4 sm:py-8 lg:grid-cols-[0.9fr_1.1fr] lg:gap-8 lg:px-6 lg:py-12">
        <section className="flex min-h-0 lg:min-h-[520px] min-w-0 flex-col justify-between border border-rule bg-charcoal p-5 text-white sm:p-6 md:p-8 lg:p-10">
          <div>
            <Link
              to="/"
              className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.22em] text-white/50 transition-colors hover:text-accent"
            >
              <ArrowLeft className="h-4 w-4" /> Back to home
            </Link>
            <div className="mt-6 md:mt-12 lg:mt-16 font-mono text-[10px] uppercase tracking-[0.3em] text-white/40" {...edit(`functional.register.eyebrow`, "Page eyebrow")}>
              {copy.eyebrow}
            </div>
            <h1 className="mt-4 font-display text-3xl md:text-4xl lg:text-5xl font-extrabold uppercase leading-none tracking-tight" {...edit(`functional.register.title`, "Page heading")}>
              {copy.title}
            </h1>
            {copy.intro ? (
              <p className="mt-4 md:mt-6 max-w-md text-sm leading-7 text-white/55" {...edit(`functional.register.intro`, "Introduction")}>
                {copy.intro}
              </p>
            ) : null}
          </div>

          <div className="grid gap-4 border-t border-white/10 pt-6 text-sm text-white/55">
            <div>Trade terms and pricing are confirmed by the sales desk</div>
            <div>Secure customer details for future purchases</div>
          </div>
        </section>

        <section className="min-w-0 border border-rule bg-surface p-4 sm:p-5 md:p-6 lg:p-8">
          <div className="mb-8 flex h-12 w-12 items-center justify-center bg-accent text-accent-foreground">
            <UserPlus className="h-5 w-5" />
          </div>
          <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-ink-muted" {...edit(`functional.register.sectionEyebrow`, "Section eyebrow")}>
            {copy.sectionEyebrow}
          </div>
          <h2 className="mt-2 font-display text-3xl font-extrabold uppercase tracking-tight" {...edit(`functional.register.sectionTitle`, "Section heading")}>
            {copy.sectionTitle}
          </h2>

          <form onSubmit={handleSubmit} className="mt-8 grid min-w-0 gap-5">
            <div className="grid gap-5 md:grid-cols-2">
              <Field label="First name" name="firstName" autoComplete="given-name" required />
              <Field label="Last name" name="lastName" autoComplete="family-name" required />
            </div>
            <Field label="Email address" name="email" type="email" autoComplete="email" required />
            <PhoneField />
            <PasswordField
              label="Password"
              name="password"
              autoComplete="new-password"
              minLength={8}
              showStrength={true}
              required
            />

            <label className="flex items-start gap-3 text-sm text-ink-muted">
              <input
                name="acceptsMarketing"
                type="checkbox"
                className="mt-1 h-4 w-4 accent-[hsl(var(--accent))]"
              />
              Send me updates about parts availability, trade offers and new arrivals.
            </label>

            <label className="flex items-start gap-3 text-sm leading-6 text-ink-muted">
              <input
                name="acceptsLegal"
                type="checkbox"
                required
                className="mt-1 h-4 w-4 shrink-0 accent-[hsl(var(--accent))]"
              />
              <span>
                I agree to the{" "}
                <Link
                  to="/terms-and-conditions"
                  target="_blank"
                  className="font-semibold text-ink underline decoration-rule underline-offset-4 transition-colors hover:text-accent"
                >
                  Terms &amp; Conditions
                </Link>{" "}
                and acknowledge the{" "}
                <Link
                  to="/privacy-policy"
                  target="_blank"
                  className="font-semibold text-ink underline decoration-rule underline-offset-4 transition-colors hover:text-accent"
                >
                  Privacy Policy
                </Link>
                .
              </span>
            </label>

            {result.message ? (
              <div
                role={result.status === "error" ? "alert" : "status"}
                aria-live="polite"
                className={`border p-4 text-sm leading-6 ${
                  result.status === "success"
                    ? "border-accent/40 bg-accent/10 text-ink"
                    : "border-red-500/30 bg-red-500/10 text-red-700"
                }`}
              >
                {result.status === "success" ? (
                  <CheckCircle2 className="mr-2 inline h-4 w-4 text-accent" />
                ) : null}
                {result.message}
              </div>
            ) : null}

            <button
              disabled={busy}
              className="mt-2 inline-flex h-12 items-center justify-center gap-2 bg-accent px-6 font-mono text-[11px] uppercase tracking-[0.22em] text-accent-foreground transition-colors hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
              Create Account
            </button>

            <p className="text-sm text-ink-muted">
              {copy.helpCopy}{" "}
              <Link to="/login" className="font-semibold text-ink transition-colors hover:text-accent">
                Sign in
              </Link>
            </p>
          </form>
        </section>
      </main>
    </div>
  );
}

const COUNTRIES = [
  { code: "+44", name: "UK" },
  { code: "+93", name: "Afghanistan" },
  { code: "+355", name: "Albania" },
  { code: "+213", name: "Algeria" },
  { code: "+376", name: "Andorra" },
  { code: "+244", name: "Angola" },
  { code: "+1-268", name: "Antigua" },
  { code: "+54", name: "Argentina" },
  { code: "+374", name: "Armenia" },
  { code: "+61", name: "Australia" },
  { code: "+43", name: "Austria" },
  { code: "+994", name: "Azerbaijan" },
  { code: "+1-242", name: "Bahamas" },
  { code: "+973", name: "Bahrain" },
  { code: "+880", name: "Bangladesh" },
  { code: "+1-246", name: "Barbados" },
  { code: "+375", name: "Belarus" },
  { code: "+32", name: "Belgium" },
  { code: "+501", name: "Belize" },
  { code: "+229", name: "Benin" },
  { code: "+975", name: "Bhutan" },
  { code: "+591", name: "Bolivia" },
  { code: "+387", name: "Bosnia" },
  { code: "+267", name: "Botswana" },
  { code: "+55", name: "Brazil" },
  { code: "+673", name: "Brunei" },
  { code: "+359", name: "Bulgaria" },
  { code: "+226", name: "Burkina" },
  { code: "+257", name: "Burundi" },
  { code: "+855", name: "Cambodia" },
  { code: "+237", name: "Cameroon" },
  { code: "+1", name: "Canada" },
  { code: "+238", name: "Cape Verde" },
  { code: "+236", name: "CAR" },
  { code: "+235", name: "Chad" },
  { code: "+56", name: "Chile" },
  { code: "+86", name: "China" },
  { code: "+57", name: "Colombia" },
  { code: "+269", name: "Comoros" },
  { code: "+242", name: "Congo" },
  { code: "+243", name: "DR Congo" },
  { code: "+506", name: "Costa Rica" },
  { code: "+225", name: "Ivory Coast" },
  { code: "+385", name: "Croatia" },
  { code: "+53", name: "Cuba" },
  { code: "+357", name: "Cyprus" },
  { code: "+420", name: "Czechia" },
  { code: "+45", name: "Denmark" },
  { code: "+253", name: "Djibouti" },
  { code: "+1-767", name: "Dominica" },
  { code: "+1-809", name: "Dominican Rep" },
  { code: "+593", name: "Ecuador" },
  { code: "+20", name: "Egypt" },
  { code: "+503", name: "El Salvador" },
  { code: "+240", name: "Eq. Guinea" },
  { code: "+291", name: "Eritrea" },
  { code: "+372", name: "Estonia" },
  { code: "+268", name: "Eswatini" },
  { code: "+251", name: "Ethiopia" },
  { code: "+679", name: "Fiji" },
  { code: "+358", name: "Finland" },
  { code: "+33", name: "France" },
  { code: "+241", name: "Gabon" },
  { code: "+220", name: "Gambia" },
  { code: "+995", name: "Georgia" },
  { code: "+49", name: "Germany" },
  { code: "+233", name: "Ghana" },
  { code: "+30", name: "Greece" },
  { code: "+1-473", name: "Grenada" },
  { code: "+502", name: "Guatemala" },
  { code: "+224", name: "Guinea" },
  { code: "+245", name: "Guinea-Bissau" },
  { code: "+592", name: "Guyana" },
  { code: "+509", name: "Haiti" },
  { code: "+504", name: "Honduras" },
  { code: "+852", name: "Hong Kong" },
  { code: "+36", name: "Hungary" },
  { code: "+354", name: "Iceland" },
  { code: "+91", name: "India" },
  { code: "+62", name: "Indonesia" },
  { code: "+98", name: "Iran" },
  { code: "+964", name: "Iraq" },
  { code: "+353", name: "Ireland" },
  { code: "+972", name: "Israel" },
  { code: "+39", name: "Italy" },
  { code: "+1-876", name: "Jamaica" },
  { code: "+81", name: "Japan" },
  { code: "+962", name: "Jordan" },
  { code: "+7", name: "Kazakhstan" },
  { code: "+254", name: "Kenya" },
  { code: "+686", name: "Kiribati" },
  { code: "+965", name: "Kuwait" },
  { code: "+996", name: "Kyrgyzstan" },
  { code: "+856", name: "Laos" },
  { code: "+371", name: "Latvia" },
  { code: "+961", name: "Lebanon" },
  { code: "+266", name: "Lesotho" },
  { code: "+231", name: "Liberia" },
  { code: "+218", name: "Libya" },
  { code: "+423", name: "Liechtenstein" },
  { code: "+370", name: "Lithuania" },
  { code: "+352", name: "Luxembourg" },
  { code: "+853", name: "Macao" },
  { code: "+261", name: "Madagascar" },
  { code: "+265", name: "Malawi" },
  { code: "+60", name: "Malaysia" },
  { code: "+960", name: "Maldives" },
  { code: "+223", name: "Mali" },
  { code: "+356", name: "Malta" },
  { code: "+692", name: "Marshall Is" },
  { code: "+222", name: "Mauritania" },
  { code: "+230", name: "Mauritius" },
  { code: "+52", name: "Mexico" },
  { code: "+691", name: "Micronesia" },
  { code: "+373", name: "Moldova" },
  { code: "+377", name: "Monaco" },
  { code: "+976", name: "Mongolia" },
  { code: "+382", name: "Montenegro" },
  { code: "+212", name: "Morocco" },
  { code: "+258", name: "Mozambique" },
  { code: "+95", name: "Myanmar" },
  { code: "+264", name: "Namibia" },
  { code: "+674", name: "Nauru" },
  { code: "+977", name: "Nepal" },
  { code: "+31", name: "Netherlands" },
  { code: "+64", name: "New Zealand" },
  { code: "+505", name: "Nicaragua" },
  { code: "+227", name: "Niger" },
  { code: "+234", name: "Nigeria" },
  { code: "+850", name: "N. Korea" },
  { code: "+389", name: "N. Macedonia" },
  { code: "+47", name: "Norway" },
  { code: "+968", name: "Oman" },
  { code: "+92", name: "Pakistan" },
  { code: "+680", name: "Palau" },
  { code: "+507", name: "Panama" },
  { code: "+675", name: "Papua NG" },
  { code: "+595", name: "Paraguay" },
  { code: "+51", name: "Peru" },
  { code: "+63", name: "Philippines" },
  { code: "+48", name: "Poland" },
  { code: "+351", name: "Portugal" },
  { code: "+974", name: "Qatar" },
  { code: "+40", name: "Romania" },
  { code: "+7", name: "Russia" },
  { code: "+250", name: "Rwanda" },
  { code: "+1-869", name: "St Kitts" },
  { code: "+1-758", name: "St Lucia" },
  { code: "+1-784", name: "St Vincent" },
  { code: "+685", name: "Samoa" },
  { code: "+378", name: "San Marino" },
  { code: "+239", name: "São Tomé" },
  { code: "+966", name: "Saudi" },
  { code: "+221", name: "Senegal" },
  { code: "+381", name: "Serbia" },
  { code: "+248", name: "Seychelles" },
  { code: "+232", name: "Sierra Leone" },
  { code: "+65", name: "Singapore" },
  { code: "+421", name: "Slovakia" },
  { code: "+386", name: "Slovenia" },
  { code: "+677", name: "Solomon Is" },
  { code: "+252", name: "Somalia" },
  { code: "+27", name: "South Africa" },
  { code: "+82", name: "South Korea" },
  { code: "+211", name: "South Sudan" },
  { code: "+34", name: "Spain" },
  { code: "+94", name: "Sri Lanka" },
  { code: "+249", name: "Sudan" },
  { code: "+597", name: "Suriname" },
  { code: "+46", name: "Sweden" },
  { code: "+41", name: "Switzerland" },
  { code: "+963", name: "Syria" },
  { code: "+886", name: "Taiwan" },
  { code: "+992", name: "Tajikistan" },
  { code: "+255", name: "Tanzania" },
  { code: "+66", name: "Thailand" },
  { code: "+670", name: "Timor-Leste" },
  { code: "+228", name: "Togo" },
  { code: "+676", name: "Tonga" },
  { code: "+1-868", name: "Trinidad" },
  { code: "+216", name: "Tunisia" },
  { code: "+90", name: "Turkey" },
  { code: "+993", name: "Turkmenistan" },
  { code: "+688", name: "Tuvalu" },
  { code: "+256", name: "Uganda" },
  { code: "+380", name: "Ukraine" },
  { code: "+971", name: "UAE" },
  { code: "+1", name: "USA" },
  { code: "+598", name: "Uruguay" },
  { code: "+998", name: "Uzbekistan" },
  { code: "+678", name: "Vanuatu" },
  { code: "+58", name: "Venezuela" },
  { code: "+84", name: "Vietnam" },
  { code: "+967", name: "Yemen" },
  { code: "+260", name: "Zambia" },
  { code: "+263", name: "Zimbabwe" },
];

function PhoneField() {
  return (
    <label className="grid gap-2">
      <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-muted">
        Phone number
      </span>
      <div className="grid min-w-0 grid-cols-[minmax(0,110px)_minmax(0,1fr)] border border-rule bg-background focus-within:border-accent sm:grid-cols-[minmax(0,140px)_minmax(0,1fr)] md:grid-cols-[minmax(0,200px)_minmax(0,1fr)]">
        <select
          name="countryCode"
          defaultValue="+44"
          className="h-12 min-w-0 border-r border-rule bg-background px-2 text-base sm:text-xs md:text-sm text-ink outline-none sm:px-3"
          aria-label="Phone country code"
        >
          {COUNTRIES.map((country) => (
            <option key={`${country.name}-${country.code}`} value={country.code}>
              {country.name} {country.code}
            </option>
          ))}
        </select>
        <input
          name="phone"
          type="tel"
          autoComplete="tel-national"
          inputMode="tel"
          placeholder="07911 123456"
          className="h-12 min-w-0 bg-transparent px-3 text-base sm:text-sm text-ink outline-none placeholder:text-ink-muted md:px-4"
        />
      </div>
      <span className="text-xs leading-5 text-ink-muted">
        We receive this in international format, for example +447911123456.
      </span>
    </label>
  );
}

function Field({
  label,
  name,
  type = "text",
  autoComplete,
  minLength,
  required,
}: {
  label: string;
  name: string;
  type?: string;
  autoComplete?: string;
  minLength?: number;
  required?: boolean;
}) {
  return (
    <label className="grid gap-2">
      <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-muted">
        {label}
      </span>
      <input
        name={name}
        type={type}
        autoComplete={autoComplete}
        minLength={minLength}
        required={required}
        className="h-12 min-w-0 border border-rule bg-background px-4 text-base sm:text-sm text-ink outline-none transition-colors placeholder:text-ink-muted focus:border-accent"
      />
    </label>
  );
}

function PasswordField({
  label,
  name,
  autoComplete,
  minLength,
  showStrength = true,
  required,
}: {
  label: string;
  name: string;
  autoComplete?: string;
  minLength?: number;
  showStrength?: boolean;
  required?: boolean;
}) {
  const [showPassword, setShowPassword] = useState(false);
  const [password, setPassword] = useState("");

  const calculateStrength = (pwd: string) => {
    let strength = 0;
    if (pwd.length >= 8) strength++;
    if (/[A-Z]/.test(pwd)) strength++;
    if (/[0-9]/.test(pwd)) strength++;
    if (/[^A-Za-z0-9]/.test(pwd)) strength++;
    return strength;
  };

  const strength = calculateStrength(password);

  const getStrengthColor = (s: number) => {
    if (s === 0) return "bg-gray-300";
    if (s === 1) return "bg-red-500";
    if (s === 2) return "bg-orange-500";
    if (s === 3) return "bg-yellow-500";
    return "bg-green-500";
  };

  const getStrengthLabel = (s: number) => {
    if (s === 0) return "";
    if (s === 1) return "Weak";
    if (s === 2) return "Fair";
    if (s === 3) return "Good";
    return "Strong";
  };

  return (
    <label className="grid gap-2">
      <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-muted">
        {label}
      </span>
      <div className="relative border border-rule bg-background focus-within:border-accent">
        <input
          name={name}
          type={showPassword ? "text" : "password"}
          autoComplete={autoComplete}
          minLength={minLength}
          required={required}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="h-12 w-full bg-transparent px-4 pr-12 text-base sm:text-sm text-ink outline-none transition-colors placeholder:text-ink-muted"
        />
        <button
          type="button"
          onClick={() => setShowPassword(!showPassword)}
          aria-label={showPassword ? "Hide password" : "Show password"}
          aria-pressed={showPassword}
          className="absolute right-4 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink"
        >
          {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
        </button>
      </div>
      {showStrength && (
        <div className="mt-1">
          <div className="flex gap-1 h-1.5">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className={`flex-1 rounded-sm ${i < strength ? getStrengthColor(strength) : "bg-gray-200"}`}
              />
            ))}
          </div>
          <div className="text-xs text-ink-muted mt-1">
            {getStrengthLabel(strength)}
          </div>
        </div>
      )}
    </label>
  );
}
