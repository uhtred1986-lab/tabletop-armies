import { createContext, useContext } from "react";
import { de } from "./de";
import { en, type StringKey } from "./en";

export type Locale = "de" | "en";
export const strings: Record<Locale, Record<StringKey, string>> = { de, en };

export const translate = (locale: Locale, key: StringKey, values?: Record<string, string | number>): string =>
  strings[locale][key].replace(/\{(\w+)\}/g, (_, name: string) => String(values?.[name] ?? `{${name}}`));

export const LocaleContext = createContext<Locale>("de");

/** Client-side translator: `const t = useT(); t("nav.hub")`. Never write UI text by hand in a component. */
export const useT = () => {
  const locale = useContext(LocaleContext);
  return (key: StringKey, values?: Record<string, string | number>) => translate(locale, key, values);
};

export const formatNumber = (locale: Locale, n: number) => new Intl.NumberFormat(locale === "de" ? "de-AT" : "en-GB").format(n);

export type { StringKey };
