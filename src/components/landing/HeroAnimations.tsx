"use client";

import { useRef, type ReactNode } from "react";
import { useHeroEntranceAnimation } from "./useHeroEntranceAnimation";

/**
 * Fronteira client mínima: só existe para segurar o ref que escopa a
 * timeline do useHeroEntranceAnimation. LandingHeader/LandingHero/HeroVisual
 * continuam Server Components normais — a animação os alcança via seletor
 * `data-anim`, não via refs individuais passados por prop.
 */
export function HeroAnimations({ children }: { children: ReactNode }) {
  const scopeRef = useRef<HTMLDivElement>(null);
  useHeroEntranceAnimation(scopeRef);

  return (
    <div ref={scopeRef} className="flex min-h-screen flex-col bg-landing-background">
      {children}
    </div>
  );
}
