"use client";
import { createContext, useContext, type ReactNode } from "react";
import { DEFAULT_LOCALE, translator, type Locale, type T } from "./index";

const LocaleContext = createContext<Locale>(DEFAULT_LOCALE);

/** Set once by the root layout with the server's locale. */
export const LocaleProvider = ({ locale, children }: { locale: Locale; children: ReactNode }) => (
  <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>
);

export const useLocale = () => useContext(LocaleContext);
export const useT = (): T => translator(useContext(LocaleContext));
