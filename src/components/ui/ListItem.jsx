import React, { forwardRef } from 'react';

const ListItem = forwardRef(({ children, className = '', ...props }, ref) => (
  <div ref={ref} className={`relative flex w-full items-center px-4 py-3 ${className}`} {...props}>
    {children}
  </div>
));

ListItem.displayName = 'ListItem';

export default ListItem;
