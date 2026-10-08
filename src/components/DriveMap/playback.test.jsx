import { DriveMap } from '.';

describe('map playback commands', () => {
  it('animates an explicit seek without treating media observations as commands', () => {
    const props = { currentRoute: null, seekRevision: 0 };
    const map = new DriveMap(props);
    map.setState = (update) => { map.state = { ...map.state, ...update(map.state) }; };
    map.props = { ...props, seekRevision: 1 };
    map.componentDidUpdate(props);
    map.moveViewportTo([1, 2]);
    expect(map.state.viewport.transitionDuration).toBe(200);
    expect(map.shouldFlyTo).toBe(false);
    map.componentDidUpdate(map.props);
    expect(map.shouldFlyTo).toBe(false);
  });
});
