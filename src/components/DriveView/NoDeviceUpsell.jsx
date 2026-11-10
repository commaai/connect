import AddDevice from '../Dashboard/AddDevice';

const NoDeviceUpsell = () => (
  <div className="flex flex-col items-center mx-4 md:mx-6 lg:mx-8 mt-4 sm:mt-8 md:mt-16">
    <div className="flex flex-col prose prose-invert py-2 items-center max-w-sm">
      <h2>Pair your device</h2>
      <p>
        On your device, navigate to <b>settings</b> {`>`} <b>device</b> {`>`} <b>pair</b>.
        In the pair menu, you should see a QR code.
        Press &quot;add new device&quot; to open the camera or use the camera app on your phone to scan the QR code.
      </p>
      <p className="mb-1">
        If you cannot see a QR code, check the following:
      </p>
      <ul className="my-0">
        <li>Your device is connected to the internet</li>
        <li>You have installed the latest version of openpilot</li>
        <li>Your device is not already paired. Make sure you have signed in with the same account you may have used previously.</li>
      </ul>
      <div className="mt-2 w-full">
        <AddDevice buttonText="add new device" />
      </div>
    </div>
    <picture className="max-w-3xl mt-4 p-4">
      <source type="image/png" srcSet="/images/comma-device.png" />
      <img alt="comma four" />
    </picture>
  </div>
);

export default NoDeviceUpsell;
