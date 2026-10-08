export default function Spinner({ className = 'h-10 w-10 border-[#525E66]', label = 'Loading' }) {
  return (
    <div
      className={`animate-spin rounded-full border-4 border-t-transparent ${className}`}
      role="status"
      aria-label={label}
    />
  );
}
