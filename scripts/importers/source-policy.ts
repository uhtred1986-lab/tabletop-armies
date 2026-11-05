import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

export type ListedSource = {
  url: string;
  purpose: "catalogue" | "modes" | "scenario" | "product" | "card" | "token";
  gameId?: "aos" | "mcp" | "legion" | "shatterpoint" | "bmg";
  sourceDate?: string;
  documentTitle?: string;
  recordCandidates?: Array<{ kind: "mode" | "scenario"; name: string; modeType?: string; tags?: string[]; pages?: number[] }>;
  termsReview?: { url: string; reviewedAt: string };
  localPath?: string;
};

export type SourceGate = {
  allowedHost: boolean;
  listed: boolean;
  robotsAllows: boolean;
  termsReviewed: boolean;
  automatedFetchAllowed: boolean;
  reason?: string;
};

const DEFAULT_HOSTS = new Set([
  "warhammer-community.com",
  "www.warhammer-community.com",
  "assets.warhammer-community.com",
  "warhammer.com",
  "www.warhammer.com",
  "atomicmassgames.com",
  "www.atomicmassgames.com",
  "knightmodels.com",
  "www.knightmodels.com",
  "cdn.svc.asmodee.net",
  "cdn.shopify.com",
]);

/**
 * The importer only fetches explicit URLs in data/sources.json. It deliberately does not crawl from an unlisted
 * starting point, spoof a browser, evade a robots rule, or treat a missing terms review as permission.
 */
export async function readListedSources(file = resolve(process.cwd(), "data/sources.json")): Promise<ListedSource[]> {
  const raw = JSON.parse(await readFile(file, "utf8")) as unknown;
  if (!Array.isArray(raw)) throw new Error("data/sources.json must contain an array of listed URLs");
  return raw.map((entry, index) => {
    if (!entry || typeof entry !== "object") throw new Error(`Source ${index + 1} must be an object`);
    const record = entry as Record<string, unknown>;
    if (typeof record.url !== "string" || typeof record.purpose !== "string") {
      throw new Error(`Source ${index + 1} must have url and purpose fields`);
    }
    const url = new URL(record.url);
    if (url.protocol !== "https:") throw new Error(`Source ${index + 1} must use HTTPS`);
    if (url.username || url.password) throw new Error(`Source ${index + 1} must not contain URL credentials`);
    if (url.hash) throw new Error(`Source ${index + 1} must not contain a URL fragment`);
    if (!["catalogue", "modes", "scenario", "product", "card", "token"].includes(record.purpose)) {
      throw new Error(`Source ${index + 1} has an unsupported purpose`);
    }
    if (record.gameId !== undefined && !["aos", "mcp", "legion", "shatterpoint", "bmg"].includes(String(record.gameId))) {
      throw new Error(`Source ${index + 1} has an unsupported gameId`);
    }
    if (record.sourceDate !== undefined && (typeof record.sourceDate !== "string" || !/^\d{4}(-\d{2}(-\d{2})?)?$/.test(record.sourceDate))) {
      throw new Error(`Source ${index + 1} sourceDate must be a verified year, month, or date`);
    }
    if (record.documentTitle !== undefined && (typeof record.documentTitle !== "string" || !record.documentTitle.trim())) throw new Error(`Source ${index + 1} documentTitle must be non-empty text`);
    if (record.recordCandidates !== undefined && (!Array.isArray(record.recordCandidates) || record.recordCandidates.some((item) => !isRecordCandidate(item)))) {
      throw new Error(`Source ${index + 1} recordCandidates must be explicitly named modes/scenarios with valid page references`);
    }
    let termsReview: ListedSource["termsReview"];
    if (record.termsReview !== undefined) {
      if (!record.termsReview || typeof record.termsReview !== "object") throw new Error(`Source ${index + 1} termsReview must contain url and reviewedAt`);
      const terms = record.termsReview as Record<string, unknown>;
      if (typeof terms.url !== "string" || typeof terms.reviewedAt !== "string" || !Number.isFinite(Date.parse(terms.reviewedAt))) {
        throw new Error(`Source ${index + 1} termsReview must contain a URL and valid reviewedAt date`);
      }
      const termsUrl = new URL(terms.url);
      if (termsUrl.protocol !== "https:") throw new Error(`Source ${index + 1} terms URL must use HTTPS`);
      termsReview = { url: termsUrl.toString(), reviewedAt: terms.reviewedAt };
    }
    let localPath: string | undefined;
    if (record.localPath !== undefined) {
      if (typeof record.localPath !== "string" || record.localPath.includes("..") || record.localPath.startsWith("/") || !record.localPath.replace(/\\/g, "/").startsWith("data/amg/manual/")) {
        throw new Error(`Source ${index + 1} localPath must be inside data/amg/manual/`);
      }
      localPath = record.localPath.replace(/\\/g, "/");
    }
    return {
      url: url.toString(),
      purpose: record.purpose as ListedSource["purpose"],
      ...(record.gameId ? { gameId: record.gameId as ListedSource["gameId"] } : {}),
      ...(typeof record.sourceDate === "string" ? { sourceDate: record.sourceDate } : {}),
      ...(typeof record.documentTitle === "string" ? { documentTitle: record.documentTitle.trim() } : {}),
      ...(Array.isArray(record.recordCandidates) ? { recordCandidates: record.recordCandidates as NonNullable<ListedSource["recordCandidates"]> } : {}),
      ...(termsReview ? { termsReview } : {}),
      ...(localPath ? { localPath } : {}),
    };
  });
}

export function sourceGate(source: ListedSource, robotsText: string | null, explicitlyListed: boolean): SourceGate {
  const hostname = new URL(source.url).hostname.toLowerCase();
  const allowedHost = [...DEFAULT_HOSTS].some((host) => hostname === host || hostname.endsWith(`.${host}`));
  const listed = explicitlyListed;
  const termsReviewed = Boolean(source.termsReview?.url && source.termsReview.reviewedAt);
  const automatedFetchAllowed = !isAmgHost(hostname) || isStaticAssetPath(new URL(source.url).pathname);
  const robotsAllows = robotsText !== null && robotsAllowsPath(robotsText, new URL(source.url).pathname);
  return {
    allowedHost,
    listed,
    robotsAllows,
    termsReviewed,
    automatedFetchAllowed,
    ...(!listed ? { reason: "URL is not in the owner's explicit URL list" } : {}),
    ...(!allowedHost ? { reason: `Host ${hostname} is not on the official-source allowlist` } : {}),
    ...(robotsText === null ? { reason: "robots.txt could not be checked" } : {}),
    ...(robotsText !== null && !robotsAllows ? { reason: "robots.txt disallows this path" } : {}),
    ...(!termsReviewed ? { reason: "Terms have not been reviewed for this source" } : {}),
    ...(!automatedFetchAllowed ? { reason: "Atomic Mass Games website crawling is disabled; list a direct public PDF/image URL or import an owner-downloaded local file" } : {}),
  };
}

function robotsAllowsPath(text: string, path: string): boolean {
  // Conservative RFC 9309 subset: groups are applied to the generic importer user agent; the longest matching
  // Allow/Disallow rule wins, with Allow winning ties. Wildcards and end markers are supported.
  const lines = text.split(/\r?\n/).map((line) => line.replace(/#.*$/, "").trim()).filter(Boolean);
  const groups: Array<{ agents: string[]; rules: Array<{ allow: boolean; path: string }> }> = [];
  let current: (typeof groups)[number] | undefined;
  for (const line of lines) {
    const [key, ...rest] = line.split(":");
    const value = rest.join(":").trim();
    if (!key || !value) continue;
    if (key.toLowerCase() === "user-agent") {
      if (!current || current.rules.length) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
    } else if ((key.toLowerCase() === "allow" || key.toLowerCase() === "disallow") && current) {
      current.rules.push({ allow: key.toLowerCase() === "allow", path: value });
    }
  }
  const matching = groups.filter((group) => group.agents.some((agent) => agent === "*" || "tabletop-armies-importer".includes(agent)));
  const rules = matching.flatMap((group) => group.rules).filter(({ path: rule }) => rule && matchesRobotsRule(rule, path));
  if (!rules.length) return true;
  rules.sort((a, b) => b.path.replace(/[\*\$]/g, "").length - a.path.replace(/[\*\$]/g, "").length || Number(b.allow) - Number(a.allow));
  return rules[0]!.allow;
}

function matchesRobotsRule(rule: string, path: string): boolean {
  const expression = rule.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\$$/, "$");
  return new RegExp(`^${expression}`).test(path);
}

export type FetchOptions = { listedSources: readonly ListedSource[]; timeoutMs?: number; minDelayMs?: number; maxRetries?: number };

/** Fetches one listed official URL after robots/terms checks, with bounded retries and per-host spacing. */
export async function fetchListedSource(source: ListedSource, options: FetchOptions): Promise<{ response: Response; fetchedAt: string }> {
  const explicitlyListed = options.listedSources.some((item) => item.url === source.url && item.purpose === source.purpose);
  if (!explicitlyListed) throw new Error("Only URLs in data/sources.json can be fetched");
  if (!source.termsReview?.url || !source.termsReview.reviewedAt) throw new Error("Review the source terms and record termsReview.url and termsReview.reviewedAt before fetching");
  const host = new URL(source.url).host;
  if (isAmgHost(host) && !isStaticAssetPath(new URL(source.url).pathname)) {
    throw new Error("Atomic Mass Games website crawling is disabled; list a direct public PDF/image URL or import an owner-downloaded local file");
  }
  const robotsUrl = new URL("/robots.txt", source.url);
  const robotsResponse = await fetch(robotsUrl, { redirect: "error", signal: AbortSignal.timeout(options.timeoutMs ?? 15_000) });
  const robots = robotsResponse.ok ? await robotsResponse.text() : null;
  const gate = sourceGate(source, robots, explicitlyListed);
  if (!gate.allowedHost || !gate.listed || !gate.robotsAllows || !gate.termsReviewed) {
    throw new Error(gate.reason ?? `Source gate rejected ${source.url}`);
  }

  const minDelay = options.minDelayMs ?? 2_000;
  await hostDelay(host, minDelay);
  let lastError: unknown;
  for (let attempt = 0; attempt <= (options.maxRetries ?? 3); attempt += 1) {
    try {
      const response = await fetch(source.url, {
        redirect: "error",
        headers: { "User-Agent": "TabletopArmiesPrivateImporter/1.0 (owner initiated; contact: owner)" },
        signal: AbortSignal.timeout(options.timeoutMs ?? 30_000),
      });
      if (response.status === 429 || response.status >= 500) {
        if (attempt >= (options.maxRetries ?? 3)) return { response, fetchedAt: new Date().toISOString() };
        const backoff = Math.min(30_000, 2_000 * 2 ** attempt);
        await delay(backoff);
        continue;
      }
      return { response, fetchedAt: new Date().toISOString() };
    } catch (error) {
      lastError = error;
      if (attempt >= (options.maxRetries ?? 3)) break;
      await delay(Math.min(30_000, 2_000 * 2 ** attempt));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`Could not fetch ${source.url}`);
}

function isAmgHost(host: string) {
  const hostname = host.split(":")[0]!.toLowerCase();
  return hostname === "atomicmassgames.com" || hostname.endsWith(".atomicmassgames.com");
}

function isRecordCandidate(value: unknown): value is NonNullable<ListedSource["recordCandidates"]>[number] {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return (item.kind === "mode" || item.kind === "scenario") && typeof item.name === "string" && item.name.trim().length > 0 &&
    (item.pages === undefined || (Array.isArray(item.pages) && item.pages.every((page) => Number.isSafeInteger(page) && Number(page) > 0))) &&
    (item.tags === undefined || (Array.isArray(item.tags) && item.tags.every((tag) => typeof tag === "string"))) &&
    (item.modeType === undefined || typeof item.modeType === "string");
}

function isStaticAssetPath(path: string) {
  return /\.(?:pdf|jpe?g|png|webp)$/i.test(path);
}

const hostFetches = new Map<string, number>();
async function hostDelay(host: string, minDelayMs: number) {
  const wait = Math.max(0, (hostFetches.get(host) ?? 0) + minDelayMs - Date.now());
  if (wait) await delay(wait);
  hostFetches.set(host, Date.now());
}
const delay = (ms: number) => new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
