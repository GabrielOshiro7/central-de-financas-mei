"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import type { RefObject } from "react";

const ENTRANCE_DEFAULTS: gsap.TweenVars = { ease: "power2.out" };
const SLIDE_DISTANCE = 50;
const HEADER_RISE = 20;

interface OscillationConfig {
  amplitude: number;
  duration: number;
  delay?: number;
}

interface FloatLoopConfig {
  selector: string;
  /** translateY, em px (amplitude total, ex.: 16 = de -8 a +8). */
  y: OscillationConfig;
  /** rotation, em graus (amplitude total, ex.: 3 = de -1.5 a +1.5). */
  rotation: OscillationConfig;
  /** scale, desvio em torno de 1 (amplitude total, ex.: 0.04 = de 0.98 a 1.02). */
  scale: OscillationConfig;
}

/** Balão e card "mini": cada camada (y/rotation/scale) tem sua própria
 * duração e delay, deliberadamente diferentes entre si e entre os dois
 * elementos — nenhuma delas nunca fica em fase com outra, o que é o que faz
 * o flutuar parecer orgânico (água) em vez de mecânico (vara/trilho). */
const FLOAT_LOOPS: Record<"badge" | "mini", FloatLoopConfig> = {
  badge: {
    selector: "[data-anim='hero-badge']",
    y: { amplitude: 16, duration: 2.6 },
    rotation: { amplitude: 3, duration: 3.4, delay: 0.15 },
    scale: { amplitude: 0.04, duration: 2.6 },
  },
  mini: {
    selector: "[data-anim='hero-mini']",
    y: { amplitude: 18, duration: 3.8, delay: 0.4 },
    rotation: { amplitude: 3, duration: 2.9, delay: 0.55 },
    scale: { amplitude: 0.04, duration: 3.8, delay: 0.4 },
  },
};

/** Uma única propriedade oscilando entre `base - amplitude/2` e
 * `base + amplitude/2`. Cada chamada é uma tween GSAP independente (não uma
 * timeline), para que y/rotation/scale corram em paralelo sem ficarem
 * acopladas em fase umas às outras. */
function startOscillation(
  selector: string,
  property: "y" | "rotation" | "scale",
  base: number,
  { amplitude, duration, delay = 0 }: OscillationConfig
) {
  const half = amplitude / 2;
  gsap.fromTo(
    selector,
    { [property]: base - half },
    { [property]: base + half, duration, delay, ease: "sine.inOut", yoyo: true, repeat: -1 }
  );
}

function startFloatLoop({ selector, y, rotation, scale }: FloatLoopConfig) {
  startOscillation(selector, "y", 0, y);
  startOscillation(selector, "rotation", 0, rotation);
  startOscillation(selector, "scale", 1, scale);
}

/**
 * Timeline de entrada da Hero, escopada a `scopeRef` via useGSAP (que cuida
 * do gsap.context e do revert automático no unmount). Os alvos são
 * selecionados por atributo `data-anim`/`data-bar-featured` nos componentes
 * de layout (LandingHeader/LandingHero/HeroVisual) em vez de refs
 * individuais, para não precisar tornar esses componentes client só por
 * causa da animação.
 */
export function useHeroEntranceAnimation(scopeRef: RefObject<HTMLElement | null>) {
  useGSAP(
    (_context, contextSafe) => {
      const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      if (prefersReducedMotion) {
        gsap.set("[data-anim]", { opacity: 1, x: 0, y: 0, rotation: 0, scale: 1, scaleY: 1 });
        return;
      }

      // contextSafe: onComplete roda depois que a timeline de entrada já
      // terminou de ser montada, então gsap.fromTo criado ali dentro não
      // seria capturado pelo contexto automaticamente — contextSafe garante
      // que o loop ainda é revertido/killado no unmount.
      const startBadgeFloat = contextSafe!(() => startFloatLoop(FLOAT_LOOPS.badge));
      const startMiniFloat = contextSafe!(() => startFloatLoop(FLOAT_LOOPS.mini));

      const tl = gsap.timeline({ defaults: ENTRANCE_DEFAULTS });

      tl.from("[data-anim='header']", { opacity: 0, y: -HEADER_RISE, duration: 0.6 })
        .from(
          "[data-anim='hero-title']",
          { opacity: 0, x: -SLIDE_DISTANCE, duration: 0.7 },
          "-=0.3"
        )
        .from(
          "[data-anim='hero-subtitle']",
          { opacity: 0, x: -SLIDE_DISTANCE, duration: 0.6 },
          "-=0.5"
        )
        .from(
          "[data-anim='hero-buttons']",
          { opacity: 0, x: -SLIDE_DISTANCE, duration: 0.6 },
          "-=0.45"
        )
        .from(
          "[data-anim='hero-card']",
          { opacity: 0, x: SLIDE_DISTANCE, duration: 0.7, ease: "power3.out" },
          "-=0.2"
        )
        .addLabel("cardDone")
        .from(
          "[data-anim='hero-bar']",
          { scaleY: 0, transformOrigin: "bottom", duration: 0.6, stagger: 0.08 },
          "cardDone"
        )
        .addLabel("barsDone")
        .from(
          "[data-anim='hero-badge']",
          { opacity: 0, x: SLIDE_DISTANCE, duration: 0.6, onComplete: startBadgeFloat },
          "cardDone+=0.12"
        )
        .from("[data-anim='hero-badge-icon']", { opacity: 0, scale: 0.6, duration: 0.4 }, "<")
        .from(
          "[data-anim='hero-mini']",
          { opacity: 0, x: SLIDE_DISTANCE, duration: 0.5, onComplete: startMiniFloat },
          "cardDone+=0.12"
        )
        .to(
          "[data-bar-featured]",
          { scale: 1.03, duration: 0.1, yoyo: true, repeat: 1 },
          "barsDone"
        );
    },
    { scope: scopeRef }
  );
}
