/* eslint-env jest */
import React from 'react';
import { mount } from 'enzyme';
import { MuiThemeProvider } from '@material-ui/core/styles';

import AnnotationEntry from './AnnotationListItem';
import Theme from '../../theme';

describe('AnnotationListItem', () => {
  it('has AnnotationListEntry class for puppeteer', () => {
    const list = mount(
      <MuiThemeProvider theme={Theme}>
        <AnnotationEntry
          event={{
            type: 'disengage',
            timestamp: 50120948,
            time: 501209481029,
          }}
          segment={{
            hpgps: true,
            events: []
          }}
        />
      </MuiThemeProvider>
    );

    expect(list.exists()).toBe(true);
    expect(list.exists('.AnnotationListEntry')).toBe(true);
    list.unmount();
  });
});
