export default function Loading({ fullPage = false, className = '', label = 'Loading' }) {
  const spinner = (
    <div
      className={`${fullPage ? 'h-[10vh] w-[10vh] border-4' : 'h-5 w-5 border-2'} ${className} animate-spin rounded-full border-[#525E66] border-t-transparent`}
      role="status"
      aria-label={label}
    />
  );

  if (fullPage) {
    return <div className="flex h-screen w-full items-center justify-center">{spinner}</div>;
  }

  return spinner;
}
