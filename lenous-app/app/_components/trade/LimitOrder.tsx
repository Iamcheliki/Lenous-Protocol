import React from 'react';
import { useState, useEffect } from 'react';
import TimeInfForce from './TimeInForce';
import Time from './Time';
import TransactionInfo from './TransactionInfo';
import { ethers } from 'ethers';
import OrderbookABI from '@/app/_libs/utils/abis/Orderbook.json';
import { useEthersProvider, useEthersSigner } from '@/app/_libs/utils/ethers';
import { useWatchContractEvent } from 'wagmi';
import ProfitAndStop from './ProfitAndStop';
import { ORDERBOOK_ADDRESS } from '@/app/_libs/utils/constants/contractAddresses';

interface Props {
  marginType: number;
  leverage: number;
  actionType: 'buy' | 'sell';
}

const LimitOrder: React.FC<Props> = ({ marginType, leverage, actionType }) => {
  const [amount, setAmount] = useState<string>('5');
  const [limitPrice, setLimitPrice] = useState<string>('3800');
  const [hasTime, setHasTime] = useState<boolean>(true);
  const [expirationTime, setExpirationTime] = useState<number>(
    Math.floor(Date.now() / 1000) + 5
  );
  const [time, setTime] = useState<{ type: string; amount: number }>({
    type: 'Days',
    amount: 28,
  });
  const [profit, setProfit] = useState<string>('0');
  const [stopLoss, setStopLoss] = useState<string>('0');

  useEffect(() => {
    console.log(time);
    if (hasTime) {
      let timeInSeconds = 0;
      switch (time.type) {
        case 'Days':
          timeInSeconds = time.amount * 24 * 60 * 60;
          break;
        case 'Hours':
          timeInSeconds = time.amount * 60 * 60;
          break;
        case 'Mins':
          timeInSeconds = time.amount * 60;
          break;
        case 'Weeks':
          timeInSeconds = time.amount * 7 * 24 * 60 * 60;
          break;
        default:
          timeInSeconds = 5;
      }
      setExpirationTime(Math.floor(Date.now() / 1000) + timeInSeconds);
    }
  }, [time, hasTime]);

  const provider = useEthersProvider();
  const signer = useEthersSigner();

  const contract = new ethers.Contract(
    ORDERBOOK_ADDRESS,
    OrderbookABI,
    signer || provider
  );

  useWatchContractEvent({
    address: ORDERBOOK_ADDRESS,
    abi: OrderbookABI,
    eventName: 'OrderPlaced',
    onLogs(logs) {
      console.log('New logs!', logs);
    },
  });

  const submitLimitOrder = async () => {
    const price = ethers.utils.parseUnits('3800', 6);
    const stopLossPrice = ethers.utils.parseUnits(stopLoss, 6);
    const takeProfitPrice = ethers.utils.parseUnits(profit, 6);
    const parsedAmount = ethers.utils.parseUnits(amount.toString(), 6);
    const gasLimit = ethers.utils.hexlify(1000000);
    const isBuyOrder = actionType == 'buy' ? true : false;
    console.log(isBuyOrder);
    try {
      const tx = await contract.placeLimitOrder(
        price,
        takeProfitPrice,
        stopLossPrice,
        parsedAmount,
        isBuyOrder,
        expirationTime,
        leverage,
        marginType,
        { gasLimit }
      );

      await tx.wait();
      console.log('Limit order placed successfully!');
    } catch (error) {
      console.error('Transaction failed:', error);
    }
  };

  return (
    <div className="mt-4">
      <div className="mb-4">
        <label
          htmlFor="limitPrice"
          className="block text-sm text-neutral-light font-medium "
        >
          Limit Price
        </label>
        <input
          id="limitPrice"
          type="text"
          placeholder="$0.0"
          value={limitPrice}
          onChange={(e) => setLimitPrice(e.target.value)}
          className="mt-1 block w-full  px-4 py-3  rounded-2xl  text-neutral-light bg-white-bg-05 sm:text-sm"
        />
      </div>
      <div className="mb-4">
        <label
          htmlFor="amount"
          className="block text-sm text-neutral-light font-medium "
        >
          Amount
        </label>
        <input
          id="amount"
          type="text"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="mt-1 block w-full  px-4 py-3  rounded-2xl text-neutral-light bg-white-bg-05 sm:text-sm"
          placeholder="Enter amount"
        />
      </div>
      <div className="mt-6  ">
        <div className="text-white mb-4">Advanced</div>

        <div className="flex items-center gap-4 justify-between ">
          <div className="grow">
            <TimeInfForce setHasTime={setHasTime} hasTime={hasTime} />
          </div>
          {hasTime && (
            <div className="grow">
              <Time setTime={setTime} />
            </div>
          )}
        </div>
        <div className="mt-4 text-center ">
          <ProfitAndStop
            profit={profit}
            setProfit={setProfit}
            stopLoss={stopLoss}
            setStopLoss={setStopLoss}
          />
        </div>

        <div className="transactionInfo">
          <TransactionInfo submitOrder={submitLimitOrder} />
        </div>
      </div>
    </div>
  );
};
export default LimitOrder;
