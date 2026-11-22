export function getProductIllustration(iconKey, category = "") {
  const key = (iconKey || category || "custom").toLowerCase();

  if (key.includes("motor")) {
    return `
      <svg viewBox="0 0 220 140" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <defs>
          <pattern id="grid-motor" width="16" height="16" patternUnits="userSpaceOnUse">
            <path d="M 16 0 L 0 0 0 16" fill="none" stroke="#E7E5E0" stroke-width="0.7"/>
          </pattern>
        </defs>
        <rect width="220" height="140" fill="url(#grid-motor)"/>
        <ellipse cx="110" cy="116" rx="52" ry="9" fill="#E4E4E7"/>
        <path d="M68 48 L152 48 L144 108 L76 108 Z" fill="#FFFFFF" stroke="#18181B" stroke-width="2" stroke-linejoin="round"/>
        <ellipse cx="110" cy="48" rx="42" ry="11" fill="#F4F4F5" stroke="#18181B" stroke-width="2"/>
        <ellipse cx="110" cy="48" rx="28" ry="6.5" fill="#BE185D" fill-opacity="0.16" stroke="#BE185D" stroke-width="1.6"/>
        <line x1="88" y1="68" x2="92" y2="96" stroke="#18181B" stroke-width="1.8" stroke-linecap="round"/>
        <line x1="110" y1="68" x2="110" y2="98" stroke="#BE185D" stroke-width="2" stroke-linecap="round"/>
        <line x1="132" y1="68" x2="128" y2="96" stroke="#18181B" stroke-width="1.8" stroke-linecap="round"/>
        <circle cx="110" cy="24" r="2.5" fill="#BE185D"/>
        <path d="M126 16 L112 46" stroke="#18181B" stroke-width="2" stroke-linecap="round"/>
      </svg>`;
  }

  if (key.includes("tuerca")) {
    return `
      <svg viewBox="0 0 220 140" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <defs>
          <pattern id="grid-tuerca" width="16" height="16" patternUnits="userSpaceOnUse">
            <path d="M 16 0 L 0 0 0 16" fill="none" stroke="#E7E5E0" stroke-width="0.7"/>
          </pattern>
        </defs>
        <rect width="220" height="140" fill="url(#grid-tuerca)"/>
        <ellipse cx="110" cy="116" rx="50" ry="9" fill="#E4E4E7"/>
        <polygon points="110,26 154,46 154,96 110,114 66,96 66,46" fill="#FFFFFF" stroke="#18181B" stroke-width="2" stroke-linejoin="round"/>
        <polygon points="110,26 154,46 110,64 66,46" fill="#F4F4F5" stroke="#18181B" stroke-width="2" stroke-linejoin="round"/>
        <line x1="110" y1="64" x2="110" y2="114" stroke="#18181B" stroke-width="1.8"/>
        <ellipse cx="110" cy="45" rx="22" ry="8" fill="#BE185D" fill-opacity="0.14" stroke="#BE185D" stroke-width="1.8"/>
        <line x1="128" y1="18" x2="113" y2="45" stroke="#18181B" stroke-width="2" stroke-linecap="round"/>
      </svg>`;
  }

  if (key.includes("ajedrez") || key.includes("juego")) {
    return `
      <svg viewBox="0 0 220 140" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <defs>
          <pattern id="grid-chess" width="16" height="16" patternUnits="userSpaceOnUse">
            <path d="M 16 0 L 0 0 0 16" fill="none" stroke="#E7E5E0" stroke-width="0.7"/>
          </pattern>
        </defs>
        <rect width="220" height="140" fill="url(#grid-chess)"/>
        <polygon points="44,104 110,82 176,104 110,124" fill="#FFFFFF" stroke="#18181B" stroke-width="1.8" stroke-linejoin="round"/>
        <polygon points="77,93 110,82 143,93 110,104" fill="#18181B" fill-opacity="0.08"/>
        <path d="M95 92 L95 54 L89 54 L89 42 L97 42 L97 47 L104 47 L104 42 L116 42 L116 47 L123 47 L123 42 L131 42 L131 54 L125 54 L125 92 Z" fill="#FFFFFF" stroke="#18181B" stroke-width="2" stroke-linejoin="round"/>
        <rect x="89" y="92" width="42" height="8" rx="2" fill="#BE185D" fill-opacity="0.18" stroke="#BE185D" stroke-width="1.8"/>
        <line x1="99" y1="64" x2="121" y2="64" stroke="#A1A1AA" stroke-width="1.2"/>
        <line x1="99" y1="72" x2="121" y2="72" stroke="#A1A1AA" stroke-width="1.2"/>
        <line x1="99" y1="80" x2="121" y2="80" stroke="#A1A1AA" stroke-width="1.2"/>
      </svg>`;
  }

  return `
    <svg viewBox="0 0 220 140" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <pattern id="grid-custom" width="16" height="16" patternUnits="userSpaceOnUse">
          <path d="M 16 0 L 0 0 0 16" fill="none" stroke="#E7E5E0" stroke-width="0.7"/>
        </pattern>
      </defs>
      <rect width="220" height="140" fill="url(#grid-custom)"/>
      <polygon points="110,24 152,48 152,92 110,116 68,92 68,48" fill="#FFFFFF" stroke="#18181B" stroke-width="2" stroke-linejoin="round"/>
      <polyline points="68,48 110,72 152,48" stroke="#18181B" stroke-width="1.8" stroke-linejoin="round"/>
      <line x1="110" y1="72" x2="110" y2="116" stroke="#18181B" stroke-width="1.8"/>
      <polygon points="110,36 138,52 110,68 82,52" fill="#BE185D" fill-opacity="0.15" stroke="#BE185D" stroke-width="1.5"/>
    </svg>`;
}
