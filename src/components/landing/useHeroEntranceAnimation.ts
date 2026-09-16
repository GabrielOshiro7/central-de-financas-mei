"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import type { RefObject } from "react";

const ENTRANCE_DEFAULTS: gsap.TweenVars = { ease: "power2.out" };
const SLIDE_DISTANCE = 50;
const HEADER_RISE = 20;

interface FloatLoopConfig {
  selector: string;
  amplitude: number;
  duration: number;
  delay?: number;
}

/** Balão e card "mini": ciclo e delay propositalmente diferentes entre os
 * dois para não se moverem em espelho (ficaria sincronizado/artificial). */
const FLOAT_LOOPS: Record<"badge" | "mini", FloatLoopConfig> = {
  badge: { selector: "[data-anim='hero-badge']", amplitude: 5, duration: 2.5 },
  mini: { selector: "[data-anim='hero-mini']", amplitude: 5, duration: 3.2, delay: 0.4 },
};

function startFloatLoop({ selector, amplitude, duration, delay = 0 }: FloatLoopConfig) {
  const halfAmplitude = amplitude / 2;
  gsap.fromTo(
    selector,
    { y: -halfAmplitude },
    { y: halfAmplitude, duration, delay, ease: "sine.inOut", yoyo: true, repeat: -1 }
  );
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
        gsap.set("[data-anim]", { opacity: 1, x: 0, y: 0, scale: 1, scaleY: 1 });
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
