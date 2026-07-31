import React, { forwardRef } from 'react';

const FormControlLabel = forwardRef(({
  className = '', control, label, ...props
}, ref) => (
  <label ref={ref} className={`inline-flex cursor-pointer items-center gap-2 ${className}`} {...props}>
    {control}
    <span>{label}</span>
  </label>
));

FormControlLabel.displayName = 'FormControlLabel';

export default FormControlLabel;
