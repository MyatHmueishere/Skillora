import React from 'react';
import { Award, ShieldCheck } from 'lucide-react';
import type { CertificateTemplateId, IssuedCertificateRecord } from '../../types';
import { formatCertificateFullDate } from '../../lib/achievements';

interface CertificateCardPreviewProps {
  certificate: IssuedCertificateRecord;
  templateOverride?: CertificateTemplateId;
  isPrintTarget?: boolean;
  compact?: boolean;
}

const SkilloraCrest: React.FC<{ onDark?: boolean; size?: 'sm' | 'md' | 'lg' }> = ({
  onDark = false,
  size = 'md',
}) => {
  const dim = size === 'sm' ? 'w-7 h-7' : size === 'lg' ? 'w-11 h-11' : 'w-9 h-9';
  return (
    <div className="inline-flex items-center gap-2.5">
      <div
        className={`${dim} rounded-full flex items-center justify-center shrink-0 border`}
        style={{
          background: onDark
            ? 'linear-gradient(145deg, #162A52, #0F1D3A)'
            : 'linear-gradient(145deg, #0F1D3A, #1B3363)',
          borderColor: '#C8A24A',
          boxShadow: 'inset 0 0 0 2px rgba(223, 194, 120, 0.35)',
        }}
      >
        <Award className="w-4 h-4 text-[#DFC278]" />
      </div>
      <div className="text-left leading-none">
        <p
          className={`font-certificate-sans font-extrabold tracking-[0.18em] uppercase ${
            size === 'sm' ? 'text-[11px]' : 'text-xs'
          } ${onDark ? 'text-white' : 'text-[#0F1D3A]'}`}
        >
          Skillora
        </p>
        <p className="font-certificate-sans text-[8px] sm:text-[9px] font-semibold tracking-[0.14em] uppercase text-[#C8A24A] mt-0.5">
          Academic Verification
        </p>
      </div>
    </div>
  );
};

const GoldMedallionSeal: React.FC<{ compact?: boolean }> = ({ compact = false }) => (
  <div
    className={`rounded-full flex flex-col items-center justify-center shrink-0 select-none ${
      compact ? 'w-12 h-12' : 'w-16 h-16 sm:w-20 sm:h-20'
    }`}
    style={{
      background: 'radial-gradient(circle at 32% 30%, #EFD894 0%, #C8A24A 58%, #9D792B 100%)',
      boxShadow:
        '0 6px 16px -4px rgba(15, 29, 58, 0.35), inset 0 0 0 3px #FCFBF7, inset 0 0 0 4.5px #0F1D3A',
    }}
  >
    <ShieldCheck className={compact ? 'w-3.5 h-3.5 text-[#0F1D3A]' : 'w-5 h-5 text-[#0F1D3A]'} />
    <span className="font-certificate-sans text-[6px] sm:text-[7px] font-extrabold tracking-[0.14em] uppercase text-[#0F1D3A] mt-0.5">
      Verified
    </span>
  </div>
);

export const CertificateCardPreview: React.FC<CertificateCardPreviewProps> = ({
  certificate,
  templateOverride,
  isPrintTarget = false,
  compact = false,
}) => {
  const template: CertificateTemplateId =
    templateOverride ?? certificate.templateId ?? 'classic_academic';
  const completionDateLabel =
    formatCertificateFullDate(certificate.completionDate || certificate.issuedAt) || 'Verified';
  const rootClass = isPrintTarget ? 'certificate-print-root' : '';

  if (template === 'modern_professional') {
    return (
      <div
        className={`${rootClass} w-full sm:aspect-[297/210] rounded-2xl overflow-hidden border border-[#D8DFEC] shadow-[0_18px_42px_-16px_rgba(15,29,58,0.28)] bg-white flex flex-col sm:flex-row text-[#0F1D3A]`}
      >
        {/* Midnight Navy Architectural Band */}
        <div
          className={`sm:w-[27%] bg-[#0F1D3A] text-white flex flex-col justify-between relative border-b-4 sm:border-b-0 sm:border-r-4 border-[#C8A24A] ${
            compact ? 'p-4 gap-4' : 'p-5 sm:p-7 gap-5'
          }`}
        >
          <div className="space-y-4">
            <SkilloraCrest onDark size={compact ? 'sm' : 'md'} />
            <div className="h-px w-full bg-[#C8A24A]/40" />
          </div>

          <div className="flex sm:flex-col items-center sm:items-start gap-4 my-auto">
            <GoldMedallionSeal compact={compact} />
            <div className="space-y-2.5 text-left">
              <div>
                <p className="font-certificate-sans text-[9px] font-bold tracking-[0.15em] uppercase text-[#DFC278]">
                  Credential Type
                </p>
                <p className="font-certificate-sans text-[11px] sm:text-xs font-semibold text-white/95 leading-snug mt-0.5">
                  {certificate.certificateTypeLabel}
                </p>
              </div>
              <div>
                <p className="font-certificate-sans text-[9px] font-bold tracking-[0.15em] uppercase text-[#DFC278]">
                  Learning Direction
                </p>
                <p className="font-certificate-sans text-[11px] sm:text-xs font-semibold text-white/95 leading-snug mt-0.5">
                  {certificate.direction}
                </p>
              </div>
            </div>
          </div>

          <div className="pt-3 border-t border-white/15">
            <p className="font-certificate-sans text-[8px] font-bold tracking-[0.14em] uppercase text-[#DFC278]">
              Certificate ID
            </p>
            <p className="font-mono text-[10px] sm:text-[11px] font-semibold text-white mt-0.5 break-all tabular-nums">
              {certificate.certificateNumber}
            </p>
          </div>
        </div>

        {/* Crisp White Content Canvas */}
        <div
          className={`flex-1 bg-white flex flex-col justify-between relative ${
            compact ? 'p-5 gap-4' : 'p-6 sm:p-10 gap-5'
          }`}
        >
          <div className="space-y-3 sm:space-y-4">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="font-certificate-sans text-[9px] sm:text-[10px] font-bold tracking-[0.2em] uppercase text-[#C8A24A]">
                Official Certificate of Achievement
              </span>
              <span className="font-certificate-sans text-[10px] font-bold tracking-wider uppercase text-[#162A52]/70">
                Status: {certificate.status === 'valid' ? 'Authentic' : 'Revoked'}
              </span>
            </div>

            <div className="space-y-1.5">
              <p className="font-certificate-sans text-xs text-[#5C667A]">
                This credential is proudly awarded to
              </p>
              <h3
                className={`font-certificate-serif font-bold text-[#0F1D3A] leading-tight tracking-tight ${
                  compact ? 'text-2xl sm:text-3xl' : 'text-3xl sm:text-4xl lg:text-[42px]'
                }`}
              >
                {certificate.studentName}
              </h3>
              <div className="w-28 h-[2px] bg-[#C8A24A] mt-2" />
            </div>

            <div className="space-y-1.5 pt-1">
              <p className="font-certificate-sans text-xs sm:text-[13px] text-[#5C667A] leading-relaxed max-w-xl">
                For fulfilling all verified curriculum requirements, guided lessons, and mastery assessments in:
              </p>
              <p
                className={`font-certificate-sans font-extrabold text-[#162A52] leading-snug ${
                  compact ? 'text-base sm:text-lg' : 'text-lg sm:text-2xl'
                }`}
              >
                {certificate.title}
              </p>
            </div>
          </div>

          <div className="pt-4 border-t border-[#E6EAF2] grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
            <div>
              <p className="font-certificate-sans text-xs sm:text-sm font-bold text-[#0F1D3A] tabular-nums">
                {completionDateLabel}
              </p>
              <div className="h-px w-36 bg-[#C8A24A]/60 my-1" />
              <p className="font-certificate-sans text-[9px] font-bold tracking-[0.14em] uppercase text-[#5C667A]">
                Completion Date
              </p>
            </div>

            <div className="sm:text-right">
              <p className="font-certificate-serif italic font-semibold text-lg sm:text-xl text-[#0F1D3A]">
                Skillora Academic Board
              </p>
              <div className="h-px w-48 sm:ml-auto bg-[#C8A24A]/60 my-1" />
              <p className="font-certificate-sans text-[9px] font-bold tracking-[0.12em] uppercase text-[#5C667A]">
                {certificate.issuerDesignation}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (template === 'excellence_award') {
    return (
      <div
        className={`${rootClass} w-full sm:aspect-[297/210] rounded-2xl overflow-hidden bg-[#0F1D3A] p-2.5 sm:p-4 shadow-[0_18px_42px_-16px_rgba(15,29,58,0.36)]`}
      >
        <div className="w-full h-full rounded-xl border-2 border-[#C8A24A] bg-[#FCFBF7] flex flex-col justify-between overflow-hidden relative">
          {/* Top Navy Distinction Banner */}
          <div className="bg-[#162A52] border-b-2 border-[#C8A24A] px-5 sm:px-8 py-3 sm:py-3.5 flex items-center justify-between gap-3">
            <SkilloraCrest onDark size={compact ? 'sm' : 'md'} />
            <span className="font-certificate-sans text-[9px] sm:text-[10px] font-extrabold tracking-[0.2em] uppercase text-[#DFC278] text-right">
              Distinction &amp; Excellence Award
            </span>
          </div>

          {/* Center Body */}
          <div
            className={`flex-1 flex flex-col items-center justify-center text-center ${
              compact ? 'px-5 py-4 gap-2.5' : 'px-6 sm:px-12 py-5 sm:py-6 gap-3'
            }`}
          >
            <p className="font-certificate-sans text-[9px] sm:text-[10px] font-extrabold tracking-[0.22em] uppercase text-[#C8A24A]">
              High-Performance Academic Recognition
            </p>
            <h3
              className={`font-certificate-serif font-bold tracking-wide uppercase text-[#0F1D3A] leading-tight ${
                compact ? 'text-lg sm:text-xl' : 'text-xl sm:text-3xl'
              }`}
            >
              {certificate.certificateTypeLabel}
            </h3>
            <p className="font-certificate-sans text-xs text-[#5C667A]">
              Presented with honors to
            </p>
            <p
              className={`font-certificate-serif italic font-bold text-[#0F1D3A] leading-none border-b border-[#C8A24A]/65 pb-2 px-6 ${
                compact ? 'text-2xl sm:text-3xl' : 'text-3xl sm:text-4xl lg:text-[44px]'
              }`}
            >
              {certificate.studentName}
            </p>
            <p
              className={`font-certificate-serif font-bold text-[#162A52] leading-snug max-w-2xl pt-1 ${
                compact ? 'text-base sm:text-lg' : 'text-lg sm:text-2xl'
              }`}
            >
              {certificate.title}
            </p>
            <p className="font-certificate-sans text-[11px] font-bold tracking-[0.12em] uppercase text-[#9D792B]">
              Direction: {certificate.direction}
            </p>
          </div>

          {/* Footer Signatory + Seal + ID */}
          <div className="px-5 sm:px-10 pb-4 sm:pb-6 pt-2 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="text-center sm:text-left">
              <p className="font-certificate-sans text-xs font-bold text-[#0F1D3A] tabular-nums">
                {completionDateLabel}
              </p>
              <div className="h-px w-36 bg-[#C8A24A]/70 my-1 mx-auto sm:mx-0" />
              <p className="font-certificate-sans text-[8.5px] font-bold tracking-[0.14em] uppercase text-[#5C667A]">
                Completion Date · ID {certificate.certificateNumber}
              </p>
            </div>

            <GoldMedallionSeal compact={compact} />

            <div className="text-center sm:text-right">
              <p className="font-certificate-serif italic font-semibold text-base sm:text-lg text-[#0F1D3A]">
                Skillora Academic Board
              </p>
              <div className="h-px w-44 bg-[#C8A24A]/70 my-1 mx-auto sm:mx-0 sm:ml-auto" />
              <p className="font-certificate-sans text-[8.5px] font-bold tracking-[0.12em] uppercase text-[#5C667A]">
                {certificate.issuerDesignation}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Default: Classic Academic (Warm Ivory #FCFBF7 + Midnight Navy + Champagne Gold double borders)
  return (
    <div
      className={`${rootClass} w-full sm:aspect-[297/210] rounded-2xl overflow-hidden bg-[#FCFBF7] p-3 sm:p-4 border-4 border-[#0F1D3A] shadow-[0_18px_42px_-16px_rgba(15,29,58,0.25)]`}
    >
      <div className="w-full h-full border-2 border-[#C8A24A] p-1 sm:p-1.5">
        <div
          className={`w-full h-full border border-[#C8A24A]/65 flex flex-col justify-between text-center relative ${
            compact ? 'px-4 py-4 gap-3' : 'px-5 sm:px-10 py-5 sm:py-7 gap-4'
          }`}
        >
          {/* Top Brand + Title */}
          <div className="space-y-2.5 flex flex-col items-center">
            <SkilloraCrest size={compact ? 'sm' : 'md'} />
            <div className="w-40 h-px bg-[#C8A24A]/60" />
            <h3
              className={`font-certificate-serif font-bold tracking-[0.06em] uppercase text-[#0F1D3A] leading-tight ${
                compact ? 'text-lg sm:text-xl' : 'text-xl sm:text-3xl'
              }`}
            >
              {certificate.certificateTypeLabel}
            </h3>
          </div>

          {/* Recipient & Earned Title */}
          <div className="space-y-2 my-auto flex flex-col items-center">
            <p className="font-certificate-sans text-xs text-[#5C667A]">
              This certificate is awarded to
            </p>
            <p
              className={`font-certificate-serif italic font-bold text-[#0F1D3A] leading-none border-b border-[#C8A24A]/70 pb-2 px-6 ${
                compact ? 'text-2xl sm:text-3xl' : 'text-3xl sm:text-4xl lg:text-[44px]'
              }`}
            >
              {certificate.studentName}
            </p>
            <p className="font-certificate-sans text-[11px] sm:text-xs text-[#5C667A] max-w-xl leading-relaxed pt-1">
              for successfully completing all required coursework, lessons, and verified evaluations in
            </p>
            <p
              className={`font-certificate-serif font-bold text-[#162A52] leading-snug max-w-2xl ${
                compact ? 'text-base sm:text-lg' : 'text-lg sm:text-2xl'
              }`}
            >
              {certificate.title}
            </p>
            <p className="font-certificate-sans text-[10px] sm:text-[11px] font-bold tracking-[0.16em] uppercase text-[#9D792B]">
              Learning Direction: {certificate.direction}
            </p>
          </div>

          {/* Signature + Seal + Verification Strip */}
          <div className="space-y-2">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
              <div className="text-center sm:text-left">
                <p className="font-certificate-sans text-xs font-bold text-[#0F1D3A] tabular-nums">
                  {completionDateLabel}
                </p>
                <div className="h-px w-36 bg-[#C8A24A]/70 my-1 mx-auto sm:mx-0" />
                <p className="font-certificate-sans text-[8.5px] font-bold tracking-[0.14em] uppercase text-[#5C667A]">
                  Completion Date
                </p>
              </div>

              <GoldMedallionSeal compact={compact} />

              <div className="text-center sm:text-right">
                <p className="font-certificate-serif italic font-semibold text-base sm:text-lg text-[#0F1D3A]">
                  Skillora Academic Board
                </p>
                <div className="h-px w-44 bg-[#C8A24A]/70 my-1 mx-auto sm:mx-0 sm:ml-auto" />
                <p className="font-certificate-sans text-[8.5px] font-bold tracking-[0.12em] uppercase text-[#5C667A]">
                  {certificate.issuerDesignation}
                </p>
              </div>
            </div>

            <div className="pt-1.5 border-t border-[#C8A24A]/35 flex flex-col sm:flex-row items-center justify-between gap-1 text-[9px] text-[#5C667A]">
              <span className="font-mono font-bold text-[#0F1D3A] tabular-nums">
                Certificate ID: {certificate.certificateNumber}
              </span>
              <span className="font-certificate-sans">
                Verify authenticity at Skillora Certificate Verification Portal
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
