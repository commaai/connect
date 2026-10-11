import React, { useEffect, useRef, useState } from 'react';
import { athena, request as apiRequest } from '../../api';
import { deviceIsOnline } from '../../utils';

export default function DestinationEntry({ device, dongleId }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [selected, setSelected] = useState(null);
  const [searching, setSearching] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const controller = useRef(null);
  const mounted = useRef(true);
  const online = deviceIsOnline(device);
  const available = device.prime && online;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      controller.current?.abort();
    };
  }, []);

  async function search(event) {
    event.preventDefault();
    if (!query.trim() || pending) return;
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    setSearching(true);
    setResults([]);
    setSelected(null);
    setMessage('');
    setError('');
    try {
      const params = new URLSearchParams({ limit: '5', autocomplete: 'false' });
      const response = await fetch(`${apiRequest.baseUrl}v1/nav/geocoding/v5/mapbox.places/${encodeURIComponent(query.trim())}.json?${params}`, {
        headers: apiRequest.headers,
        signal: request.signal,
      });
      if (!response.ok) throw new Error('search failed');
      const data = await response.json();
      if (request.signal.aborted) return;
      const places = data.features.filter(place => place.center?.length === 2
        && place.center.every(Number.isFinite) && Math.abs(place.center[0]) <= 180 && Math.abs(place.center[1]) <= 90);
      setResults(places);
      if (!places.length) setMessage('No places found. Try a more specific address.');
    } catch (err) {
      if (!request.signal.aborted) setError('Could not search for places. Please try again.');
    } finally {
      if (!request.signal.aborted) setSearching(false);
    }
  }

  async function send(method) {
    if (!available || pending || (method === 'setNavDestination' && !selected)) return;
    setPending(true);
    setMessage('');
    setError('');
    try {
      const params = method === 'setNavDestination' ? { longitude: selected.center[0], latitude: selected.center[1] } : {};
      const response = await athena.postJsonRpcPayload(dongleId, { jsonrpc: '2.0', id: 0, method, params });
      if (!mounted.current) return;
      if (response?.error?.code === -32601) {
        setError('Navigation is not available on this device yet.');
      } else if (response?.result?.success !== 1) {
        setError('Could not update the destination. Please try again.');
      } else {
        setMessage(method === 'setNavDestination' ? 'Destination sent to your device.' : 'Destination cleared.');
      }
    } catch {
      if (mounted.current) setError('Could not reach your device. Please try again.');
    } finally {
      if (mounted.current) setPending(false);
    }
  }

  return (
    <section aria-label="Navigation destination" className="border-b border-white/10 bg-[#17191c] p-4 text-white">
      <form onSubmit={search} className="flex gap-2">
        <input aria-label="Destination" placeholder="Enter an address or place" value={query} disabled={pending}
          className="min-w-0 flex-1 rounded-lg border border-white/20 bg-black/20 px-3 py-2"
          onChange={event => {
            controller.current?.abort();
            setSearching(false);
            setQuery(event.target.value);
            setResults([]);
            setSelected(null);
            setMessage('');
            setError('');
          }} />
        <button type="submit" disabled={!query.trim() || searching || pending}
          className="rounded-lg bg-white px-4 py-2 font-semibold text-black disabled:opacity-40">
          {searching ? 'Searching...' : 'Search'}
        </button>
      </form>
      {results.length > 0 && !selected && (
        <ul className="mt-2 divide-y divide-white/10">
          {results.map(place => <li key={place.id}>
            <button type="button" onClick={() => setSelected(place)} className="w-full rounded-lg px-3 py-3 text-left hover:bg-white/10">
              {place.place_name}
            </button>
          </li>)}
        </ul>
      )}
      {selected && <p className="mt-3 font-semibold">{selected.place_name}</p>}
      <div className="mt-3 flex flex-wrap gap-3">
        {selected && <button type="button" disabled={!available || pending} onClick={() => send('setNavDestination')}
          className="rounded-lg bg-[#6de3a2] px-4 py-2 font-semibold text-black disabled:opacity-40">
          {pending ? 'Sending...' : 'Send destination'}
        </button>}
        <button type="button" disabled={!available || pending} onClick={() => send('clearNavDestination')}
          className="rounded-lg border border-white/20 px-3 py-2 disabled:opacity-40">Clear destination</button>
      </div>
      {!device.prime && <p className="mt-2 text-sm text-white/60">Prime is required to send destinations.</p>}
      {device.prime && !online && <p className="mt-2 text-sm text-white/60">Your device must be online to receive a destination.</p>}
      {message && <p role="status" className="mt-2 text-sm text-[#6de3a2]">{message}</p>}
      {error && <p role="alert" className="mt-2 text-sm text-red-300">{error}</p>}
    </section>
  );
}
