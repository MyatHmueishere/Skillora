import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  Loader2,
  Lock,
  Search,
  ShieldAlert,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import type { PublicCertificateVerificationResult } from '../../types';
import { formatCertificateFullDate, verifyCertificateById } from '../../lib/achievements';
import { Logo } from '../common/Logo';

interface CertificateVerificationViewProps {
  initialCertificateNumber?: string;
  isAuthenticated?: boolean;
  onBack: () => void;
}

export const CertificateVerificationView: React.FC<CertificateVerificationViewProps> = ({
  initialCertificateNumber = '',
  isAuthenticated = false,
  onBack,
}) => {
  const [queryId, setQueryId] = useState(initialCertificateNumber);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<PublicCertificateVerificationResult | null>(null);

  const runVerification = async (targetId: string) => {
    const cleaned = targetId.trim().toUpperCase();
    if (!cleaned) {
      setError('Enter a Certificate ID (e.g., SKL-2026-XXXX-XXXX) to verify.');
      setResult(null);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const payload = await verifyCertificateById(cleaned);
      setResult(payload);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to verify certificate ID right now.'
      );
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (initialCertificateNumber.trim()) {
      setQueryId(initialCertificateNumber.trim().toUpperCase());
      void runVerification(initialCertificateNumber);
    }
  }, [initialCertificateNumber]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void runVerification(queryId);
  };

  return (
    <div className="min-h-screen bg-[#FAF6F2] text-[#343047] flex flex-col">
      {/* Top Bar when standalone */}
      <header className="sticky top-0 z-20 bg-[#FAF6F2]/95 backdrop-blur-md border-b border-[#EEE6E5] px-4 sm:px-8 py-3.5">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <Logo size="sm" />
            <span className="hidden sm:inline text-xs font-semibold text-[#8B8295]">
              · Credential Verification Registry
            </span>
          </div>
          <button
            type="button"
            onClick={onBack}
            className="clay-button-soft px-3.5 py-2 text-xs font-bold text-[#6F4FA8] inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>{isAuthenticated ? 'Back to Achievements' : 'Back to Skillora'}</span>
          </button>
        </div>
      </header>

      <main className="flex-1 w-full max-w-4xl mx-auto px-4 sm:px-8 py-8 sm:py-12 space-y-6">
        {/* Search Hero Card */}
        <div
          className="rounded-[26px] border border-[#1E3566]/15 p-6 sm:p-8 text-white space-y-5"
          style={{
            background: 'linear-gradient(135deg, #0F1D3A 0%, #162A52 70%, #1E376B 100%)',
            boxShadow: '0 20px 44px -16px rgba(15, 29, 58, 0.45)',
          }}
        >
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl bg-white/10 border border-[#C8A24A]/50 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-6 h-6 text-[#DFC278]" />
            </div>
            <div className="space-y-1">
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#DFC278]">
                Official Credential Lookup
              </p>
              <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
                Verify a Skillora Certificate
              </h1>
              <p className="text-xs sm:text-sm text-white/80 max-w-2xl leading-relaxed">
                Enter the unique Certificate Identification Number printed on any Skillora credential to confirm authenticity, completion status, and issuer records without exposing private student information.
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-[#8B97AD] absolute left-4 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={queryId}
                onChange={(e) => setQueryId(e.target.value)}
                placeholder="Enter Certificate ID (e.g. SKL-2026-A1B2-C3D4)"
                className="w-full pl-11 pr-4 py-3 rounded-2xl bg-white text-[#0F1D3A] font-mono text-xs sm:text-sm font-semibold placeholder:text-[#8B97AD] border border-[#C8A24A]/40 focus:outline-none focus:ring-2 focus:ring-[#DFC278]"
                aria-label="Certificate ID"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-3 rounded-2xl bg-[#C8A24A] hover:bg-[#DFC278] text-[#0F1D3A] font-extrabold text-xs sm:text-sm transition-colors flex items-center justify-center gap-2 whitespace-nowrap shrink-0 disabled:opacity-60"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Verifying...</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  <span>Verify Certificate</span>
                </>
              )}
            </button>
          </form>
        </div>

        {error && (
          <div className="p-4 rounded-[20px] bg-[#FCEAE5] border border-[#F5D3CA] text-xs font-semibold text-[#8D3E32] flex items-center gap-2.5">
            <ShieldAlert className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Verification Result */}
        {result && (
          <div className="pastel-card p-6 sm:p-8 space-y-6 animate-achievement-unlock">
            {!result.found ? (
              <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-[#FCEAE5] border border-[#F5D3CA] text-[#8D3E32] flex items-center justify-center shrink-0">
                  <XCircle className="w-6 h-6" />
                </div>
                <div className="space-y-1">
                  <h2 className="font-display text-lg font-extrabold text-[#343047]">
                    Certificate Record Not Found
                  </h2>
                  <p className="text-xs sm:text-sm text-[#6B6178] leading-relaxed">
                    No issued Skillora credential matches ID{' '}
                    <span className="font-mono font-bold text-[#343047]">
                      {result.certificateNumber || queryId}
                    </span>
                    . Double-check the characters and try again.
                  </p>
                </div>
              </div>
            ) : (
              <>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-[#EEE6E5]">
                  <div className="flex items-start sm:items-center gap-3.5">
                    <div
                      className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 border ${
                        result.authentic
                          ? 'bg-[#DCECD9] border-[#BBDAB6] text-[#2F5B37]'
                          : 'bg-[#FCEAE5] border-[#F5D3CA] text-[#8D3E32]'
                      }`}
                    >
                      {result.authentic ? (
                        <CheckCircle2 className="w-6 h-6" />
                      ) : (
                        <ShieldAlert className="w-6 h-6" />
                      )}
                    </div>
                    <div>
                      <p
                        className={`text-xs font-extrabold uppercase tracking-wider ${
                          result.authentic ? 'text-[#2F5B37]' : 'text-[#8D3E32]'
                        }`}
                      >
                        {result.authentic
                          ? 'Authentic & Verified Credential'
                          : 'Certificate Revoked / Invalid'}
                      </p>
                      <h2 className="font-display text-xl sm:text-2xl font-extrabold text-[#343047] mt-0.5">
                        {result.title}
                      </h2>
                    </div>
                  </div>

                  <span className="font-mono text-xs font-bold px-3.5 py-1.5 rounded-xl bg-[#0F1D3A] text-[#DFC278] tabular-nums self-start sm:self-center">
                    {result.certificateNumber}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div className="p-4 rounded-[18px] bg-[#FAF6F2] border border-[#EEE6E5] space-y-1">
                    <p className="text-[11px] font-bold text-[#8B8295]">Recipient</p>
                    <p className="font-display text-base font-extrabold text-[#343047]">
                      {result.studentDisplayName || 'Skillora Learner'}
                    </p>
                    <p className="text-[11px] text-[#6B6178] inline-flex items-center gap-1">
                      <Lock className="w-3 h-3 text-[#8E6EC8]" />
                      <span>
                        {result.privacyMode === 'initials'
                          ? 'Initials only (privacy enabled)'
                          : 'Verified full name'}
                      </span>
                    </p>
                  </div>

                  <div className="p-4 rounded-[18px] bg-[#FAF6F2] border border-[#EEE6E5] space-y-1">
                    <p className="text-[11px] font-bold text-[#8B8295]">Certificate Type</p>
                    <p className="text-sm font-extrabold text-[#343047]">
                      {result.certificateTypeLabel}
                    </p>
                    <p className="text-[11px] text-[#6B6178]">
                      Direction: {result.direction}
                    </p>
                  </div>

                  <div className="p-4 rounded-[18px] bg-[#FAF6F2] border border-[#EEE6E5] space-y-1">
                    <p className="text-[11px] font-bold text-[#8B8295]">Issued &amp; Status</p>
                    <p className="text-sm font-extrabold text-[#343047] tabular-nums">
                      {formatCertificateFullDate(result.completionDate || result.issuedAt) || 'Verified'}
                    </p>
                    <p className="text-[11px] font-semibold text-[#2F5B37]">
                      Status: {result.status === 'valid' ? 'Valid' : 'Revoked'} · Issuer: {result.issuerName || 'Skillora'}
                    </p>
                  </div>
                </div>

                <div className="p-4 rounded-[16px] bg-[#F0E9FA]/55 border border-[#E2D6F5] flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px] text-[#5D5470]">
                  <span>
                    Authorized Issuer: <strong>{result.issuerName || 'Skillora'}</strong> —{' '}
                    {result.issuerDesignation || 'Academic & Curriculum Verification Board'}
                  </span>
                  {result.verificationDigest && (
                    <span className="font-mono text-[#6F4FA8] tabular-nums">
                      Digest: {result.verificationDigest}
                    </span>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </main>
    </div>
  );
};
