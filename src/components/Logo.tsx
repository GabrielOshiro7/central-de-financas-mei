/**
 * Marca "OrganizAI" (anel com corte diagonal) — compartilhada entre a
 * landing (LandingLogo) e o app autenticado (Sidebar). Ícone provisório até
 * termos o PNG real recortado em public/logo/; vetor + currentColor por
 * consistência com o texto ao lado, evitando precisar de filter:invert.
 */
export function LogoMark({ className = "h-9 w-9" }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" fill="none" aria-hidden="true" className={`shrink-0 ${className}`}>
      <circle
        cx="20"
        cy="20"
        r="16"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
        strokeDasharray="70 30.5"
        transform="rotate(-45 20 20)"
      />
    </svg>
  );
}
