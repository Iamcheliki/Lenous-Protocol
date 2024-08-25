import React, { useEffect, useState } from 'react';
import { ethers, providers, BigNumber } from 'ethers';
import OrderbookABI from '@/app/_libs/utils/abis/Orderbook.json';
import { useEthersProvider } from '@/app/_libs/utils/ethers';
import { useWatchContractEvent } from 'wagmi';
import { useConnectModal } from '@rainbow-me/rainbowkit';
import { useAccount, useDisconnect } from 'wagmi';
import Icon from '../UI/icon';
import { ORDERBOOK_ADDRESS } from '@/app/_libs/utils/constants/contractAddresses';

interface OrderPlacedEventArgs {
  orderId: BigNumber;
  trader: string;
  orderType: number; // Assuming OrderType is an enum with numeric values
  price: BigNumber;
  amount: BigNumber;
  stoploss: BigNumber;
  takeprofit: BigNumber;
  expiration: BigNumber;
  asset: string;
}

interface Order {
  orderId: string;
  trader: string;
  orderType: string; // 1 for buy, 2 for sell
  price: string;
  amount: string;
  total: string; // Running total in USDC
  stoploss: string;
  takeprofit: string;
  expiration: string;
  asset: string;
  progress: number; // Percentage for progress bar
}

interface OrderbookProps {
  userAddress: string;
}

const formatNumber = (value: number, decimals: number): string => {
  const options: Intl.NumberFormatOptions = {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  };

  const formatter = new Intl.NumberFormat('en-US', options);
  let formatted = formatter.format(value);

  if (value % 1 === 0) {
    formatted = formatted.replace(/\.0+$/, ''); // Remove trailing '.0'
  }

  return formatted;
};

const Orderbook: React.FC<OrderbookProps> = ({ userAddress }) => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const provider = useEthersProvider();
  const { isConnecting, isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { disconnect } = useDisconnect();

  useWatchContractEvent({
    address: ORDERBOOK_ADDRESS,
    abi: OrderbookABI,
    eventName: 'OrderPlaced',
    onLogs(logs) {
      console.log('New logs!', logs);
    },
  });

  useEffect(() => {
    const fetchOrders = async () => {
      setLoading(true);
      setError(null);
      try {
        const contract = new ethers.Contract(
          ORDERBOOK_ADDRESS,
          OrderbookABI,
          provider
        );
        const fromBlock = 0;
        const toBlock = await provider.getBlockNumber();
        console.log('Fetching from block', fromBlock, 'to block', toBlock);
        const chunkSize = 800;
        const fetchedOrders: Order[] = [];
        const maxOrders = 5; // Limit the number of orders to fetch
        for (
          let startBlock = fromBlock;
          startBlock <= toBlock && fetchedOrders.length < maxOrders;
          startBlock += chunkSize
        ) {
          const endBlock = Math.min(startBlock + chunkSize - 1, toBlock);
          console.log(
            'Fetching events from block',
            startBlock,
            'to block',
            endBlock
          );
          // Query for OrderPlaced events
          const events = await contract.queryFilter(
            contract.filters.OrderPlaced(
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null
            ),
            startBlock,
            endBlock
          );
          console.log('Fetched events', events);
          const newOrders = events.map((event) => {
            const args = event.args as OrderPlacedEventArgs;
            const price = parseFloat(ethers.utils.formatUnits(args.price, 6));
            const amount = parseFloat(ethers.utils.formatUnits(args.amount, 6));
            return {
              orderId: args.orderId.toString(),
              trader: args.trader,
              orderType: args.orderType.toString(), // '1' for buy, '2' for sell
              price: formatNumber(price, 3), // Format with 3 decimal places and commas
              amount: formatNumber(amount, 3),
              total: '0', // Will be updated later
              stoploss: ethers.utils.formatUnits(args.stoploss, 6),
              takeprofit: ethers.utils.formatUnits(args.takeprofit, 6),
              expiration: new Date(
                args.expiration.toNumber() * 1000
              ).toLocaleString(),
              asset: args.asset,
              progress: 0, // will be calculated later
            };
          });
          fetchedOrders.push(...newOrders);
          if (fetchedOrders.length >= maxOrders) {
            break; // Exit loop if we have fetched enough orders
          }
        }
        // Calculate running totals for each order type
        const buyOrders = fetchedOrders.filter(
          (order) => order.orderType === '1'
        );
        const sellOrders = fetchedOrders.filter(
          (order) => order.orderType === '2'
        );
        let runningTotalBuy = 0;
        let runningTotalSell = 0;
        const updatedBuyOrders = buyOrders.map((order) => {
          runningTotalBuy += parseFloat(order.amount);
          return {
            ...order,
            total: formatNumber(runningTotalBuy, 3), // Running total for buy orders
          };
        });
        const updatedSellOrders = sellOrders.map((order) => {
          runningTotalSell += parseFloat(order.amount);
          return {
            ...order,
            total: formatNumber(runningTotalSell, 3), // Running total for sell orders
          };
        });
        // Combine buy and sell orders, sorted by type
        const sortedOrders = [
          ...updatedBuyOrders, // Buy orders first
          ...updatedSellOrders, // Sell orders after
        ];
        // Calculate progress
        const totalAmount = sortedOrders.reduce(
          (total, order) => total + parseFloat(order.amount),
          0
        );
        const updatedOrders = sortedOrders.map((order) => ({
          ...order,
          progress:
            totalAmount === 0
              ? 0
              : (parseFloat(order.amount) / totalAmount) * 100,
        }));
        // Reverse the orders to show recent first
        setOrders(updatedOrders.reverse().slice(0, maxOrders));
      } catch (err) {
        console.error('Error fetching orders', err);
        setError(
          err instanceof Error ? err.message : 'An unknown error occurred'
        );
      } finally {
        setLoading(false);
      }
    };
    fetchOrders();
  }, []);

  if (loading) return <p>Loading...</p>;

  return (
    <div>
      {isConnected ? (
        <table className="text-center w-full">
          <thead className="text-neutral-light h-10">
            <tr>
              <th className="px-2">
                Price{' '}
                <span className="px-2 py-1 bg-teal-500 bg-opacity-25 rounded-full text-white text-sm font-[Inter] italic font-light">
                  USDC
                </span>
              </th>
              <th>
                Size{' '}
                <span className="px-2 py-1 bg-teal-500 bg-opacity-25 rounded-full text-white text-sm font-[Inter] italic font-light">
                  USDC
                </span>
              </th>
              <th>
                Total{' '}
                <span className="px-2 py-1 bg-teal-500 bg-opacity-25 rounded-full text-white text-sm font-[Inter] italic font-light">
                  USDC
                </span>
              </th>
            </tr>
          </thead>
          <tbody className="text-white leading-9">
            {orders.map((order) => (
              <tr
                key={order.orderId}
                style={{
                  position: 'relative',
                  height: '20px',
                }}
              >
                <td>{order.price}</td>
                <td>{order.amount}</td>
                <td>{order.total}</td>
                <td
                  style={{
                    position: 'absolute',
                    width: `${order.progress}%`,
                    top: '4px',
                    bottom: '4px',
                    right: 0,
                    background:
                      order.orderType === '1'
                        ? ' linear-gradient(90deg, rgba(20, 184, 166, 0.15) 100%, rgba(20, 184, 166, 0) 0)' // Progress bar color for buy orders
                        : 'rgba(255, 0, 0, 0.5)', // Progress bar color for sell orders
                  }}
                ></td>
              </tr>
            ))}
            <tr>
              <td colSpan={3} className="text-neutral-light italic">
                Price : 3800
              </td>
            </tr>
          </tbody>
        </table>
      ) : (
        <div className="mt-16">
          <button
            className="btn text-white w-full bg-warning-button py-2 rounded-2xl px-4 "
            onClick={async () => {
              // Disconnecting wallet first because sometimes when is connected but the user is not connected
              if (isConnected) {
                disconnect();
              }
              openConnectModal?.();
            }}
            disabled={isConnecting}
          >
            {isConnecting ? (
              'Connecting...'
            ) : (
              <div className="flex justify-center">
                <Icon name="warning" />
                <div className="pl-2">Connect wallet</div>
              </div>
            )}
          </button>
        </div>
      )}
    </div>
  );
};

export default Orderbook;
