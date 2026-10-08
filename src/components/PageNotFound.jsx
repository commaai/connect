import { Button, Typography } from '@material-ui/core';

const PageNotFound = ({ dongleId, onHome }) => (
  <div className="flex flex-col items-start gap-4 p-8">
    <Typography variant="title">Page not found</Typography>
    <Typography>This link does not match any page in connect.</Typography>
    <Button variant="outlined" onClick={onHome}>
      {dongleId ? 'Go to dashboard' : 'Go home'}
    </Button>
  </div>
);

export default PageNotFound;
