import React from 'react';

export type ClayColorVariant = 'lavender' | 'peach' | 'mint' | 'yellow' | 'pink';

interface ClayIconBadgeProps {
  variant?: ClayColorVariant;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const ClayIconBadge: React.FC<ClayIconBadgeProps> = ({
  variant = 'lavender',
  children,
  size = 'md',
  className = '',
}) => {
  const sizeClasses = {
    sm: 'w-9 h-9 rounded-[12px]',
    md: 'w-11 h-11 rounded-[15px]',
    lg: 'w-14 h-14 rounded-[18px]',
  };

  const variantClasses: Record<ClayColorVariant, string> = {
    lavender: 'clay-squircle-lavender text-white',
    peach: 'clay-squircle-peach text-white',
    mint: 'clay-squircle-mint text-white',
    yellow: 'clay-squircle-yellow text-white',
    pink: 'clay-squircle-pink text-white',
  };

  return (
    <div
      className={`inline-flex items-center justify-center shrink-0 ${sizeClasses[size]} ${variantClasses[variant]} ${className}`}
    >
      {children}
    </div>
  );
};

/* Cute 3D Bear/Companion Badge for the Top-Left Sidebar Logo (inspired by reference) */
export const MascotBrandBadge3D: React.FC<{ className?: string }> = ({ className = 'w-11 h-11' }) => (
  <svg viewBox="0 0 80 80" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="peachSphere" cx="35%" cy="30%" r="70%">
        <stop offset="0%" stopColor="#FFC8BA" />
        <stop offset="65%" stopColor="#F4A593" />
        <stop offset="100%" stopColor="#E18673" />
      </radialGradient>
      <radialGradient id="creamBear" cx="40%" cy="35%" r="65%">
        <stop offset="0%" stopColor="#FFFFFF" />
        <stop offset="80%" stopColor="#FFF4EE" />
        <stop offset="100%" stopColor="#F3DFD6" />
      </radialGradient>
      <filter id="softClayShadow" x="-15%" y="-10%" width="130%" height="135%">
        <feDropShadow dx="0" dy="4" stdDeviation="3.5" floodColor="#78538A" floodOpacity="0.25" />
      </filter>
    </defs>
    <circle cx="40" cy="40" r="34" fill="url(#peachSphere)" filter="url(#softClayShadow)" />
    {/* Subtle highlight */}
    <ellipse cx="29" cy="22" rx="12" ry="6" transform="rotate(-25 29 22)" fill="#FFFFFF" opacity="0.35" />
    {/* Cute Bear Ears */}
    <circle cx="24" cy="27" r="7.5" fill="url(#creamBear)" />
    <circle cx="56" cy="27" r="7.5" fill="url(#creamBear)" />
    <circle cx="24" cy="27" r="3.8" fill="#F6B5A7" />
    <circle cx="56" cy="27" r="3.8" fill="#F6B5A7" />
    {/* Cute Bear Head */}
    <ellipse cx="40" cy="42" rx="19" ry="16" fill="url(#creamBear)" />
    {/* Eyes & Cheeks */}
    <circle cx="33" cy="40" r="2.3" fill="#343047" />
    <circle cx="47" cy="40" r="2.3" fill="#343047" />
    <circle cx="32.2" cy="39.2" r="0.8" fill="#FFFFFF" />
    <circle cx="46.2" cy="39.2" r="0.8" fill="#FFFFFF" />
    <ellipse cx="28" cy="44.5" rx="3.2" ry="1.8" fill="#F6B5B5" opacity="0.7" />
    <ellipse cx="52" cy="44.5" rx="3.2" ry="1.8" fill="#F6B5B5" opacity="0.7" />
    {/* Nose & Smile */}
    <ellipse cx="40" cy="43.5" rx="2.6" ry="1.8" fill="#E88D7D" />
    <path d="M36.5 46.8C38 48.5 42 48.5 43.5 46.8" stroke="#343047" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

/* Cute 3D Potted Succulent Plant for Sidebar Bottom & Cards */
export const PottedPlant3D: React.FC<{ className?: string }> = ({ className = 'w-24 h-28' }) => (
  <svg viewBox="0 0 120 140" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="potGrad" x1="20" y1="82" x2="95" y2="128" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#FFF7F0" />
        <stop offset="60%" stopColor="#F2E4DC" />
        <stop offset="100%" stopColor="#DECAC0" />
      </linearGradient>
      <radialGradient id="leafGrad1" cx="35%" cy="30%" r="70%">
        <stop offset="0%" stopColor="#C4E8BC" />
        <stop offset="65%" stopColor="#92CA8B" />
        <stop offset="100%" stopColor="#72AE6C" />
      </radialGradient>
      <radialGradient id="leafGrad2" cx="35%" cy="30%" r="70%">
        <stop offset="0%" stopColor="#D6F1CE" />
        <stop offset="65%" stopColor="#A5D89E" />
        <stop offset="100%" stopColor="#7EBA78" />
      </radialGradient>
      <filter id="plantShadow" x="-20%" y="-10%" width="140%" height="130%">
        <feDropShadow dx="0" dy="8" stdDeviation="6" floodColor="#6E528C" floodOpacity="0.25" />
      </filter>
    </defs>

    {/* Soft shadow under pot */}
    <ellipse cx="60" cy="128" rx="30" ry="6" fill="#785A9E" opacity="0.28" />

    {/* Back Leaves */}
    <ellipse cx="44" cy="60" rx="11" ry="18" transform="rotate(-22 44 60)" fill="url(#leafGrad1)" />
    <ellipse cx="76" cy="58" rx="11" ry="18" transform="rotate(24 76 58)" fill="url(#leafGrad1)" />
    <ellipse cx="60" cy="40" rx="10" ry="19" fill="url(#leafGrad2)" />

    {/* Middle Leaves */}
    <ellipse cx="38" cy="73" rx="10" ry="15" transform="rotate(-38 38 73)" fill="url(#leafGrad2)" />
    <ellipse cx="82" cy="73" rx="10" ry="15" transform="rotate(38 82 73)" fill="url(#leafGrad2)" />
    <ellipse cx="52" cy="55" rx="9" ry="15" transform="rotate(-12 52 55)" fill="url(#leafGrad2)" />
    <ellipse cx="68" cy="55" rx="9" ry="15" transform="rotate(12 68 55)" fill="url(#leafGrad1)" />

    {/* Front plump leaves */}
    <ellipse cx="60" cy="68" rx="10" ry="14" fill="url(#leafGrad2)" />
    <ellipse cx="48" cy="77" rx="8.5" ry="11" transform="rotate(-18 48 77)" fill="url(#leafGrad1)" />
    <ellipse cx="72" cy="77" rx="8.5" ry="11" transform="rotate(18 72 77)" fill="url(#leafGrad2)" />

    {/* Soil Rim */}
    <ellipse cx="60" cy="85" rx="27" ry="6.5" fill="#9A7E75" />

    {/* Ceramic Pot */}
    <path
      d="M32 85C32 85 36 122 42 125C49 128 71 128 78 125C84 122 88 85 88 85C88 89 75 91.5 60 91.5C45 91.5 32 89 32 85Z"
      fill="url(#potGrad)"
      filter="url(#plantShadow)"
    />
    {/* Pot Rim */}
    <ellipse cx="60" cy="85" rx="28" ry="6" stroke="#FAF0EB" strokeWidth="2.5" fill="none" />
    {/* Specular highlight on pot */}
    <path d="M40 94C41 106 43 114 45 119" stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round" opacity="0.6" />
  </svg>
);

/* Cute 3D Student Character (inspired by the winking student character in the reference) */
export const CuteStudentCharacter3D: React.FC<{ className?: string }> = ({ className = 'w-40 h-40' }) => (
  <svg viewBox="0 0 200 200" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="skinTone" cx="42%" cy="35%" r="65%">
        <stop offset="0%" stopColor="#FFE0CE" />
        <stop offset="70%" stopColor="#F8C2A8" />
        <stop offset="100%" stopColor="#EAA486" />
      </radialGradient>
      <radialGradient id="hairGrad" cx="35%" cy="30%" r="70%">
        <stop offset="0%" stopColor="#7C5343" />
        <stop offset="65%" stopColor="#5D3A2E" />
        <stop offset="100%" stopColor="#43271E" />
      </radialGradient>
      <linearGradient id="sweaterGrad" x1="50" y1="130" x2="150" y2="195" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#D7C7F2" />
        <stop offset="65%" stopColor="#B99FE4" />
        <stop offset="100%" stopColor="#9D7FD0" />
      </linearGradient>
      <filter id="charShadow" x="-15%" y="-10%" width="130%" height="130%">
        <feDropShadow dx="0" dy="8" stdDeviation="6" floodColor="#B77D70" floodOpacity="0.22" />
      </filter>
    </defs>

    {/* Top Hair Bun */}
    <circle cx="100" cy="36" r="24" fill="url(#hairGrad)" filter="url(#charShadow)" />
    <ellipse cx="94" cy="27" rx="10" ry="5" transform="rotate(-15 94 27)" fill="#9E705D" opacity="0.4" />
    {/* Cute Lavender Scrunchie */}
    <ellipse cx="100" cy="54" rx="18" ry="6" fill="#C9B7E8" />

    {/* Back Hair */}
    <ellipse cx="100" cy="86" rx="48" ry="44" fill="url(#hairGrad)" />

    {/* Cozy Lavender Sweater */}
    <path
      d="M42 195C42 162 66 140 100 140C134 140 158 162 158 195H42Z"
      fill="url(#sweaterGrad)"
      filter="url(#charShadow)"
    />
    {/* Sweater Collar */}
    <path
      d="M78 142C84 154 116 154 122 142"
      stroke="#EAE0FA"
      strokeWidth="6"
      strokeLinecap="round"
    />

    {/* Neck */}
    <rect x="90" y="124" width="20" height="22" rx="10" fill="#F0B196" />

    {/* Ears & Gold Hoops */}
    <ellipse cx="56" cy="96" rx="8" ry="11" fill="url(#skinTone)" />
    <ellipse cx="144" cy="96" rx="8" ry="11" fill="url(#skinTone)" />
    <circle cx="55" cy="107" r="4.5" stroke="#F4C773" strokeWidth="2.5" />
    <circle cx="145" cy="107" r="4.5" stroke="#F4C773" strokeWidth="2.5" />

    {/* Face */}
    <ellipse cx="100" cy="94" rx="42" ry="41" fill="url(#skinTone)" filter="url(#charShadow)" />

    {/* Hair Bangs / Swoop */}
    <path
      d="M57 86C60 54 90 48 106 50C128 52 142 64 143 87C134 73 116 67 100 72C82 77 68 74 57 86Z"
      fill="url(#hairGrad)"
    />
    <path
      d="M62 72C75 61 98 60 112 65"
      stroke="#9E705D"
      strokeWidth="3"
      strokeLinecap="round"
      opacity="0.35"
    />

    {/* Eyebrows */}
    <path d="M74 79C79 75 86 75 90 78" stroke="#4D3026" strokeWidth="3" strokeLinecap="round" />
    <path d="M111 78C116 75 123 76 127 80" stroke="#4D3026" strokeWidth="3" strokeLinecap="round" />

    {/* Left Eye (Open cute shiny eye) */}
    <circle cx="82" cy="92" r="7.5" fill="#342623" />
    <circle cx="79.5" cy="89.5" r="2.8" fill="#FFFFFF" />
    <circle cx="84.5" cy="94.5" r="1.2" fill="#FFFFFF" />

    {/* Right Eye (Cute Wink!) */}
    <path
      d="M110 92C113 86 123 86 126 92"
      stroke="#342623"
      strokeWidth="3.5"
      strokeLinecap="round"
    />

    {/* Rosy Cheeks */}
    <ellipse cx="70" cy="104" rx="8" ry="4.5" fill="#F2958D" opacity="0.55" />
    <ellipse cx="130" cy="104" rx="8" ry="4.5" fill="#F2958D" opacity="0.55" />

    {/* Cute Nose */}
    <ellipse cx="100" cy="100" rx="4" ry="2.8" fill="#EB9E82" />

    {/* Happy Smile */}
    <path
      d="M88 112C94 120 108 120 114 112"
      stroke="#6B3D32"
      strokeWidth="3.2"
      strokeLinecap="round"
    />

    {/* Cute Hand resting on chin */}
    <ellipse cx="123" cy="144" rx="14" ry="11" fill="url(#skinTone)" filter="url(#charShadow)" />
    <path d="M114 140C118 136 126 136 130 140" stroke="#EAA486" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

/* Cute 3D Smiling Cloud Mascot (used for Encouragement Card & AI Assistant Mascot) */
export const SmilingCloudMascot3D: React.FC<{ className?: string }> = ({ className = 'w-28 h-20' }) => (
  <svg viewBox="0 0 160 110" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="cloudGrad" cx="40%" cy="30%" r="75%">
        <stop offset="0%" stopColor="#FFFFFF" />
        <stop offset="70%" stopColor="#FFF8F0" />
        <stop offset="100%" stopColor="#F0E3D8" />
      </radialGradient>
      <filter id="cloudShadow" x="-15%" y="-10%" width="130%" height="140%">
        <feDropShadow dx="0" dy="8" stdDeviation="6" floodColor="#D8AA64" floodOpacity="0.28" />
      </filter>
    </defs>

    <g filter="url(#cloudShadow)">
      <circle cx="46" cy="58" r="26" fill="url(#cloudGrad)" />
      <circle cx="78" cy="42" r="32" fill="url(#cloudGrad)" />
      <circle cx="112" cy="56" r="25" fill="url(#cloudGrad)" />
      <rect x="42" y="54" width="74" height="30" rx="15" fill="url(#cloudGrad)" />
    </g>

    {/* Cute Face */}
    <circle cx="65" cy="57" r="3.4" fill="#343047" />
    <circle cx="95" cy="57" r="3.4" fill="#343047" />
    <circle cx="63.8" cy="55.8" r="1.1" fill="#FFFFFF" />
    <circle cx="93.8" cy="55.8" r="1.1" fill="#FFFFFF" />
    {/* Cheeks */}
    <ellipse cx="56" cy="64" rx="5.5" ry="3.2" fill="#F8A9B4" opacity="0.7" />
    <ellipse cx="104" cy="64" rx="5.5" ry="3.2" fill="#F8A9B4" opacity="0.7" />
    {/* Smile */}
    <path d="M74 63C77 67.5 83 67.5 86 63" stroke="#343047" strokeWidth="2.6" strokeLinecap="round" />
  </svg>
);

/* Cute 3D Blooming Cactus in Peach Pot (used for Study Reminder / AI Insight Card) */
export const BloomingCactus3D: React.FC<{ className?: string }> = ({ className = 'w-20 h-24' }) => (
  <svg viewBox="0 0 110 130" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="cactusBody" cx="35%" cy="30%" r="70%">
        <stop offset="0%" stopColor="#B8E3A8" />
        <stop offset="65%" stopColor="#83C47A" />
        <stop offset="100%" stopColor="#5D9E56" />
      </radialGradient>
      <linearGradient id="peachPot" x1="30" y1="82" x2="80" y2="122" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#FBB9A8" />
        <stop offset="65%" stopColor="#EE9B89" />
        <stop offset="100%" stopColor="#D77D6B" />
      </linearGradient>
      <filter id="cactusShadow" x="-15%" y="-10%" width="130%" height="130%">
        <feDropShadow dx="0" dy="6" stdDeviation="4.5" floodColor="#7E649E" floodOpacity="0.22" />
      </filter>
    </defs>

    {/* Cactus Arms */}
    <rect x="24" y="55" width="18" height="26" rx="9" fill="url(#cactusBody)" />
    <rect x="24" y="69" width="24" height="12" rx="6" fill="url(#cactusBody)" />
    <rect x="68" y="49" width="18" height="28" rx="9" fill="url(#cactusBody)" />
    <rect x="62" y="65" width="24" height="12" rx="6" fill="url(#cactusBody)" />

    {/* Main Cactus Body */}
    <rect x="40" y="30" width="30" height="58" rx="15" fill="url(#cactusBody)" filter="url(#cactusShadow)" />
    {/* Subtle vertical ribs */}
    <path d="M49 36V80" stroke="#CBECC0" strokeWidth="2" strokeLinecap="round" opacity="0.5" />
    <path d="M61 36V80" stroke="#538D4D" strokeWidth="2" strokeLinecap="round" opacity="0.3" />

    {/* Cute Pink Flower on Top */}
    <circle cx="50" cy="24" r="5" fill="#F8B4C6" />
    <circle cx="60" cy="24" r="5" fill="#F8B4C6" />
    <circle cx="55" cy="19" r="5" fill="#F8B4C6" />
    <circle cx="55" cy="27" r="4.5" fill="#F8B4C6" />
    <circle cx="55" cy="23.5" r="3" fill="#FFE082" />

    {/* Peach Ceramic Pot */}
    <path
      d="M32 82H78L73 116C72.5 119 69.5 121 66 121H44C40.5 121 37.5 119 37 116L32 82Z"
      fill="url(#peachPot)"
      filter="url(#cactusShadow)"
    />
    <rect x="29" y="79" width="52" height="10" rx="5" fill="#FBB9A8" />
    <path d="M38 93L41 112" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round" opacity="0.45" />
  </svg>
);

/* Cute 3D Books & Star Trophy Illustration (for Roadmaps, Assessments, Achievements) */
export const BooksTrophy3D: React.FC<{ className?: string }> = ({ className = 'w-28 h-24' }) => (
  <svg viewBox="0 0 140 120" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="book1" x1="20" y1="75" x2="115" y2="105" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#D6C7F0" />
        <stop offset="100%" stopColor="#A98ED9" />
      </linearGradient>
      <linearGradient id="book2" x1="28" y1="54" x2="108" y2="82" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#FCDAD1" />
        <stop offset="100%" stopColor="#F0A594" />
      </linearGradient>
      <linearGradient id="book3" x1="36" y1="36" x2="102" y2="60" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#CEE8CC" />
        <stop offset="100%" stopColor="#92C99A" />
      </linearGradient>
      <radialGradient id="goldStar" cx="35%" cy="30%" r="70%">
        <stop offset="0%" stopColor="#FFF0B8" />
        <stop offset="65%" stopColor="#FFD269" />
        <stop offset="100%" stopColor="#E6A93B" />
      </radialGradient>
      <filter id="bookShadow" x="-15%" y="-10%" width="130%" height="135%">
        <feDropShadow dx="0" dy="6" stdDeviation="5" floodColor="#785A9E" floodOpacity="0.2" />
      </filter>
    </defs>

    {/* Bottom Book (Lavender) */}
    <rect x="22" y="80" width="96" height="22" rx="8" fill="url(#book1)" filter="url(#bookShadow)" />
    <rect x="30" y="85" width="76" height="12" rx="4" fill="#FFFDFB" opacity="0.85" />

    {/* Middle Book (Peach) */}
    <rect x="28" y="60" width="84" height="20" rx="7" fill="url(#book2)" filter="url(#bookShadow)" />
    <rect x="35" y="65" width="66" height="10" rx="3.5" fill="#FFFDFB" opacity="0.85" />

    {/* Top Book (Mint) */}
    <rect x="36" y="42" width="68" height="18" rx="6.5" fill="url(#book3)" filter="url(#bookShadow)" />
    <rect x="42" y="46.5" width="52" height="9" rx="3" fill="#FFFDFB" opacity="0.85" />

    {/* Cute Floating 3D Gold Star */}
    <path
      d="M70 10L75.8 22L89 23.8L79.4 33L81.8 46L70 39.8L58.2 46L60.6 33L51 23.8L64.2 22L70 10Z"
      fill="url(#goldStar)"
      filter="url(#bookShadow)"
    />
  </svg>
);
