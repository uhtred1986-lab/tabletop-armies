import type { StarterBox } from "@/collection/starter-boxes";
import type { CollectionT } from "@/i18n/features/collection";
import styles from "./collection.module.css";

export function StarterBoxesPanel({ boxes, t, onAddOwnedUnit }: { boxes: StarterBox[]; t: CollectionT; onAddOwnedUnit: () => void }) {
  if (boxes.length === 0) return null;
  return <section className={styles.starterPanel} aria-labelledby="starter-boxes-title">
    <header className={styles.starterHeader}>
      <div>
        <p className="label">{t("collection.starter.eyebrow")}</p>
        <h2 className="w-display" id="starter-boxes-title">{t("collection.starter.title")}</h2>
        <p>{t("collection.starter.help")}</p>
      </div>
    </header>
    <div className={styles.starterGrid}>
      {boxes.map((box) => {
        let productUrl: string | null = null;
        try {
          const url = new URL(box.productUrl || "");
          if (url.protocol === "https:" || url.protocol === "http:") productUrl = url.toString();
        } catch { /* Private catalogue metadata may not include a link. */ }
        const contentsEntered = box.contentsVerified && box.contents.length > 0;
        return <article className={styles.starterCard} key={box.id}>
          <div className={styles.starterCardHead}>
            <h3 className="w-display">{box.name}</h3>
            {box.sku ? <span className="num">{box.sku}</span> : null}
          </div>
          <p className={styles.starterStatus}>{contentsEntered ? t("collection.starter.contentsReady") : t("collection.starter.contentsNeeded")}</p>
          {!contentsEntered ? <p>{t("collection.starter.empty")}</p> : null}
          {!box.statsConfigured ? <p className={styles.starterNote}>{t("collection.starter.statsUnconfigured")}</p> : null}
          {productUrl ? <a className="touch-link" href={productUrl} target="_blank" rel="noreferrer">{t("collection.starter.productLink")}</a> : null}
          <button type="button" className="w-btn secondary" onClick={onAddOwnedUnit}>{t("collection.starter.addOwnedUnit")}</button>
        </article>;
      })}
    </div>
  </section>;
}
