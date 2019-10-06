import React from 'react';
import { storiesOf, addDecorator } from '@storybook/react';
// import {muiTheme} from 'storybook-addon-material-ui';

// Import some examples from material-ui
import VideoPlayer from '../components/video';

storiesOf('Material-UI', module)
// Add the `muiTheme` decorator to provide material-ui support to your stories.
// If you do not specify any arguments it starts with two default themes
// You can also configure `muiTheme` as a global decorator.
// .addDecorator(muiTheme())
  .add('Card Example Controlled', () => (
    <VideoPlayer />
  ));
