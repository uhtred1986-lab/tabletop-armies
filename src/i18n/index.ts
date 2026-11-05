// Pure i18n helpers, safe on server and client. Server components: `await getT()` (`./server`); client components:
// `useT()` (`./client`); never both in one file.
import { de } from "./de";
import { en, type StringKey } from "./en";

export type Locale = "de" | "en";
export const LOCALES: Locale[] = ["de", "en"];
export const DEFAULT_LOCALE: Locale = "de";
export const LOCALE_COOKIE = "muster-locale";
export const strings: Record<Locale, Record<StringKey, string>> = { de, en };

export const isLocale = (v: string | undefined | null): v is Locale => v === "de" || v === "en";

export const translate = (locale: Locale, key: StringKey, values?: Record<string, string | number>): string =>
  strings[locale][key].replace(/\{(\w+)\}/g, (_, name: string) => String(values?.[name] ?? `{${name}}`));

export type T = (key: StringKey, values?: Record<string, string | number>) => string;
export const translator = (locale: Locale): T => (key, values) => translate(locale, key, values);

export const formatNumber = (locale: Locale, n: number) => new Intl.NumberFormat(locale === "de" ? "de-AT" : "en-GB").format(n);

export type { StringKey };
