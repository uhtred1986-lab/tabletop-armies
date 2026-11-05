import { getT } from "@/i18n/server";
import { LOGIN_START_PATH, missingAuthConfig } from "@/lib/auth-core";

export const dynamic = "force-dynamic";

const ERRORS = { refused: "login.error.refused", state: "login.error.state", failed: "login.error.failed" } as const;

/** The only screen without a session. Names missing variables (never values) when sign-in is not set up. */
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const t = await getT();
  const { error } = await searchParams;
  const missing = missingAuthConfig(process.env);
  const message =
    error === "config" || missing.length > 0
      ? t("login.error.config", { missing: missing.join(", ") || "?" })
      : error && error in ERRORS
        ? t(ERRORS[error as keyof typeof ERRORS])
        : null;
  return (
    <main className="login">
      <section className="w-card card-pad login-card">
        <h1 className="w-display page-title">{t("login.title")}</h1>
        <p>{t("login.body")}</p>
        {message ? (
          <p className="login-error" role="alert">
            {message}
          </p>
        ) : null}
        <a className="btn w-btn" href={LOGIN_START_PATH}>
          {t("login.google")}
        </a>
      </section>
    </main>
  );
}
