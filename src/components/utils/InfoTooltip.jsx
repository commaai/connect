import { ClickAwayListener, Tooltip, Typography } from '@mui/material';
import { styled } from '@mui/material/styles';
import { useState } from 'react';

import { InfoOutline } from '../../icons';

const StyledTooltip = styled(Tooltip)(({ theme }) => ({
  '& .MuiTooltip-tooltip': {
    background: theme.palette.grey[900],
    marginBottom: 8,
  },
  '& .MuiTooltip-popper': {
    opacity: 1,
  },
}));

const ArrowSpan = styled('span')(({ theme }) => ({
  position: 'absolute',
  fontSize: 7,
  width: '3em',
  height: '3em',
  bottom: 0,
  left: 0,
  marginBottom: '-0.9em',
  '&::before': {
    content: '""',
    margin: 'auto',
    display: 'block',
    width: 0,
    height: 0,
    borderStyle: 'solid',
    borderWidth: '1em 1em 0 1em',
    borderColor: `${theme.palette.grey[900]} transparent transparent transparent`,
  },
}));

const InfoTooltip = ({ title }) => {
  const [arrowRef, setArrowRef] = useState(null);
  const [open, setOpen] = useState(false);

  const handleArrowRef = (node) => {
    setArrowRef(node);
  };

  const onTooltipOpen = () => {
    setOpen(true);
  };

  const onTooltipClose = () => {
    setOpen(false);
  };

  return (
    <ClickAwayListener onClickAway={onTooltipClose}>
      <StyledTooltip
        PopperProps={{
          popperOptions: {
            modifiers: {
              arrow: {
                enabled: Boolean(arrowRef),
                element: arrowRef,
              },
            },
          },
        }}
        title={
          <>
            <Typography color="inherit">{title}</Typography>
            <ArrowSpan ref={handleArrowRef} />
          </>
        }
        onOpen={onTooltipOpen}
        onClose={onTooltipClose}
        open={open}
        placement="top"
      >
        <InfoOutline sx={{ ml: 1, fontSize: 18 }} onClick={onTooltipOpen} />
      </StyledTooltip>
    </ClickAwayListener>
  );
};

export default InfoTooltip;
