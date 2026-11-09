"use client";

import { useEffect, useRef, useState } from "react";
import { formatNumber, type Locale } from "@/i18n";
import { featureTranslator, type FeatureTranslate } from "@/i18n/features/play";
import type { PlayState } from "@/lib/play/replay";
import { resultCardData, type ResultCardData } from "@/lib/play/result-card";

const WIDTH = 1080;
const HEIGHT = 1350;

type Props = {
  state: PlayState;
  locale: Locale;
  /** ISO date the game was played (yyyy-mm-dd or a full timestamp). */
  playedOn: string;
  /** Optional faction id → display name; without it the frozen id is shown. */
  factionNames?: Record<string, string>;
};

type Palette = {
  ground: string; surface: string; surface2: string; line: string; ink: string; muted: string;
  accent: string; accentInk: string; accent2: string; display: string; ui: string;
};

/**
 * "Share result": draws the game's result onto a 1080 × 1350 card in the current world's tokens and fonts,
 * then shares it as a PNG (Web Share with files) or downloads it. Colours are read from the CSS custom
 * properties at draw time, never written here (CLAUDE.md rule 11).
 */
export function ResultCardButton({ state, locale, playedOn, factionNames }: Props) {
  const t = featureTranslator(locale);
  const anchorRef = useRef<HTMLDivElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [cardKey, setCardKey] = useState<string | null>(null);

  const data = resultCardData(state, { owner: t("setup.you"), factionName: (id) => factionNames?.[id] }, playedOn);
  const key = JSON.stringify(data) + locale;
  const fresh = file && cardKey === key ? file : null;

  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  async function makeFile(): Promise<File | null> {
    if (fresh) return fresh;
    const element = anchorRef.current;
    if (!element) return null;
    const palette = readPalette(element);
    await loadFonts(palette);
    const canvas = document.createElement("canvas");
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    drawCard(ctx, data, palette, t, locale);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) return null;
    const name = `${t("result.fileName", { date: data.date.slice(0, 10) })}.png`;
    const next = new File([blob], name, { type: "image/png" });
    setFile(next);
    setCardKey(key);
    setPreviewUrl(URL.createObjectURL(next));
    return next;
  }

  async function share() {
    setBusy(true);
    setStatus(t("result.drawing"));
    try {
      const made = await makeFile();
      if (!made) { setStatus(t("result.failed")); return; }
      if (typeof navigator.share === "function" && navigator.canShare?.({ files: [made] })) {
        try {
          await navigator.share({ files: [made], title: t("result.title") });
          setStatus(null);
        } catch (error) {
          // AbortError: the owner closed the share sheet. NotAllowedError: the tap expired while drawing;
          // the card is ready now, so the next tap shares at once.
          setStatus(error instanceof DOMException && (error.name === "AbortError" || error.name === "NotAllowedError") ? null : t("result.failed"));
        }
        return;
      }
      download(made);
      setStatus(t("result.downloaded"));
    } catch {
      setStatus(t("result.failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div ref={anchorRef} className="result-card-share">
      <button type="button" className="btn secondary w-btn" onClick={share} disabled={busy} aria-busy={busy}>
        {t("result.share")}
      </button>
      {status && <p role="status" className="hint">{status}</p>}
      {previewUrl && fresh && (
        <figure>
          {/* A local blob URL; next/image cannot optimise it. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={previewUrl} alt={t("result.preview")} width={WIDTH / 4} height={HEIGHT / 4} style={{ maxWidth: "100%", height: "auto", borderRadius: "var(--radius-card)" }} />
          <figcaption>
            <a className="touch-link" href={previewUrl} download={fresh.name}>{t("result.download")}</a>
          </figcaption>
        </figure>
      )}
    </div>
  );
}

function download(file: File) {
  const url = URL.createObjectURL(file);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = file.name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function readPalette(element: HTMLElement): Palette {
  const style = getComputedStyle(element);
  const read = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
  const ink = read("--ink", style.color);
  const ground = read("--ground", getComputedStyle(document.body).backgroundColor);
  const surface = read("--surface-1", ground);
  const accent = read("--accent", ink);
  const ui = getComputedStyle(document.body).fontFamily || read("--font-ui", "sans-serif");
  return {
    ground, surface, ink, accent,
    surface2: read("--surface-2", surface),
    line: read("--line", read("--ink-muted", ink)),
    muted: read("--ink-muted", ink),
    accentInk: read("--accent-ink", ground),
    accent2: read("--accent-2", accent),
    display: read("--font-display", ui),
    ui,
  };
}

async function loadFonts(palette: Palette) {
  if (typeof document === "undefined" || !document.fonts) return;
  try {
    await Promise.all([document.fonts.load(`64px ${palette.display}`), document.fonts.load(`600 32px ${palette.ui}`), document.fonts.load(`32px ${palette.ui}`)]);
    await document.fonts.ready;
  } catch {
    // A missing face falls back to the stack's next font; the card still draws.
  }
}

/** Shortens text with an ellipsis until it fits the width. */
function fit(ctx: CanvasRenderingContext2D, text: string, width: number): string {
  if (ctx.measureText(text).width <= width) return text;
  let cut = text;
  while (cut.length > 1 && ctx.measureText(`${cut}…`).width > width) cut = cut.slice(0, -1);
  return `${cut.trimEnd()}…`;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawCard(ctx: CanvasRenderingContext2D, data: ResultCardData, p: Palette, t: FeatureTranslate, locale: Locale) {
  const n = (value: number) => formatNumber(locale, value);
  const pad = 72;
  const inner = WIDTH - pad * 2;
  const mid = WIDTH / 2;

  ctx.fillStyle = p.ground;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  roundRect(ctx, 36, 36, WIDTH - 72, HEIGHT - 72, 28);
  ctx.fillStyle = p.surface;
  ctx.fill();
  ctx.strokeStyle = p.line;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.textBaseline = "alphabetic";

  // Header: game, date, battleplan.
  let y = pad + 64;
  ctx.textAlign = "left";
  ctx.fillStyle = p.ink;
  ctx.font = `64px ${p.display}`;
  ctx.fillText(fit(ctx, data.title, inner * 0.62), pad, y);
  ctx.textAlign = "right";
  ctx.fillStyle = p.muted;
  ctx.font = `32px ${p.ui}`;
  ctx.fillText(formatDate(data.date, locale), WIDTH - pad, y);
  y += 28;
  ctx.fillStyle = p.accent;
  ctx.fillRect(pad, y, inner, 3);
  if (data.battleplan) {
    y += 52;
    ctx.textAlign = "left";
    ctx.fillStyle = p.muted;
    ctx.font = `34px ${p.ui}`;
    const plan = data.battleplan.number !== undefined
      ? t("result.battleplan", { number: n(data.battleplan.number), name: data.battleplan.name })
      : data.battleplan.name;
    ctx.fillText(fit(ctx, plan, inner), pad, y);
  }

  // Sides with their totals.
  y += 96;
  const column = inner / 2 - 60;
  const sides = [
    { side: data.sides.owner, total: data.totals.owner, x: pad, align: "left" as const, colour: p.ink },
    { side: data.sides.opponent, total: data.totals.opponent, x: WIDTH - pad, align: "right" as const, colour: p.accent2 },
  ];
  for (const { side, total, x, align, colour } of sides) {
    ctx.textAlign = align;
    ctx.fillStyle = colour;
    ctx.font = `600 44px ${p.ui}`;
    ctx.fillText(fit(ctx, side.name, column), x, y);
    ctx.fillStyle = p.muted;
    ctx.font = `30px ${p.ui}`;
    if (side.faction) ctx.fillText(fit(ctx, side.faction, column), x, y + 44);
    if (side.list) ctx.fillText(fit(ctx, side.list, column), x, y + 84);
    ctx.fillStyle = colour;
    ctx.font = `160px ${p.display}`;
    ctx.fillText(n(total), x, y + 270);
  }
  ctx.textAlign = "center";
  ctx.fillStyle = p.muted;
  ctx.font = `36px ${p.ui}`;
  ctx.fillText(t("play.vs"), mid, y + 210);

  // The result as the card's one accent mark.
  y += 330;
  const result = data.result ? t(`play.${data.result}`) : t("play.inProgress");
  ctx.font = `600 38px ${p.ui}`;
  const chipW = Math.min(inner, ctx.measureText(result).width + 72);
  roundRect(ctx, mid - chipW / 2, y - 46, chipW, 68, 34);
  ctx.fillStyle = data.result ? p.accent : p.surface2;
  ctx.fill();
  ctx.fillStyle = data.result ? p.accentInk : p.ink;
  ctx.fillText(fit(ctx, result, chipW - 48), mid, y);

  // Rounds: points per side and the round picks.
  y += 72;
  const scoreOwnerX = WIDTH - pad - 200;
  const scoreOpponentX = WIDTH - pad;
  ctx.font = `600 26px ${p.ui}`;
  ctx.fillStyle = p.muted;
  ctx.textAlign = "left";
  ctx.fillText(t("round.vp"), pad, y);
  ctx.textAlign = "right";
  ctx.fillText(fit(ctx, data.sides.owner.name, 180), scoreOwnerX, y);
  ctx.fillText(fit(ctx, data.sides.opponent.name, 180), scoreOpponentX, y);
  y += 16;

  const rows: { label: string; owner: number; opponent: number; note?: string }[] = data.rounds.map((round) => ({
    label: t("round.title", { round: n(round.round) }),
    owner: round.owner,
    opponent: round.opponent,
    note: round.picks.map((pick) => `${pick.pickLabel}: ${pick.side === "owner" ? data.sides.owner.name : data.sides.opponent.name}`).join(" · ") || undefined,
  }));
  if (data.extra.owner || data.extra.opponent) rows.push({ label: t("result.extra"), owner: data.extra.owner, opponent: data.extra.opponent });

  const footer = HEIGHT - pad - 40;
  const available = footer - 70 - y;
  const rowHeight = Math.max(52, Math.min(96, available / Math.max(rows.length, 1)));
  const shown = rows.slice(0, Math.max(1, Math.floor(available / rowHeight)));
  for (const row of shown) {
    ctx.fillStyle = p.line;
    ctx.fillRect(pad, y, inner, 1);
    const base = y + (row.note && rowHeight >= 80 ? 44 : rowHeight / 2 + 12);
    ctx.textAlign = "left";
    ctx.fillStyle = p.ink;
    ctx.font = `34px ${p.ui}`;
    ctx.fillText(fit(ctx, row.label, scoreOwnerX - 200 - pad), pad, base);
    if (row.note && rowHeight >= 80) {
      ctx.fillStyle = p.muted;
      ctx.font = `26px ${p.ui}`;
      ctx.fillText(fit(ctx, row.note, scoreOwnerX - 200 - pad), pad, base + 36);
    }
    ctx.textAlign = "right";
    ctx.font = `600 38px ${p.ui}`;
    ctx.fillStyle = p.ink;
    ctx.fillText(n(row.owner), scoreOwnerX, base);
    ctx.fillStyle = p.accent2;
    ctx.fillText(n(row.opponent), scoreOpponentX, base);
    y += rowHeight;
  }

  // Total row.
  ctx.fillStyle = p.accent;
  ctx.fillRect(pad, footer - 50, inner, 2);
  ctx.textAlign = "left";
  ctx.fillStyle = p.ink;
  ctx.font = `600 40px ${p.ui}`;
  ctx.fillText(t("round.total"), pad, footer + 4);
  ctx.textAlign = "right";
  ctx.fillText(n(data.totals.owner), scoreOwnerX, footer + 4);
  ctx.fillStyle = p.accent2;
  ctx.fillText(n(data.totals.opponent), scoreOpponentX, footer + 4);
}

function formatDate(iso: string, locale: Locale): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(locale === "de" ? "de-AT" : "en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: iso.length <= 10 ? "UTC" : undefined }).format(date);
}
