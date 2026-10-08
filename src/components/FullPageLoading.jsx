import Spinner from './utils/Spinner';

/** Full-viewport loading indicator for app shell / lazy route fallbacks. */
export default function FullPageLoading() {
  return (
    <div className="flex h-screen w-full items-center justify-center">
      <Spinner className="h-[10vh] w-[10vh] border-[#525E66]" />
    </div>
  );
}
