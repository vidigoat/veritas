export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 240 240" aria-label="VERITAS">
      <rect x="0" y="0" width="240" height="240" rx="48" fill="#2F5EA8" />
      <g transform="translate(8.35,17.45) scale(1.75)" fill="none" stroke="#FFFFFF" strokeWidth="6.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M 60 62 C 52 62 46 56 46 48 C 46 38 55 30 66 30 C 80 30 90 42 90 57 C 90 76 74 90 55 90 C 32 90 15 71 15 47 C 15 19 39 -2 68 0" />
      </g>
    </svg>
  );
}
export function Wordmark({ size = 22 }: { size?: number }) {
  return (
    <div className="flex items-center gap-2.5">
      <LogoMark size={size + 8} />
      <span className="serif" style={{ fontWeight: 500, fontSize: size, letterSpacing: "0.14em" }}>VERITAS</span>
    </div>
  );
}
