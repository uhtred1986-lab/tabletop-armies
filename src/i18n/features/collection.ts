import { collectionDe } from "./collection.de";
import { collectionEn } from "./collection.en";

export type CollectionKey = keyof typeof collectionEn;
export type CollectionT = (key: CollectionKey, values?: Record<string, string | number>) => string;

export const collectionT = (locale: "de" | "en"): CollectionT => (key, values) =>
  (locale === "de" ? collectionDe : collectionEn)[key].replace(/\{(\w+)\}/g, (_, name: string) => String(values?.[name] ?? "{" + name + "}"));

export type CollectionStrings = typeof collectionEn;
