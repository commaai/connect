import DriveList from './DriveList';
import Navigation from '../Navigation';
import Promotions from '../Promotions';
import DeviceInfo from '../DeviceInfo';

const Dashboard = () => (
  <div className="relative flex flex-col">
    <Navigation />
    <Promotions />
    <DeviceInfo />
    <DriveList />
  </div>
);

export default Dashboard;
