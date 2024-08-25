import React from 'react';

interface Props {
  orderType: 'limit' | 'market';
  setOrderType: (value: 'limit' | 'market') => void;
}

const OrderType: React.FC<Props> = ({ setOrderType, orderType }) => {
  return (
    <div className="flex space-x-4 pb-5 italic ">
      <button
        onClick={() => setOrderType('limit')}
        className={`px-4 py-2  italic ${
          orderType === 'limit'
            ? ' text-primary underline'
            : 'text-neutral-light'
        }`}
      >
        Limit
      </button>
      <button
        onClick={() => setOrderType('market')}
        className={`px-4 py-2 italic  ${
          orderType === 'market'
            ? ' text-primary underline'
            : 'text-neutral-light'
        }`}
      >
        Market
      </button>
    </div>
  );
};
export default OrderType;
