// ---------------------------------------------------------------------------
// Settings modal — graphics, audio, gameplay, accessibility.
// ---------------------------------------------------------------------------

import { el, button, clear } from "./dom";
import { settings } from "../settings";
import { audio } from "../audio/AudioManager";
import { Arena } from "../arena/Arena";

export function openSettings(host: HTMLElement, arena: Arena | null, onClose: () => void): void {
  const existing = host.querySelector(".settings-modal");
  if (existing) existing.remove();

  const overlay = el("div", { class: "overlay settings-modal" });
  const box = el("div", { class: "settings-box" });
  box.append(el("div", { class: "dialog-title", text: "SETTINGS" }));
  const body = el("div", { class: "settings-body" });
  box.append(body);

  const s = settings.get();

  const section = (title: string) => {
    const t = el("div", { class: "settings-section", text: title });
    body.append(t);
    return body;
  };

  const row = (parent: HTMLElement, label: string, control: HTMLElement) => {
    const r = el("div", { class: "settings-row" });
    r.append(el("span", { class: "settings-label", text: label }), control);
    parent.append(r);
  };

  const checkbox = (value: boolean, onChange: (v: boolean) => void) => {
    const c = el("input", { class: "chk", attrs: { type: "checkbox" } }) as HTMLInputElement;
    c.checked = value;
    c.addEventListener("change", () => onChange(c.checked));
    return c;
  };

  const slider = (value: number, min: number, max: number, step: number, onChange: (v: number) => void) => {
    const c = el("input", { class: "slider", attrs: { type: "range", min: String(min), max: String(max), step: String(step) } }) as HTMLInputElement;
    c.value = String(value);
    c.addEventListener("input", () => onChange(parseFloat(c.value)));
    return c;
  };

  const select = (options: string[], value: string, onChange: (v: string) => void) => {
    const sel = el("select", { class: "sel" }) as HTMLSelectElement;
    for (const o of options) {
      const opt = el("option", { text: o.toUpperCase(), attrs: { value: o } }) as HTMLOptionElement;
      if (o === value) opt.selected = true;
      sel.append(opt);
    }
    sel.addEventListener("change", () => onChange(sel.value));
    return sel;
  };

  // --- Graphics
  section("GRAPHICS");
  row(body, "Quality", select(["low", "medium", "high"], s.graphics.quality, (v) => {
    settings.update((st) => (st.graphics.quality = v as "low" | "medium" | "high"));
    if (v === "low") settings.update((st) => (st.graphics.shadows = false));
    arena?.applyGraphicsSettings();
  }));
  row(body, "Shadows", checkbox(s.graphics.shadows, (v) => {
    settings.update((st) => (st.graphics.shadows = v));
    arena?.applyGraphicsSettings();
  }));
  row(body, "Effects & particles", checkbox(s.graphics.effects, (v) => {
    settings.update((st) => (st.graphics.effects = v));
    arena?.applyGraphicsSettings();
  }));
  row(body, "Anti-aliasing (applies on reload)", checkbox(s.graphics.antialias, (v) => {
    settings.update((st) => (st.graphics.antialias = v));
  }));
  row(body, "Pixel ratio", slider(s.graphics.pixelRatio, 0.75, 2, 0.25, (v) => {
    settings.update((st) => (st.graphics.pixelRatio = v));
    arena?.applyGraphicsSettings();
  }));

  // --- Audio
  section("AUDIO");
  const mkVol = (label: string, key: "master" | "music" | "sfx" | "ambient") => {
    row(body, label, slider(s.audio[key], 0, 1, 0.05, (v) => {
      settings.update((st) => (st.audio[key] = v));
      audio.applyVolumes();
      if (key === "sfx") audio.play("ui");
    }));
  };
  mkVol("Master volume", "master");
  mkVol("Music", "music");
  mkVol("Effects", "sfx");
  mkVol("Ambience", "ambient");

  // --- Gameplay
  section("GAMEPLAY");
  row(body, "Legal move indicators", checkbox(s.gameplay.showLegalMoves, (v) => {
    settings.update((st) => (st.gameplay.showLegalMoves = v));
  }));
  row(body, "Confirm move", checkbox(s.gameplay.confirmMove, (v) => {
    settings.update((st) => (st.gameplay.confirmMove = v));
  }));
  row(body, "Animation speed", slider(s.gameplay.animationSpeed, 0.5, 2, 0.1, (v) => {
    settings.update((st) => (st.gameplay.animationSpeed = v));
  }));
  row(body, "Camera effects", checkbox(s.gameplay.cameraEffects, (v) => {
    settings.update((st) => (st.gameplay.cameraEffects = v));
  }));

  // --- Accessibility
  section("ACCESSIBILITY");
  row(body, "Reduced motion", checkbox(s.accessibility.reducedMotion, (v) => {
    settings.update((st) => (st.accessibility.reducedMotion = v));
  }));
  row(body, "High contrast", checkbox(s.accessibility.highContrast, (v) => {
    settings.update((st) => (st.accessibility.highContrast = v));
    document.body.classList.toggle("high-contrast", v);
  }));
  row(body, "Screen shake", checkbox(s.accessibility.screenShake, (v) => {
    settings.update((st) => (st.accessibility.screenShake = v));
  }));

  const foot = el("div", { class: "settings-foot" });
  foot.append(button("CLOSE", () => { audio.play("ui"); overlay.remove(); onClose(); }, "btn btn-gold"));
  box.append(foot);
  overlay.append(box);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) {
      overlay.remove();
      onClose();
    }
  });
  host.append(overlay);
}
