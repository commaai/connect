import { connect } from 'react-redux';

import { InfoOutline } from '../icons';

const DeviceAccessNotice = ({ device, dongleId, profile }) => {
  if (!dongleId || !device || device.dongle_id !== dongleId || device.is_owner !== false || profile?.superuser) {
    return null;
  }

  return (
    <aside aria-label="Device access" className="flex items-start gap-3 border-b border-white/10 bg-white/5 px-4 py-3 text-white">
      <InfoOutline aria-hidden="true" className="mt-0.5 shrink-0 text-xl text-white/60" />
      <div className="min-w-0">
        <p className="m-0 text-sm font-semibold">Read-only access</p>
        <p className="mb-0 mt-1 text-sm leading-relaxed text-white/70">
          You can view available drives and download uploaded files. Device settings, upload requests,
          and changes to public access or preservation require owner access.
        </p>
      </div>
    </aside>
  );
};

const stateToProps = (state) => ({
  device: state.device,
  dongleId: state.dongleId,
  profile: state.profile,
});

export default connect(stateToProps)(DeviceAccessNotice);
