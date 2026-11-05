import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { registerSW } from "virtual:pwa-register";
import "./theme/tokens.css";
import "./theme/worlds.css";
import "./theme/base.css";
import { App } from "./app/App";
import { GameProvider } from "./app/GameContext";
import { LocaleContext } from "./i18n";

registerSW({ immediate: true });

const locale = navigator.language.startsWith("de") ? "de" : "en";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <LocaleContext.Provider value={locale}>
      <GameProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </GameProvider>
    </LocaleContext.Provider>
  </StrictMode>,
);
