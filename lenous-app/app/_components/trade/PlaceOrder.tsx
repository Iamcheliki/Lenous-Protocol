import React, { useState } from 'react';

import Leverage from './Leverage';
import IsBuyOrSell from './IsBuyOrSell';
import OrderType from './OrderType';
import LimitOrder from './LimitOrder';
import MarketOrder from './MarketOrder';
import MarginType from './MarginType';

const PlaceOrder: React.FC = () => {
  const [marginType, setMarginType] = useState<number>(0);
  const [orderType, setOrderType] = useState<'limit' | 'market'>('market');
  const [actionType, setActionType] = useState<'buy' | 'sell'>('buy');
  const [leverage, setLeverage] = useState<number>(1);

  return (
    <div className="p-4">
      {/* Margin Type Selection */}
      <div className="mb-4  ">
        <IsBuyOrSell actionType={actionType} setActionType={setActionType} />
        <div className="flex mt-4">
          <div className="flex-1 mr-2">
            <MarginType marginType={marginType} setMarginType={setMarginType} />
          </div>
          <div className="flex-1">
            <Leverage leverage={leverage} setLeverage={setLeverage} />
          </div>
        </div>
      </div>

      {/* Tab Pane */}
      <div className="mb-4">
        <OrderType orderType={orderType} setOrderType={setOrderType} />
        <div className="w-full h-0 border-neutral-light border-b"></div>
        {orderType === 'market' && (
          <MarketOrder
            marginType={marginType}
            leverage={leverage}
            actionType={actionType}
          />
        )}
        {orderType === 'limit' && (
          <LimitOrder
            marginType={marginType}
            leverage={leverage}
            actionType={actionType}
          />
        )}
      </div>
    </div>
  );
};

export default PlaceOrder;
