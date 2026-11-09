// The light and dark themes.
import { $ } from "../lib/dom.js";
import { redrawDiagram } from "../output/diagram-view.js";

const $themeToggle = $<HTMLButtonElement>("themeToggle");
const $themeIconMoon = $("themeIconMoon");
const $themeIconSun = $("themeIconSun");

function applyTheme(theme: string): void {
  const light = theme === "light";
  if (light) document.documentElement.setAttribute("data-theme", "light");
  else document.documentElement.removeAttribute("data-theme");
  // `.hidden` is an HTMLElement property; these icons are SVGElements where it is
  // a no-op, so toggle the attribute directly (see .ic[hidden] in styles.css).
  $themeIconMoon.toggleAttribute("hidden", light);
  $themeIconSun.toggleAttribute("hidden", !light);
}

// The saved choice, else the system setting
applyTheme(
  localStorage.getItem("linkml-ui-theme") ??
    (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark"),
);

$themeToggle.addEventListener("click", () => {
  const next = document.documentElement.getAttribute("data-theme") === "light" ? "dark" : "light";
  applyTheme(next);
  localStorage.setItem("linkml-ui-theme", next);
  // A rendered diagram bakes in the theme's colours, so it has to be drawn again to follow along.
  redrawDiagram();
});
