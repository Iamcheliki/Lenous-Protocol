import React from 'react';

interface Props {
  actionType: 'buy' | 'sell';
  setActionType: (value: 'buy' | 'sell') => void;
}

const IsBuyOrSell: React.FC<Props> = ({ actionType, setActionType }) => {
  return (
    <div className="flex w-full  ">
      <button
        onClick={() => setActionType('buy')}
        className={`px-4 py-2 rounded-l-2xl  border border-light-gray flex-1 ${
          actionType === 'buy'
            ? 'bg-light-gray text-white'
            : 'bg-transparent text-white'
        }`}
      >
        Buy
      </button>
      <button
        onClick={() => setActionType('sell')}
        className={`px-4 py-2 rounded-r-2xl  border border-light-gray flex-1 ${
          actionType === 'sell'
            ? 'bg-light-gray text-white'
            : 'bg-transparent text-white'
        }`}
      >
        Sell
      </button>
    </div>
  );
};
export default IsBuyOrSell;
