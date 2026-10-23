import { connect } from 'react-redux';

import DriveList from './DriveList';
import Navigation from '../Navigation';
import Promotions from '../Promotions';
import DeviceInfo from '../DeviceInfo';
import FullPageLoading from '../FullPageLoading';

const Dashboard = ({ device, dongleId }) => {
  if (!device || !dongleId) {
    return <FullPageLoading />;
  }

  return (
    <div className="relative flex flex-col">
      <Navigation />
      <Promotions />
      <DeviceInfo />
      <DriveList />
    </div>
  );
};

const stateToProps = (state) => ({
  dongleId: state.dongleId,
  device: state.device,
});

export default connect(stateToProps)(Dashboard);
