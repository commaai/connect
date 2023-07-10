import { useEffect, useRef, useState } from 'react';

import { Check, ContentCopy } from '../icons';

const ErrorFallback = ({ error, componentStack }) => {
  const [swInfo, setSwInfo] = useState('');
  const [copied, setCopied] = useState(false);
  const copiedInterval = useRef(null);

  console.log({ error, componentStack });

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      setSwInfo('loading...');
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        if (registrations.length === 0) {
          setSwInfo('none');
          return;
        }
        const serviceWorkers = [];
        for (const registration of registrations) {
          serviceWorkers.push(`${registration.scope} ${registration.active?.state}`);
        }
        setSwInfo(serviceWorkers.join('; '));
      }).catch((err) => {
        setSwInfo(err.toString());
      });
    } else {
      setSwInfo('not supported');
    }
  }, []);

  const information = `connect version: ${import.meta.env.VITE_APP_GIT_SHA || 'unknown'}
Build timestamp: ${import.meta.env.VITE_APP_BUILD_TIMESTAMP || 'unknown'}
URL: ${window.location.href}

Browser: ${window.navigator.userAgent}
Window: ${window.innerWidth}x${window.innerHeight}

Service workers: ${swInfo}

${error.toString()}${componentStack}`;

  const copyError = async () => {
    if (copiedInterval.current) {
      clearTimeout(copiedInterval.current);
    }
    try {
      await navigator.clipboard.writeText('```' + information + '```');
      setCopied(true);
      copiedInterval.current = setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <div className="m-4">
      <div className=" prose prose-invert">
        <h2>Oops!</h2>
        <p>Something went wrong. Please reload the page.</p>
        <p>
          If you continue to have problems, let us know on <a href="https://discord.comma.ai" target="_blank">Discord</a>{` `}
          in the <span className="whitespace-nowrap"><strong>#connect-feedback</strong></span> channel.
        </p>
        <p>
          <a className="bg-blue-600 rounded-md px-4 py-2 font-bold hover:bg-blue-500 transition-colors no-underline" href="">
            Reload
          </a>
        </p>
      </div>
      <details className="mt-8">
        <summary>Show debugging information</summary>
        <div className="relative bg-black rounded-xl mt-2 overflow-hidden">
          <pre className="select-all overflow-x-auto px-4 pt-4 pb-2">
            {information}
          </pre>
          <button
            className={`absolute right-2 top-2 flex rounded-md pl-2 pr-2 py-2 text-white font-bold transition-colors ${copied ? 'bg-green-500' : 'bg-gray-700 hover:bg-gray-600'}`}
            onClick={copyError}
            aria-label={copied ? 'Copied' : 'Copy error'}
          >
            {copied ? <Check /> : <ContentCopy />}
            <span className="ml-1">{copied ? 'Copied' : 'Copy error'}</span>
          </button>
        </div>
      </details>
    </div>
  );
};

export default ErrorFallback;
