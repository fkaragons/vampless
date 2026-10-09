export function Logo({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" className={className} aria-hidden>
      <defs>
        <linearGradient id="vg" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop stopColor="#ff5f73" />
          <stop offset="1" stopColor="#e5243b" />
        </linearGradient>
      </defs>
      <path d="M4 6h6l6 14 6-14h6L19.5 27h-7L4 6Z" fill="url(#vg)" />
      <path d="M13 6h6l-3 7-3-7Z" fill="#060608" opacity="0.9" />
    </svg>
  );
}
