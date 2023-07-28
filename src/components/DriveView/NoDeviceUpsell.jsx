import React from 'react';

import AddDevice from '../Dashboard/AddDevice';

const NoDeviceUpsell = () => (
  <div className="flex flex-col items-center mx-4 md:mx-6 lg:mx-8 mt-4 sm:mt-8 md:mt-16">
    <div className="flex flex-col prose prose-invert py-2 items-center max-w-sm">
      <h2>Pair your device</h2>
      <p>
        Scan the QR code on your device.
        If you cannot see a QR code, check the following:
        <ul>
          <li>Your device is connected to the internet</li>
          <li>You have installed the latest version of openpilot</li>
        </ul>
        If you still cannot see a QR code, your device may already be paired to
        another account. Make sure you have signed in with the same account you
        may have used previously.
      </p>
      <div className="mt-2 w-full">
        <AddDevice buttonText="add new device" />
      </div>
    </div>
    <picture>
      <source type="image/webp" srcSet="/images/c3-nav.webp" />
      <source type="image/png" srcSet="/images/c3-nav.png" />
      <img alt="comma three" />
    </picture>
  </div>
);

export default NoDeviceUpsell;
