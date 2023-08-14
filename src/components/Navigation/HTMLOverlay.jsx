import { cloneElement, memo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useControl } from 'react-map-gl';

// Based on template in https://docs.mapbox.com/mapbox-gl-js/api/markers/#icontrol
class OverlayControl {
  #map = null;
  #container;
  #redraw;

  constructor(redraw) {
    this.#redraw = redraw;
  }

  onAdd(map) {
    this.#map = map;
    map.on('move', this._redraw);
    this.#container = document.createElement('div');
    this.#redraw();
    return this._container;
  }

  onRemove() {
    this.#container.remove();
    this.#map.off('move', this._redraw);
    this.#map = null;
  }

  getMap() {
    return this.#map;
  }

  getElement() {
    return this.#container;
  }
}

const HTMLOverlay = ({ children }) => {
  const [, setVersion] = useState(0);

  const ctrl = useControl(() => {
    const forceUpdate = () => setVersion((v) => v + 1);
    return new OverlayControl(forceUpdate);
  });

  const map = ctrl.getMap();
  return map && createPortal(cloneElement(children, { map }), ctrl.getElement());
};

export default memo(HTMLOverlay);
