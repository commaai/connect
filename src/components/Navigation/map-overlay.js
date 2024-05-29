import * as React from "react";
import { useState, cloneElement } from "react";
import { createPortal } from "react-dom";

class OverlayControl {
  _map = null;
  _container;
  _redraw;

  constructor(redraw) {
    this._redraw = redraw;
  }

  onAdd(map) {
    this._map = map;
    map.on("move", this._redraw);
    this._container = document.createElement("div");
    this.addEventListeners();
    this._redraw();
    return this._container;
  }

  onRemove() {
    this.removeEventListeners();
    this._container.remove();
    this._map.off("move", this._redraw);
    this._map = null;
  }

  addEventListeners() {
    this._container.addEventListener("scroll", this.handleEvent, true);
    this._container.addEventListener("drag", this.handleEvent, true);
    this._container.addEventListener("click", this.handleEvent, true);
    this._container.addEventListener("dblclick", this.handleEvent, true);
    this._container.addEventListener("pointermove", this.handleEvent, true);
  }

  removeEventListeners() {
    this._container.removeEventListener("scroll", this.handleEvent, true);
    this._container.removeEventListener("drag", this.handleEvent, true);
    this._container.removeEventListener("click", this.handleEvent, true);
    this._container.removeEventListener("dblclick", this.handleEvent, true);
    this._container.removeEventListener("pointermove", this.handleEvent, true);
  }

  handleEvent = (e) => {
    e.stopPropagation(); // Prevent event from affecting underlying map
  };

  getMap() {
    return this._map;
  }

  getElement() {
    return this._container;
  }
}

function CustomOverlay(props) {
  const [, setVersion] = useState(0);

  const ctrl = useControl(() => {
    const forceUpdate = () => setVersion((v) => v + 1);
    return new OverlayControl(forceUpdate);
  });

  const map = ctrl.getMap();

  if (!map) {
    return null;
  }

  return createPortal(cloneElement(props.children, { map }), ctrl.getElement());
}

export default React.memo(CustomOverlay);
