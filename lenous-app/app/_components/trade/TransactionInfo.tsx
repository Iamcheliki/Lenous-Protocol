import React from 'react';
import { useAccount, useDisconnect } from 'wagmi';
import { useConnectModal } from '@rainbow-me/rainbowkit';
import Icon from '../UI/icon';

interface TransactionInfoProps {
  submitOrder: () => void;
  orderId: string | null;
  fetchOrderDetails: (orderId: string) => Promise<void>;
}

const TransactionInfo: React.FC<TransactionInfoProps> = ({
  submitOrder,
  orderId,
  fetchOrderDetails,
}) => {
  const { isConnecting, isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { disconnect } = useDisconnect();

  // Fetch order details when orderId changes
  React.useEffect(() => {
    if (orderId) {
      fetchOrderDetails(orderId);
    }
  }, [orderId, fetchOrderDetails]);

  return (
    <div>
      {isConnected ? (
        <div className="mt-8 ">
          <div className="py-4 px-2 bg-white-bg-05 rounded-xl">
            <div className="flex justify-between">
              <div className="text-neutral-light font-light italic">
                Expected Price
              </div>
              <div>-</div>
            </div>
            <div className="flex justify-between leading-9">
              <div className="text-neutral-light font-light italic">
                Position Margin
              </div>
              <div>-</div>
            </div>
            <div className="flex justify-between leading-9">
              <div className="text-neutral-light font-light italic">
                Position Leverage
              </div>
              <div>-</div>
            </div>
            <div className="flex justify-between leading-9">
              <div className="text-neutral-light font-light italic">
                Estimated Rewards
              </div>
              <div>-</div>
            </div>
          </div>
          <div></div>
          <button
            onClick={submitOrder}
            className="btn w-full bg-primary-15 text-white py-2 rounded-xl mt-4 btn-primary"
          >
            Place Order
          </button>
        </div>
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

export default TransactionInfo;
