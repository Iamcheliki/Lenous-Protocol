import React, { useState } from 'react';
import Modal from 'react-modal';

interface Props {
  profit: string;
  setProfit: (value: string) => void;
  stopLoss: string;
  setStopLoss: (value: string) => void;
}

const ProfitAndStop: React.FC<Props> = ({
  profit,
  setProfit,
  stopLoss,
  setStopLoss,
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);

  const openModal = () => setIsModalOpen(true);
  const closeModal = () => setIsModalOpen(false);

  const handleProfitChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setProfit(e.target.value);
  };

  const handleStopLossChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setStopLoss(e.target.value);
  };

  const customStyles = {
    content: {
      top: '50%',
      left: '50%',
      right: 'auto',
      bottom: 'auto',
      marginRight: '-50%',
      transform: 'translate(-50%, -50%)',
      padding: 0,
      height: '650px',
      background: 'unset',
      border: 'none',
      overflowY: 'hidden',
    },
    overlay: {
      background: '#00000066',
      overflow: 'auto',
      zIndex: '20',
    },
  };

  return (
    <>
      <button
        className="text-white justify-center text-lg flex block w-full bg-white-bg-05 px-4 py-2.5 rounded-2xl"
        onClick={openModal}
      >
        Take Profit & Stop Loss
      </button>
      <Modal
        isOpen={isModalOpen}
        onRequestClose={closeModal}
        style={customStyles}
      >
        <div className="w-full h-full overflow-y-auto max-w-[600px] p-8 bg-white/20 rounded-2xl backdrop-blur-lg flex flex-col items-center gap-8">
          <div className="w-full flex flex-col items-start gap-8">
            <div className="text-teal-500 text-lg font-poppins italic font-semibold leading-[39px]">
              Take-Profit
            </div>
            <div className="w-full flex flex-col items-start gap-8">
              <div className="w-full flex flex-col items-center gap-3">
                <div className="w-full flex items-center">
                  <div className="text-white font-poppins italic font-light leading-[30px]">
                    Stop Price
                  </div>
                </div>
                <div className="w-full flex flex-col items-start gap-4">
                  <div className="w-full px-4 py-2 bg-white/5 rounded-2xl flex items-center gap-7">
                    <div className="text-right text-gray-400 text-lg font-poppins italic w-full flex font-light">
                      <input
                        type="text"
                        placeholder="0.00"
                        className="grow bg-transparent text-white"
                        value={profit}
                        onChange={handleProfitChange}
                      />
                      USDT
                    </div>
                  </div>
                  <div className="w-full flex items-center gap-3">
                    <div className="flex-1 px-4 py-1 bg-teal-500/25 rounded-xl gap-2">
                      <div className="text-teal-500 font-inter italic text-center font-medium uppercase">
                        Mark Price
                      </div>
                    </div>
                    <div className="flex-1 px-4 py-1 border border-gray-400 rounded-xl gap-2">
                      <div className="text-gray-400 font-inter italic text-center font-light uppercase">
                        Latest Price
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="w-full h-[108px] flex flex-col items-start gap-3">
                <div className="w-full text-teal-500 font-poppins italic font-light leading-[31.5px]">
                  When{' '}
                  <span className="text-gray-400">the Mark Price reaches </span>
                  <span className="text-white">--</span>{' '}
                  <span className="text-gray-400">
                    {' '}
                    Market orders will be triggered and all positions will be
                    systematically liquidated at the best price
                  </span>
                </div>
                <div className="w-full text-teal-500 font-poppins italic font-bold leading-[31.5px]">
                  EST. <span className="text-gray-400">CML. PNL: </span>
                  <span className="text-white">--</span>{' '}
                  <span className="text-gray-400">USDT</span>
                </div>
              </div>
            </div>
          </div>
          {/* Stop-Loss */}
          <div className="w-full flex flex-col items-start gap-8">
            <div className="text-red text-lg font-poppins italic font-semibold leading-[39px]">
              Stop-Loss
            </div>
            <div className="w-full flex flex-col items-start gap-8">
              <div className="w-full flex flex-col items-center gap-3">
                <div className="w-full flex items-center">
                  <div className="text-white font-poppins italic font-light leading-[30px]">
                    Stop Price
                  </div>
                </div>
                <div className="w-full flex flex-col items-start gap-4">
                  <div className="w-full px-4 py-2 bg-white/5 rounded-2xl flex items-center gap-7">
                    <div className="text-right text-gray-400 text-lg font-poppins italic w-full flex font-light">
                      <input
                        type="text"
                        placeholder="0.00"
                        className="grow bg-transparent text-white"
                        value={stopLoss}
                        onChange={handleStopLossChange}
                      />
                      USDT
                    </div>
                  </div>
                  <div className="w-full flex items-center gap-3">
                    <div className="flex-1 px-4 py-1 bg-teal-500/25 rounded-xl gap-2">
                      <div className="text-teal-500 font-inter italic text-center font-medium uppercase">
                        Mark Price
                      </div>
                    </div>
                    <div className="flex-1 px-4 py-1 border border-gray-400 rounded-xl gap-2">
                      <div className="text-gray-400 font-inter italic text-center font-light uppercase">
                        Latest Price
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="w-full h-[108px] flex flex-col items-start gap-3">
                <div className="w-full text-teal-500 font-poppins italic font-light leading-[31.5px]">
                  When{' '}
                  <span className="text-gray-400">the Mark Price reaches </span>
                  <span className="text-white">--</span>{' '}
                  <span className="text-gray-400">
                    {' '}
                    Market orders will be triggered and all positions will be
                    systematically liquidated at the best price
                  </span>
                </div>
                <div className="w-full text-teal-500 font-poppins italic font-bold leading-[31.5px]">
                  EST. <span className="text-gray-400">CML. PNL: </span>
                  <span className="text-white">--</span>{' '}
                  <span className="text-gray-400">USDT</span>
                </div>
              </div>
            </div>
          </div>
          <div className="w-full px-5 bg-teal-500/15 rounded-lg flex items-center justify-center">
            <div
              className="text-white text-lg font-poppins italic font-normal leading-[39px]"
              onClick={closeModal}
            >
              Confirm
            </div>
          </div>
        </div>
      </Modal>
    </>
  );
};

export default ProfitAndStop;
