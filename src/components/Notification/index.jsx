import { Button, Typography } from '@material-ui/core';
import { Clear } from '../../icons';

const Notification = ({
  buttonClassName = '', buttonText, dismissLabel, heading, onButtonClick, onDismiss, subtitle,
}) => (
  <div className="relative box-border w-[360px] max-[599px]:w-full rounded-[22px] border border-[#303639] bg-[#424a4f] px-4 py-3 text-white">
    <button
      type="button"
      aria-label={dismissLabel}
      className="absolute -left-1.5 -top-2 flex h-6 w-6 cursor-pointer items-center justify-center rounded-xl border border-[#394044] bg-[#1e2224] p-[5px] text-white hover:bg-[#303639] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
      onClick={onDismiss}
    >
      <Clear aria-hidden="true" className="h-full w-full" />
    </button>
    <div className="mb-2.5 flex w-full items-start justify-between">
      <Typography className="text-xl font-semibold leading-[31px]">{heading}</Typography>
      <Button
        onClick={onButtonClick}
        className={`ml-2 min-h-[unset] min-w-[90px] rounded-[15px] bg-[#5e8bff] px-6 py-1.5 normal-case text-white hover:bg-[#547de6] hover:text-white ${buttonClassName}`}
      >
        {buttonText}
      </Button>
    </div>
    <Typography className="text-white/90">{subtitle}</Typography>
  </div>
);

export default Notification;
