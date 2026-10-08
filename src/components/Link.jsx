import { forwardRef } from 'react';
import { Link as RouterLink } from 'react-router-dom';

import { urlFor } from '../url';

// a link to a page of the route table, see url.js
const Link = forwardRef(({ page, params, ...props }, ref) => (
  <RouterLink ref={ref} to={urlFor(page, params)} {...props} />
));

export default Link;
