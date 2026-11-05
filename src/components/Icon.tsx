import type { SVGProps } from "react";

const paths = {
  games: "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z",
  collection: "M4 4h16v16H4zM4 10h16M10 4v16",
  places: "M3 7l9-4 9 4-9 4zM3 7v10l9 4 9-4V7M12 11v10",
  lists: "M8 6h13M8 12h13M8 18h13M3 6h1M3 12h1M3 18h1",
  reference: "M12 5C9 3 5 3 2 4v16c3-1 7-1 10 1 3-2 7-2 10-1V4c-3-1-7-1-10 1v16",
  play: "M9 4l12 8-12 8zM3 4v16",
  paint: "M15 3l6 6-10 10-6-6zM5 13l-2 8 8-2",
  stats: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  campaigns: "M4 3h12l4 4v14H4zM8 11h8M8 16h8",
  data: "M3 6c0-4 18-4 18 0s-18 4-18 0v12c0 4 18 4 18 0V6M3 12c0 4 18 4 18 0",
  more: "M4 12h1M11 12h1M18 12h1",
  close: "M5 5l14 14M19 5L5 19",
  settings: "M4 7h16M4 17h16M8 4v6M16 14v6",
} as const;

export type IconName = keyof typeof paths;
export function Icon({ name, ...props }: SVGProps<SVGSVGElement> & { name: IconName }) {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}><path d={paths[name]} /></svg>;
}
