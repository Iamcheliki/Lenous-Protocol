import React, { useEffect, useState } from 'react';
import { ethers } from 'ethers';
import { useEthersProvider, useEthersSigner } from '@/app/_libs/utils/ethers';
import OrderbookABI from '@/app/_libs/utils/abis/Orderbook.json';
import TransactionInfo from './TransactionInfo';
import { ORDERBOOK_ADDRESS } from '@/app/_libs/utils/constants/contractAddresses';

interface Props {
  marginType: number;
  leverage: number;
  actionType: 'buy' | 'sell';
}

const MarketOrder: React.FC<Props> = ({ marginType, leverage, actionType }) => {
  const [amount, setAmount] = useState<string>('5');
  const provider = useEthersProvider();
  const signer = useEthersSigner();

  // Initialize contract instance
  const contract = new ethers.Contract(
    ORDERBOOK_ADDRESS,
    OrderbookABI,
    signer || provider
  );

  const submitMarketOrder = async () => {
    const parsedAmount = ethers.utils.parseUnits(amount.toString(), 6);
    const gasLimit = ethers.utils.hexlify(1000000);
    const isBuyOrder = actionType == 'buy' ? true : false;

    try {
      const tx = await contract.placeMarketOrder(
        parsedAmount,
        isBuyOrder,
        leverage,
        marginType,
        { gasLimit }
      );

      await tx.wait();
      console.log('Market order placed successfully!');
    } catch (error) {
      console.error('Transaction failed:', error);
    }
  };

  return (
    <div className="mt-4">
      <div className="mb-4">
        <label
          htmlFor="amount"
          className="block text-sm font-medium text-neutral-light"
        >
          Amount
        </label>
        <input
          id="amount"
          type="text"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="mt-1 block w-full px-4 py-3 rounded-2xl text-neutral-light shadow-sm bg-white-bg-05 sm:text-sm"
          placeholder="Enter amount"
        />
      </div>
      <TransactionInfo submitOrder={submitMarketOrder} />
    </div>
  );
};

export default MarketOrder;
