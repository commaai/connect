/** Full-viewport loading indicator for app shell / lazy route fallbacks. */
export default function FullPageLoading() {
  return (
    <div className="flex h-screen w-full items-center justify-center">
      <div
        className="h-[10vh] w-[10vh] animate-spin rounded-full border-4 border-[#525E66] border-t-transparent"
        role="status"
        aria-label="Loading"
      />
    </div>
  );
}
