import PropTypes from 'prop-types';
import IconButton from '@material-ui/core/IconButton';
import CloseIcon from '@material-ui/icons/Close';
import KeyboardBackspaceIcon from '@material-ui/icons/KeyboardBackspace';

function ConnectWindow({ children, title, onBack, onClose }) {
  return (
    <div
      className="bg-[linear-gradient(to_bottom,_#30373B_0%,_#272D30_10%,_#1D2225_100%)] rounded-lg flex flex-col m-4"
    >
      <div className="flex items-center justify-between p-3">
        {onBack
          ? <IconButton aria-label="Go back" onClick={onBack}><KeyboardBackspaceIcon /></IconButton>
          : <div className="w-12" />}
        <div className="text-white font-semibold text-lg">{title}</div>
        {onClose
          ? <IconButton aria-label="Close" onClick={onClose}><CloseIcon /></IconButton>
          : <div className="w-12" />}
      </div>
      {children}
    </div>
  );
}

ConnectWindow.propTypes = {
  children: PropTypes.node.isRequired,
  title: PropTypes.string.isRequired,
  onBack: PropTypes.func,
  onClose: PropTypes.func,
};

export default ConnectWindow;
