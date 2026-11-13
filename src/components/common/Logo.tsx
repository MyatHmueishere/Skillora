import React from 'react';
import skilloraLogo from '../../assets/images/skillora-logo.png';

interface LogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showTagline?: boolean;
  onLavender?: boolean;
}

export const Logo: React.FC<LogoProps> = ({
  className = '',
  size = 'md',
  showTagline = false,
  onLavender = false,
}) => {
  // Exact sizing per brand specification:
  // sm: 36px, md (Sidebar): 44px, lg (Landing Header): 48px, xl (Auth & Onboarding): 64px
  const badgeSizes = {
    sm: 'w-9 h-9 rounded-[10px]',
    md: 'w-11 h-11 rounded-[12px]',
    lg: 'w-12 h-12 rounded-[14px]',
    xl: 'w-14 h-14 sm:w-16 sm:h-16 rounded-[18px]',
  };

  const textSizes = {
    sm: 'text-lg',
    md: 'text-xl',
    lg: 'text-[22px]',
    xl: 'text-2xl',
  };

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <img
        src={skilloraLogo}
        alt="Skillora Logo"
        className={`${badgeSizes[size]} object-contain shrink-0 select-none`}
      />

      <div className="flex flex-col">
        <span
          className={`font-display font-extrabold tracking-tight leading-none ${textSizes[size]} ${
            onLavender ? 'text-[#FFFCFA]' : 'text-[#343047]'
          }`}
        >
          Skillora
        </span>
        {showTagline && (
          <span
            className={`text-[11px] font-medium tracking-wide mt-1 ${
              onLavender ? 'text-white/85' : 'text-[#8B8295]'
            }`}
          >
            Learn Smarter. Grow Further.
          </span>
        )}
      </div>
    </div>
  );
};
