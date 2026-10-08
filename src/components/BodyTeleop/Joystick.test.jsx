import React from 'react';
import { fireEvent, render } from '@testing-library/react';
import Joystick from './Joystick';

vi.mock('../../hooks/window', () => ({ getOrientationSource: () => ({ addEventListener: vi.fn(), removeEventListener: vi.fn() }) }));

function setup() {
  const connection = { setJoystick: vi.fn() };
  const props = { connection, activeCamera: 'driver', onGamepadChange: vi.fn(), onSwitchCamera: vi.fn() };
  const view = render(<div><Joystick {...props} /><button onMouseUp={e => e.stopPropagation()}>Camera</button></div>);
  const area = view.container.querySelector('.touch-none');
  vi.spyOn(area, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 200, height: 200 });
  return { ...view, connection, area, props };
}

test('release over a control that stops bubbling still sends neutral', () => {
  const { area, connection, getByText } = setup();
  fireEvent.mouseDown(area, { button: 0, clientX: 170, clientY: 20 });
  expect(connection.setJoystick).not.toHaveBeenLastCalledWith(0, 0);
  fireEvent.mouseUp(getByText('Camera'), { button: 0 });
  expect(connection.setJoystick).toHaveBeenLastCalledWith(0, 0);
  connection.setJoystick.mockClear();
  fireEvent.mouseMove(document, { clientX: 150, clientY: 30 });
  expect(connection.setJoystick).not.toHaveBeenCalled();
});

test('camera change during a drag sends neutral and removes the old drag listeners', () => {
  const { area, connection, props, rerender } = setup();
  fireEvent.mouseDown(area, { button: 0, clientX: 170, clientY: 20 });
  rerender(<div><Joystick {...props} activeCamera="wideRoad" /><button>Camera</button></div>);
  expect(connection.setJoystick).toHaveBeenLastCalledWith(0, 0);
  connection.setJoystick.mockClear();
  fireEvent.mouseMove(document, { clientX: 190, clientY: 20 });
  expect(connection.setJoystick).not.toHaveBeenCalled();
});

test('unmount while dragging sends neutral', () => {
  const { area, connection, unmount } = setup();
  fireEvent.mouseDown(area, { button: 0, clientX: 170, clientY: 20 });
  unmount();
  expect(connection.setJoystick).toHaveBeenLastCalledWith(0, 0);
});

test.each([1, 2])('mouse button %i cannot start a drag', button => {
  const { area, connection } = setup();
  fireEvent.mouseDown(area, { button, clientX: 170, clientY: 20 });
  expect(connection.setJoystick).not.toHaveBeenCalled();
});
