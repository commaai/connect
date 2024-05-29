import * as React from "react";
import { useControl } from "react-map-gl";
import { useState, cloneElement } from "react";
import { createPortal } from "react-dom";

class OverlayControl {
  constructor(redraw) {
    this._map = null;
    this._container = null;
    this._redraw = redraw;
    this.handleEvent = this.handleEvent.bind(this);
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

  handleEvent(e) {
    e.stopPropagation();
  }

  getMap() {
    return this._map;
  }

  getElement() {
    return this._container;
  }
}

const CustomOverlay = (props) => {
  const [, setVersion] = useState(0);
  console.log("CustomOverlay constructor");

  const ctrl = useControl(() => {
    const forceUpdate = () => setVersion((v) => v + 1);
    return new OverlayControl(forceUpdate);
  });

  const map = ctrl.getMap();

  if (!map) {
    return null;
  }

  return createPortal(cloneElement(props.children, { map }), ctrl.getElement());
};

export default React.memo(CustomOverlay);
