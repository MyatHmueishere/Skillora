import React from 'react';

export type CourseIllustrationTheme =
  | 'code'
  | 'design'
  | 'data'
  | 'backend'
  | 'cloud'
  | 'mastery';

const THEME_PALETTES: Record<
  CourseIllustrationTheme,
  {
    bgGradient: string;
    accentSoft: string;
    accentText: string;
  }
> = {
  code: {
    bgGradient: 'linear-gradient(135deg, #F0E9FA 0%, #FAF6F2 60%, #E7DDF8 100%)',
    accentSoft: '#D7C7F2',
    accentText: '#6F4FA8',
  },
  design: {
    bgGradient: 'linear-gradient(135deg, #FCEAE5 0%, #FAF6F2 60%, #FAD9E2 100%)',
    accentSoft: '#F8C6D1',
    accentText: '#A84E68',
  },
  data: {
    bgGradient: 'linear-gradient(135deg, #E3F1E1 0%, #FAF6F2 60%, #D9ECDD 100%)',
    accentSoft: '#B9DEC0',
    accentText: '#2F623B',
  },
  backend: {
    bgGradient: 'linear-gradient(135deg, #FFF1D6 0%, #FAF6F2 60%, #FCEAE5 100%)',
    accentSoft: '#F9D1A8',
    accentText: '#945B26',
  },
  cloud: {
    bgGradient: 'linear-gradient(135deg, #EDE7FA 0%, #FAF6F2 60%, #E3F1E1 100%)',
    accentSoft: '#C5D8F5',
    accentText: '#495D9E',
  },
  mastery: {
    bgGradient: 'linear-gradient(135deg, #FCEAE5 0%, #FFF6E3 55%, #F0E9FA 100%)',
    accentSoft: '#F8D49A',
    accentText: '#8A5D20',
  },
};

export function inferCourseTheme(title: string, stageIndex: number): CourseIllustrationTheme {
  const lower = title.toLowerCase();
  if (
    lower.includes('design') ||
    lower.includes('ui') ||
    lower.includes('ux') ||
    lower.includes('css') ||
    lower.includes('accessibility') ||
    lower.includes('visual') ||
    lower.includes('figma')
  ) {
    return 'design';
  }
  if (
    lower.includes('data') ||
    lower.includes('sql') ||
    lower.includes('database') ||
    lower.includes('analytics') ||
    lower.includes('machine learning') ||
    lower.includes('pandas') ||
    lower.includes('ai')
  ) {
    return 'data';
  }
  if (
    lower.includes('backend') ||
    lower.includes('api') ||
    lower.includes('server') ||
    lower.includes('node') ||
    lower.includes('express') ||
    lower.includes('auth') ||
    lower.includes('security')
  ) {
    return 'backend';
  }
  if (
    lower.includes('cloud') ||
    lower.includes('docker') ||
    lower.includes('devops') ||
    lower.includes('deploy') ||
    lower.includes('git') ||
    lower.includes('architecture')
  ) {
    return 'cloud';
  }
  if (
    lower.includes('capstone') ||
    lower.includes('project') ||
    lower.includes('portfolio') ||
    lower.includes('production') ||
    lower.includes('interview') ||
    lower.includes('mastery')
  ) {
    return 'mastery';
  }
  if (
    lower.includes('javascript') ||
    lower.includes('typescript') ||
    lower.includes('python') ||
    lower.includes('react') ||
    lower.includes('html') ||
    lower.includes('fundamental') ||
    lower.includes('syntax') ||
    lower.includes('core')
  ) {
    return 'code';
  }

  const cycle: CourseIllustrationTheme[] = ['code', 'design', 'data', 'backend', 'cloud', 'mastery'];
  return cycle[stageIndex % cycle.length];
}

export function getCourseThemePalette(theme: CourseIllustrationTheme) {
  return THEME_PALETTES[theme];
}

/**
 * Original Soft Pastel 3D SVG course cover illustration tailored to each roadmap stage.
 */
export const CourseCoverIllustration: React.FC<{
  title: string;
  stageIndex: number;
  className?: string;
}> = ({ title, stageIndex, className = 'w-full h-36' }) => {
  const theme = inferCourseTheme(title, stageIndex);
  const palette = THEME_PALETTES[theme];
  const uid = `course-art-${theme}-${stageIndex}`;

  return (
    <div
      className={`relative overflow-hidden flex items-center justify-center ${className}`}
      style={{ background: palette.bgGradient }}
      aria-hidden="true"
    >
      {/* Subtle decorative clay blobs */}
      <div
        className="absolute -top-6 -right-6 w-24 h-24 rounded-full opacity-45 blur-md"
        style={{ backgroundColor: palette.accentSoft }}
      />
      <div
        className="absolute -bottom-8 -left-6 w-24 h-24 rounded-full opacity-35 blur-md"
        style={{ backgroundColor: palette.accentSoft }}
      />

      {theme === 'code' && (
        <svg viewBox="0 0 240 120" className="w-48 h-24 relative z-10" fill="none">
          <defs>
            <linearGradient id={`${uid}-card`} x1="40" y1="20" x2="200" y2="105" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#FFFFFF" />
              <stop offset="100%" stopColor="#F5EEFC" />
            </linearGradient>
            <linearGradient id={`${uid}-pill`} x1="0" y1="0" x2="60" y2="60" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#C9B7E8" />
              <stop offset="100%" stopColor="#9A7BCE" />
            </linearGradient>
            <filter id={`${uid}-sh`} x="-10%" y="-10%" width="120%" height="130%">
              <feDropShadow dx="0" dy="6" stdDeviation="5" floodColor="#7B59B6" floodOpacity="0.18" />
            </filter>
          </defs>
          {/* Floating Mint Block */}
          <rect x="26" y="24" width="38" height="38" rx="12" transform="rotate(-10 26 24)" fill="#DCECD9" filter={`url(#${uid}-sh)`} />
          <circle cx="45" cy="43" r="8" fill="#88C297" />
          {/* Main Clay Editor Card */}
          <rect x="52" y="18" width="136" height="84" rx="18" fill={`url(#${uid}-card)`} stroke="#E4D7F5" strokeWidth="2" filter={`url(#${uid}-sh)`} />
          <circle cx="70" cy="33" r="4" fill="#F2958D" />
          <circle cx="82" cy="33" r="4" fill="#FFD269" />
          <circle cx="94" cy="33" r="4" fill="#88C297" />
          <rect x="68" y="48" width="54" height="9" rx="4.5" fill="#C9B7E8" />
          <rect x="68" y="64" width="88" height="8" rx="4" fill="#EAE1F7" />
          <rect x="68" y="79" width="66" height="8" rx="4" fill="#F8D9D0" />
          {/* Floating Clay Code Bracket Badge */}
          <rect x="158" y="54" width="44" height="44" rx="14" fill={`url(#${uid}-pill)`} filter={`url(#${uid}-sh)`} />
          <path d="M174 70L168 76L174 82M186 70L192 76L186 82" stroke="#FFFFFF" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}

      {theme === 'design' && (
        <svg viewBox="0 0 240 120" className="w-48 h-24 relative z-10" fill="none">
          <defs>
            <linearGradient id={`${uid}-board`} x1="40" y1="15" x2="195" y2="105" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#FFFFFF" />
              <stop offset="100%" stopColor="#FFF1ED" />
            </linearGradient>
            <filter id={`${uid}-sh`} x="-10%" y="-10%" width="120%" height="130%">
              <feDropShadow dx="0" dy="6" stdDeviation="5" floodColor="#B86B5D" floodOpacity="0.18" />
            </filter>
          </defs>
          <rect x="48" y="18" width="144" height="84" rx="18" fill={`url(#${uid}-board)`} stroke="#F3D2C8" strokeWidth="2" filter={`url(#${uid}-sh)`} />
          {/* Layout Frame Elements */}
          <rect x="64" y="34" width="46" height="52" rx="12" fill="#F8D9D0" />
          <circle cx="87" cy="52" r="10" fill="#EE937E" />
          <rect x="74" y="69" width="26" height="6" rx="3" fill="#FFFFFF" />
          <rect x="120" y="34" width="56" height="22" rx="9" fill="#F0E9FA" />
          <rect x="120" y="64" width="56" height="22" rx="9" fill="#DCECD9" />
          {/* Floating Palette Disc */}
          <circle cx="188" cy="36" r="20" fill="#EE937E" filter={`url(#${uid}-sh)`} />
          <circle cx="182" cy="32" r="3.5" fill="#FFF1D6" />
          <circle cx="194" cy="34" r="3.5" fill="#DCECD9" />
          <circle cx="187" cy="43" r="3.5" fill="#F0E9FA" />
        </svg>
      )}

      {theme === 'data' && (
        <svg viewBox="0 0 240 120" className="w-48 h-24 relative z-10" fill="none">
          <defs>
            <linearGradient id={`${uid}-db`} x1="50" y1="20" x2="180" y2="100" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#FFFFFF" />
              <stop offset="100%" stopColor="#EDF7EC" />
            </linearGradient>
            <filter id={`${uid}-sh`} x="-10%" y="-10%" width="120%" height="130%">
              <feDropShadow dx="0" dy="6" stdDeviation="5" floodColor="#558C60" floodOpacity="0.18" />
            </filter>
          </defs>
          {/* Stacked 3D Database Discs */}
          <rect x="48" y="24" width="90" height="74" rx="18" fill={`url(#${uid}-db)`} stroke="#CBE3C7" strokeWidth="2" filter={`url(#${uid}-sh)`} />
          <rect x="64" y="66" width="12" height="20" rx="5" fill="#88C297" />
          <rect x="83" y="50" width="12" height="36" rx="5" fill="#A78BCE" />
          <rect x="102" y="40" width="12" height="46" rx="5" fill="#EE937E" />
          {/* Stacked Cylinder Badge */}
          <ellipse cx="168" cy="42" rx="28" ry="10" fill="#88C297" filter={`url(#${uid}-sh)`} />
          <path d="M140 42V62C140 67.5 152.5 72 168 72C183.5 72 196 67.5 196 62V42" fill="#A9D5B3" />
          <ellipse cx="168" cy="42" rx="28" ry="10" fill="#C4E8BC" />
          <path d="M140 62V80C140 85.5 152.5 90 168 90C183.5 90 196 85.5 196 80V62" fill="#88C297" />
        </svg>
      )}

      {theme === 'backend' && (
        <svg viewBox="0 0 240 120" className="w-48 h-24 relative z-10" fill="none">
          <defs>
            <filter id={`${uid}-sh`} x="-10%" y="-10%" width="120%" height="130%">
              <feDropShadow dx="0" dy="6" stdDeviation="5" floodColor="#B57D3B" floodOpacity="0.18" />
            </filter>
          </defs>
          {/* Connected API Nodes */}
          <path d="M72 60H168" stroke="#E8C794" strokeWidth="4" strokeLinecap="round" strokeDasharray="6 6" />
          <rect x="40" y="34" width="60" height="52" rx="16" fill="#FFFFFF" stroke="#F4DFB6" strokeWidth="2" filter={`url(#${uid}-sh)`} />
          <rect x="52" y="48" width="36" height="8" rx="4" fill="#F2C36B" />
          <rect x="52" y="62" width="24" height="8" rx="4" fill="#F8D9D0" />

          <circle cx="120" cy="60" r="18" fill="#EE937E" filter={`url(#${uid}-sh)`} />
          <path d="M114 60L119 65L128 55" stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />

          <rect x="142" y="34" width="58" height="52" rx="16" fill="#FFFFFF" stroke="#E4D7F5" strokeWidth="2" filter={`url(#${uid}-sh)`} />
          <rect x="154" y="48" width="34" height="8" rx="4" fill="#A78BCE" />
          <rect x="154" y="62" width="22" height="8" rx="4" fill="#DCECD9" />
        </svg>
      )}

      {theme === 'cloud' && (
        <svg viewBox="0 0 240 120" className="w-48 h-24 relative z-10" fill="none">
          <defs>
            <filter id={`${uid}-sh`} x="-10%" y="-10%" width="120%" height="130%">
              <feDropShadow dx="0" dy="6" stdDeviation="5" floodColor="#6E5AA3" floodOpacity="0.18" />
            </filter>
          </defs>
          {/* Soft 3D Cloud + Package Cube */}
          <g filter={`url(#${uid}-sh)`}>
            <circle cx="88" cy="54" r="22" fill="#FFFFFF" />
            <circle cx="116" cy="42" r="26" fill="#FFFFFF" />
            <circle cx="144" cy="54" r="21" fill="#FFFFFF" />
            <rect x="82" y="52" width="70" height="24" rx="12" fill="#FFFFFF" />
          </g>
          <rect x="142" y="58" width="42" height="42" rx="14" fill="#A78BCE" filter={`url(#${uid}-sh)`} />
          <rect x="152" y="68" width="22" height="22" rx="6" fill="#F0E9FA" />
          <circle cx="64" cy="76" r="14" fill="#88C297" filter={`url(#${uid}-sh)`} />
        </svg>
      )}

      {theme === 'mastery' && (
        <svg viewBox="0 0 240 120" className="w-48 h-24 relative z-10" fill="none">
          <defs>
            <radialGradient id={`${uid}-star`} cx="35%" cy="30%" r="70%">
              <stop offset="0%" stopColor="#FFF0B8" />
              <stop offset="65%" stopColor="#FFD269" />
              <stop offset="100%" stopColor="#E6A93B" />
            </radialGradient>
            <filter id={`${uid}-sh`} x="-10%" y="-10%" width="120%" height="130%">
              <feDropShadow dx="0" dy="6" stdDeviation="5" floodColor="#785A9E" floodOpacity="0.2" />
            </filter>
          </defs>
          {/* Layered Books + Gold Star */}
          <rect x="58" y="76" width="124" height="22" rx="9" fill="#B89FE2" filter={`url(#${uid}-sh)`} />
          <rect x="68" y="82" width="96" height="10" rx="4" fill="#FFFDFB" opacity="0.88" />
          <rect x="68" y="55" width="104" height="20" rx="8" fill="#F4A593" filter={`url(#${uid}-sh)`} />
          <rect x="78" y="60" width="76" height="9" rx="3.5" fill="#FFFDFB" opacity="0.88" />
          <path
            d="M120 14L126.5 27.5L141.5 29.6L130.6 40.1L133.2 55L120 47.9L106.8 55L109.4 40.1L98.5 29.6L113.5 27.5L120 14Z"
            fill={`url(#${uid}-star)`}
            filter={`url(#${uid}-sh)`}
          />
        </svg>
      )}
    </div>
  );
};
