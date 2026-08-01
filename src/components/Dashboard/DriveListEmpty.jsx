import React from 'react';

const DriveListEmpty = ({ device, routes }) => {
  let zeroRidesEle = null;

  if (device && routes === null) {
    zeroRidesEle = <p>Loading...</p>;
  } else if (routes?.length === 0) {
    zeroRidesEle = (
      <p>No routes found in selected time range.</p>
    );
  }

  return (
    <div className="flex w-full flex-[0_1_0%] px-4 py-4 min-[521px]:px-9">
      {zeroRidesEle}
    </div>
  );
};

export default DriveListEmpty;
