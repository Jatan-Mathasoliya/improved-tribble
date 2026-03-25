import { hydrateRoot, createRoot } from "react-dom/client";
import { HelmetProvider } from "react-helmet-async";
import App from "./App";
import "./index.css";
import "./styles/public-theme.css";

const rootEl = document.getElementById("root")!;

const app = (
  <HelmetProvider>
    <App />
  </HelmetProvider>
);

// If server-rendered HTML exists, hydrate instead of full client render
if (rootEl.hasAttribute('data-ssr')) {
  hydrateRoot(rootEl, app);
} else {
  createRoot(rootEl).render(app);
}
