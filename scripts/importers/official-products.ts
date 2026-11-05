import { load } from "cheerio";
import { suggestNameMatches, stableId } from "./matching";

type OfficialProduct = { name: string; url: string; imageUrl?: string; alt?: string; title?: string };
type UnitName = { id: string; name: string; gameId?: string; factionName?: string };

/** Reads a single already-listed Warhammer product page into image candidates, without fetching or copying the image. */
export function parseOfficialProductPage(html: string, productUrl: string): OfficialProduct[] {
  const $ = load(html);
  const products: OfficialProduct[] = [];
  $("article, [data-product], .product-card, .product").each((_index, element) => {
    const card = $(element);
    const link = card.find("a[href]").first();
    const image = card.find("img").first();
    const url = absolute(link.attr("href"), productUrl);
    const imageUrl = absolute(image.attr("src") ?? image.attr("data-src") ?? image.attr("srcset")?.split(",")[0]?.trim().split(/\s+/)[0], productUrl);
    const name = card.find("h1,h2,h3,[itemprop=name]").first().text().trim() || link.text().trim() || image.attr("alt")?.trim() || "";
    if (url && name) products.push({ name, url, imageUrl, alt: image.attr("alt"), title: image.attr("title") });
  });
  // Structured product layouts sometimes expose only a main image rather than a card element.
  if (!products.length) {
    const title = $("h1").first().text().trim() || $("meta[property='og:title']").attr("content")?.trim() || "";
    const images = $("main img, article img, meta[property='og:image']");
    images.each((_index, element) => {
      const image = $(element);
      const imageUrl = absolute(image.attr("src") ?? image.attr("content") ?? image.attr("data-src"), productUrl);
      if (title && imageUrl) products.push({ name: title, url: productUrl, imageUrl, alt: image.attr("alt"), title: image.attr("title") });
    });
  }
  return [...new Map(products.map((product) => [product.imageUrl ?? product.url, product])).values()];
}

/** Exact product/unit matches may be proposed; fuzzy matches stay explicitly ambiguous for owner review. */
export function proposeOfficialProductImages(units: readonly UnitName[], products: readonly OfficialProduct[]) {
  const candidates: Array<{
    entityKind: "image";
    sourceId: string;
    matchTargetId?: string;
    matchConfidence?: number;
    reviewState: "pending";
    proposed: Record<string, unknown>;
  }> = [];
  for (const product of products) {
    if (!product.imageUrl) continue;
    const targets = units.map((unit) => ({ id: unit.id, name: unit.name }));
    const matchName = product.alt?.trim() || product.name;
    const suggestions = suggestNameMatches(matchName, targets, 0.58);
    if (!suggestions.length) {
      candidates.push({
      entityKind: "image" as const,
      sourceId: product.imageUrl,
      matchTargetId: undefined,
      matchConfidence: undefined,
      reviewState: "pending" as const,
      proposed: {
        id: stableId("asset-candidate", product.imageUrl),
        kind: "official-product-image",
        productName: product.name,
        productUrl: product.url,
        imageUrl: product.imageUrl,
        alt: product.alt,
        reviewFlags: ["no-unit-name-match", "remote-image-not-copied"],
      },
      });
      continue;
    }
    const exactMatches = suggestions.filter(({ exact }) => exact);
    const selected = exactMatches.length === 1 ? exactMatches[0] : undefined;
    candidates.push({
      entityKind: "image" as const,
      sourceId: product.imageUrl!,
      ...(selected ? { matchTargetId: selected.target.id, matchConfidence: selected.confidence } : {}),
      reviewState: "pending" as const,
      proposed: {
        id: stableId("asset-candidate", product.imageUrl!),
        kind: "official-product-image",
        productName: product.name,
        productUrl: product.url,
        imageUrl: product.imageUrl,
        alt: product.alt,
        matchCandidates: suggestions.map(({ target, confidence, exact }) => ({ targetId: target.id, targetName: target.name, confidence, exact })),
        reviewFlags: [
          ...(selected ? ["exact-name-match-needs-owner-approval"] : ["ambiguous-name-match-needs-owner-review"]),
          "remote-image-not-copied",
        ],
      },
    });
  }
  return candidates;
}

function absolute(value: string | undefined, base: string): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value, base);
    return url.protocol === "https:" ? url.toString() : undefined;
  } catch { return undefined; }
}
