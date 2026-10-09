import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import './src/index.css';
import SmallWindow from './src/components/DriveView/SmallWindow';

const cls = 'absolute z-20 overflow-hidden rounded-lg shadow-lg ring-1 ring-white/20';

function App() {
  const [map, setMap] = useState(true);
  const [video, setVideo] = useState(true);
  return (
    <div style={{ width: 600, padding: 20 }}>
      <div className="relative mx-auto aspect-[1.593] w-full max-w-[964px] min-h-[200px]">
        <SmallWindow small={video} dragAnywhere storageKey="hv" aspect={1.593} resizeCorner="bottom-right"
          fullClassName="absolute inset-0 isolate" smallClassName={`${cls} aspect-[1.593]`}
          defaultClassName="left-2 top-2 w-[38%] max-w-[280px]" closeLabel="Hide mini video" onClose={() => setVideo(false)}>
          <div className="absolute inset-0 bg-blue-800" onPointerUp={() => {}} />
        </SmallWindow>
        {map && (
          <SmallWindow small storageKey="hm" aspect={4 / 3} resizeCorner="top-left"
            fullClassName="absolute inset-0 z-10" smallClassName={`${cls} aspect-[4/3]`}
            defaultClassName="bottom-1 right-1 w-[38%] max-w-[280px]" closeLabel="Hide mini map" onClose={() => setMap(false)}>
            <div className="absolute inset-0 bg-green-800" />
          </SmallWindow>
        )}
      </div>
      <p id="state" style={{ color: 'white' }}>{`map:${map} video:${video}`}</p>
    </div>
  );
}
createRoot(document.getElementById('root')).render(<App />);
