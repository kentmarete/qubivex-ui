export function Logo({ className = 'h-6 w-6' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect width="32" height="32" rx="7" fill="rgb(var(--surface-2))" />
      <path d="M9 9h10l4 4v10H13l-4-4z" fill="none" stroke="rgb(var(--accent))" strokeWidth="2.4" strokeLinejoin="round" />
      <circle cx="16" cy="16" r="2.6" fill="rgb(var(--accent))" />
    </svg>
  );
}
