import { readFile } from "node:fs/promises";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { createCanvas } from "@napi-rs/canvas";

export type PositionedPdfText = { text: string; x: number; y: number; width: number; height: number };

export async function readPdfPageLines(path: string): Promise<{ pageCount: number; pages: Array<{ page: number; text: string; lines: string[]; width: number; height: number; items: PositionedPdfText[] }> }> {
  const data = new Uint8Array(await readFile(path));
  const task = getDocument({ data, useSystemFonts: true, disableFontFace: true, verbosity: 0 });
  const document = await task.promise;
  const pages: Array<{ page: number; text: string; lines: string[]; width: number; height: number; items: PositionedPdfText[] }> = [];
  try {
    for (let pageNum = 1; pageNum <= document.numPages; pageNum += 1) {
      const page = await document.getPage(pageNum);
      const viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      const rows = new Map<number, Array<{ x: number; text: string }>>();
      const positioned: PositionedPdfText[] = [];
      for (const item of content.items) {
        if (!("str" in item) || !item.str.trim()) continue;
        const [x, y] = viewport.convertToViewportPoint(item.transform[4]!, item.transform[5]!);
        positioned.push({ text: item.str.trim(), x, y, width: item.width, height: item.height });
        const rowY = Math.round(y / 2) * 2;
        rows.set(rowY, [...(rows.get(rowY) ?? []), { x, text: item.str.trim() }]);
      }
      const lines = [...rows.entries()]
        .sort(([a], [b]) => a - b)
        .map(([, row]) => row.sort((a, b) => a.x - b.x).map(({ text }) => text).join(" ").replace(/\s+/g, " ").trim())
        .filter(Boolean);
      pages.push({ page: pageNum, text: lines.join("\n"), lines, width: viewport.width, height: viewport.height, items: positioned });
    }
  } finally {
    await task.destroy();
  }
  return { pageCount: document.numPages, pages };
}

export async function* renderPdfPagePngs(path: string, maxDimension = 2200): AsyncGenerator<{ page: number; png: Uint8Array }> {
  const data = new Uint8Array(await readFile(path));
  const task = getDocument({ data, useSystemFonts: true, disableFontFace: true, verbosity: 0 });
  const document = await task.promise;
  try {
    for (let pageNum = 1; pageNum <= document.numPages; pageNum += 1) {
      const page = await document.getPage(pageNum);
      const base = page.getViewport({ scale: 1 });
      const scale = Math.min(2, maxDimension / Math.max(base.width, base.height));
      const viewport = page.getViewport({ scale });
      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      const context = canvas.getContext("2d");
      await page.render({ canvas: canvas as unknown as HTMLCanvasElement, canvasContext: context as unknown as CanvasRenderingContext2D, viewport }).promise;
      const png = new Uint8Array(canvas.toBuffer("image/png"));
      yield { page: pageNum, png };
      page.cleanup();
    }
  } finally {
    await task.destroy();
  }
}
