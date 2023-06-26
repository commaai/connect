import PropTypes from 'prop-types';
import IconButton from '@material-ui/core/IconButton';
import CloseIcon from '@material-ui/icons/Close';

function ConnectWindow({ children, title, onClose }) {
  return (
    <div className="bg-[linear-gradient(to_bottom,_#30373B_0%,_#272D30_10%,_#1D2225_100%)] rounded-lg flex flex-col m-6">
      <div className="flex items-center justify-between p-3">
        {onClose && <IconButton onClick={onClose}><CloseIcon /></IconButton>}
        <div className="text-white font-semibold text-lg">{title}</div>
        <div className="w-6" />
      </div>
      {children}
    </div>
  );
}

ConnectWindow.propTypes = {
  children: PropTypes.node.isRequired,
};

export default ConnectWindow;
