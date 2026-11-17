// The More Than Email mark: an envelope whose body opens onto a little board of
// three cards, i.e. email that turns into work. Always the brand colours, so it matches the browser tab icon (icon.svg).
export function Logo({ size = 28, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} role="img" aria-label="More Than Email">
      <rect x="2" y="5" width="28" height="22" rx="5" fill="#cf7a4b" />
      <path d="M4.5 8.5 16 16.5l11.5-8" fill="none" stroke="#fbf6ec" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="7" y="19" width="5" height="5" rx="1.2" fill="#fbf6ec" />
      <rect x="13.5" y="19" width="5" height="3.5" rx="1.2" fill="#fbf6ec" opacity="0.85" />
      <rect x="20" y="19" width="5" height="2" rx="1" fill="#fbf6ec" opacity="0.7" />
    </svg>
  );
}
