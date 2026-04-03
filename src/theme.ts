import { $, $$ } from "./dom";

export function setupTheme(): void {
  const root = document.documentElement;
  const toggleBtn = $("#theme-toggle")!;

  const savedTheme = localStorage.getItem("bb-theme") ?? "dark";
  const savedAccent = localStorage.getItem("bb-accent") ?? "amber";
  root.setAttribute("data-theme", savedTheme);
  root.setAttribute("data-accent", savedAccent);
  toggleBtn.textContent = savedTheme === "dark" ? "\u{1F319}" : "\u{2600}\u{FE0F}";

  $$(".accent-swatch").forEach(s => {
    s.classList.toggle("active", s.getAttribute("data-accent") === savedAccent);
  });

  toggleBtn.addEventListener("click", () => {
    const current = root.getAttribute("data-theme");
    const next = current === "dark" ? "light" : "dark";
    root.setAttribute("data-theme", next);
    localStorage.setItem("bb-theme", next);
    toggleBtn.textContent = next === "dark" ? "\u{1F319}" : "\u{2600}\u{FE0F}";
  });

  for (const swatch of $$(".accent-swatch")) {
    swatch.addEventListener("click", () => {
      const accent = swatch.getAttribute("data-accent")!;
      root.setAttribute("data-accent", accent);
      localStorage.setItem("bb-accent", accent);
      $$(".accent-swatch").forEach(s => s.classList.toggle("active", s === swatch));
    });
  }
}
