import * as Redux from 'redux';
import React from 'react';
import ReactDOM from 'react-dom';
import { AutoSizer, List } from 'react-virtualized';
import { mount, shallow } from 'enzyme';
import { MuiThemeProvider } from '@material-ui/core/styles';
import Theme from '../../theme';

import AnnotationList from './AnnotationList';
import AnnotationEntry from './AnnotationListItem';

const defaultState = {
  start: Date.now()
};

const store = Redux.createStore((state) => {
  if (!state) {
    return { ...defaultState };
  }
  return state;
});

const events = [{
  type: 'disengage',
  timestamp: 50120948
}, {
  id: 123,
  type: 'disengage',
  timestamp: 123456
}, {
  id: 321,
  type: 'disengage',
  timestamp: 6126136
}];

it('renders without crashing', () => {
  const list = mount(<AnnotationList
    resolved
    store={store}
    segment={{
      hpgps: true,
      events
    }}
  />);

  expect(list.exists()).toBe(true);
  expect(list.instance()).toBeInstanceOf(AnnotationList);
  list.unmount();
});

it('shows the right events at the right times', () => {
  const list = mount(<AnnotationList
    resolved
    store={store}
    segment={{
      hpgps: true,
      events
    }}
  />);

  expect(list.find(List).length).toBe(1);
  expect(list.find(List).prop('rowCount')).toBe(2);
  let entry = shallow(
    <MuiThemeProvider theme={Theme}>
      { list.find(List).invoke('rowRenderer')({ index: 0 }) }
    </MuiThemeProvider>
  ).find(AnnotationEntry);
  expect(entry.exists()).toBe(true);
  expect(entry.prop('event')).toBeTruthy();
  expect(entry.prop('event').id).toBe(123);

  // switch to unresolved tab
  list.setProps({ resolved: false, unresolved: true });

  // check again
  expect(list.find(List).prop('rowCount')).toBe(1);
  entry = shallow(
    <MuiThemeProvider theme={Theme}>
      { list.find(List).invoke('rowRenderer')({ index: 0 }) }
    </MuiThemeProvider>
  ).find(AnnotationEntry);
  expect(entry.exists()).toBe(true);
  expect(entry.prop('event')).toBeTruthy();
  expect(entry.prop('event').timestamp).toBe(events[0].timestamp);
});
