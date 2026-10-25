// Icônes dessinées pour Quilt Studio (SVG maison, aucune ressource externe).

interface IconProps {
  size?: number;
}

/** Logo : un moulinet (pinwheel) de quatre triangles demi-carré. */
export function LogoIcon({ size = 28 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect x="1" y="1" width="30" height="30" rx="4" fill="var(--logo-bg)" />
      <path d="M16 16 L16 3 L3 3 Z" fill="var(--accent-quilt)" />
      <path d="M16 16 L29 16 L29 3 Z" fill="var(--accent-block)" />
      <path d="M16 16 L16 29 L29 29 Z" fill="var(--accent-quilt)" />
      <path d="M16 16 L3 16 L3 29 Z" fill="var(--accent-block)" />
    </svg>
  );
}

/** Plan Quilt : une grille de blocs avec bordure. */
export function QuiltIcon({ size = 20 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="2.5" y="2.5" width="19" height="19" rx="1.5" />
      <rect x="5.5" y="5.5" width="13" height="13" />
      <path d="M12 5.5v13M5.5 12h13" />
    </svg>
  );
}

/** Plan Bloc : une étoile de l'Ohio simplifiée. */
export function BlockIcon({ size = 20 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="2.5" y="2.5" width="19" height="19" rx="1.5" />
      <path d="M8.8 2.5v19M15.2 2.5v19M2.5 8.8h19M2.5 15.2h19" strokeWidth="1" />
      <path d="M8.8 2.5 15.2 8.8M15.2 2.5 8.8 8.8M15.2 8.8 21.5 15.2M21.5 8.8 15.2 15.2M8.8 15.2 15.2 21.5M15.2 15.2 8.8 21.5M2.5 8.8 8.8 15.2M8.8 8.8 2.5 15.2" strokeWidth="1" />
    </svg>
  );
}

/** Plan Image : un cadre avec un paysage. */
export function ImageIcon({ size = 20 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="2.5" y="4" width="19" height="16" rx="1.5" />
      <circle cx="8.5" cy="9.5" r="1.8" />
      <path d="M3 18.5 9.5 13l4 3.5 3-2.5 5 4" />
    </svg>
  );
}
