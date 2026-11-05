import { strings, type Locale, type StringKey } from "@/i18n";
import { playDe } from "./play.de";
import { playEn } from "./play.en";
import { rulesDe } from "./rules.de";
import { rulesEn } from "./rules.en";

const playWords = { en: playEn, de: playDe };
const rulesWords = { en: rulesEn, de: rulesDe };

export type FeatureTranslate = (key: string, values?: Record<string, string | number>) => string;

export function featureTranslator(locale: Locale): FeatureTranslate {
  return (key, values) => {
    const feature = (playWords[locale] as Record<string, string>)[key] ?? (rulesWords[locale] as Record<string, string>)[key];
    const template = feature ?? strings[locale][key as StringKey] ?? key;
    return template.replace(/\{(\w+)\}/g, (_, name: string) => String(values?.[name] ?? `{${name}}`));
  };
}
