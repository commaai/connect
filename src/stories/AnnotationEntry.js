const React = require('react');
const { storiesOf, addDecorator } = require('@storybook/react');
const decorator = require('./decorator');

// Import some examples = require(material-u)i
const AnnotationEntry = require('../components/annotations/entry');

storiesOf('Material-UI', module)
// Add the `muiTheme` decorator to provide material-ui support to your stories.
// If you do not specify any arguments it starts with two default themes
// You can also configure `muiTheme` as a global decorator.
  .addDecorator(decorator)
  .add('Card Example Controlled', () => (
    <AnnotationEntry />
  ));
