import { mountPanel, PANEL_CSS, type Tab } from "../shared/panel";
import { chromeStore } from "./chromeStore";
import { SITE_URL } from "./siteUrl";

async function main() {
  const style = document.createElement("style");
  style.textContent = PANEL_CSS;
  document.head.append(style);
  const root = document.getElementById("app")!;
  const dark = matchMedia("(prefers-color-scheme: dark)");
  const theme = () => root.setAttribute("data-theme", dark.matches ? "dim" : "light");
  theme();
  dark.addEventListener("change", theme);
  const store = await chromeStore();
  const initialTab = (document.body.dataset.tab as Tab | undefined) ?? "pet";
  mountPanel(root, { store, shareUrl: SITE_URL, initialTab });
  const sync = () => {
    const lang = store.get()?.settings.lang ?? "en";
    document.documentElement.lang = lang;
  };
  sync();
  store.subscribe(sync);
}

void main();
