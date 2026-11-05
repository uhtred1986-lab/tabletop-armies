import { NavLink, Route, Routes } from "react-router-dom";
import { useT } from "@/i18n";
import { CollectionPage, HubPage, KitPage, SoonPage } from "./pages";

export const App = () => {
  const t = useT();
  const nav = [
    ["/", "nav.hub"],
    ["/collection", "nav.collection"],
    ["/lists", "nav.lists"],
    ["/play", "nav.play"],
    ["/kit", "nav.kit"],
  ] as const;
  return (
    <div className="shell">
      <nav className="rail" aria-label={t("app.name")}>
        <div className="w-display" style={{ fontSize: 24, color: "var(--accent)", padding: "0 12px 16px" }}>{t("app.name")}</div>
        {nav.map(([to, key]) => (
          <NavLink key={to} to={to} end={to === "/"}>{t(key)}</NavLink>
        ))}
      </nav>
      <main className="main">
        <Routes>
          <Route path="/" element={<HubPage />} />
          <Route path="/collection" element={<CollectionPage />} />
          <Route path="/lists" element={<SoonPage messageKey="lists.soon" />} />
          <Route path="/play" element={<SoonPage messageKey="play.soon" />} />
          <Route path="/kit" element={<KitPage />} />
        </Routes>
      </main>
    </div>
  );
};
