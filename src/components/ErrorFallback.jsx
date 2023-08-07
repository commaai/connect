import React, { useEffect, useRef, useState } from 'react';

import { Check, ContentCopy, Refresh } from '../icons';

const ErrorFallback = ({ error, componentStack }) => {
  const [swInfo, setSwInfo] = useState('');
  const [copied, setCopied] = useState(false);
  const copiedInterval = useRef(null);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      setSwInfo('loading...');
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        if (registrations.length === 0) {
          setSwInfo('none');
          return;
        }
        const serviceWorkers = registrations.map((r) => `${r.scope} ${r.active?.state}`);
        setSwInfo(serviceWorkers.join('; '));
      }).catch((err) => {
        setSwInfo(err.toString());
      });
    } else {
      setSwInfo('not supported');
    }
  }, []);

  const information = `connect version: ${import.meta.env.VITE_APP_GIT_SHA || 'unknown'}
Release timestamp: ${import.meta.env.VITE_APP_GIT_TIMESTAMP || 'unknown'}
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
      await navigator.clipboard.writeText(`\`\`\`${information}\`\`\``);
      setCopied(true);
      copiedInterval.current = setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const reload = async () => {
    // Unregister all service workers
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((r) => r.unregister()));
    }

    // Reload the page
    window.location.reload();
  };

  return (
    <div className="m-4">
      <div className=" prose prose-invert">
        <h2>Oops!</h2>
        <p>Something went wrong. Please reload the page.</p>
        <p>
          If you continue to have problems, let us know on
          {' '}
          <a href="https://discord.comma.ai" target="_blank" rel="noreferrer">Discord</a>
          {' '}
          in the
          {' '}
          <span className="whitespace-nowrap"><strong>#connect-feedback</strong></span>
          {' '}
          channel.
        </p>
        <div className="flex flex-row gap-4">
          <button
            className="flex items-center gap-1 bg-blue-600 rounded-md px-4 py-2 font-bold hover:bg-blue-500 transition-colors"
            type="button"
            onClick={reload}
          >
            Reload
            <Refresh />
          </button>
        </div>
      </div>
      <details className="mt-8">
        <summary>Show debugging information</summary>
        <div className="relative bg-black rounded-xl mt-2 overflow-hidden">
          <pre className="select-all overflow-x-auto px-4 pt-4 pb-2 text-sm">
            {information}
          </pre>
          <button
            className={`absolute right-2 top-2 flex rounded-md pl-2 pr-2 py-2 text-white font-bold transition-colors ${copied ? 'bg-green-500' : 'bg-gray-700 hover:bg-gray-600'}`}
            type="button"
            aria-label={copied ? 'Copied' : 'Copy error'}
            onClick={copyError}
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
