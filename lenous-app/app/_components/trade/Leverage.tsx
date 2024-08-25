import React, { useState } from 'react';
import Modal from 'react-modal';
interface Props {
  leverage: number;
  setLeverage: (value: number) => void;
}

const LeverageModal: React.FC<Props> = ({ leverage, setLeverage }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);

  const openModal = () => setIsModalOpen(true);
  const closeModal = () => setIsModalOpen(false);
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
        className="text-neutral-light flex block w-1/2 bg-white-bg-05 w-full px-4 py-2.5 rounded-2xl sm:text-sm"
        onClick={openModal}
      >
        Leverage
        <div className="ml-2">{leverage}X</div>
      </button>
      <Modal
        isOpen={isModalOpen}
        onRequestClose={closeModal}
        style={customStyles}
      >
        <div className="w-full text-left max-w-md p-8 bg-white bg-opacity-20 rounded-2xl backdrop-blur-md flex flex-col gap-8">
          <h2 className="text-white text-xl italic font-light leading-9">
            Target Leverage
          </h2>
          <p className="text-left text-neutral-light text-base italic font-light leading-8">
            Target Leverage Determines the amount of margin applied to your next
            order.
            <br />
            <br />
            Adjusting target Leverage will not transfer margin until a new order
            is placed.
          </p>
          <div className="w-full flex flex-col items-end gap-4">
            <div className="w-full flex  items-center gap-4">
              <input
                type="range"
                min="1"
                max="20"
                step="0.1"
                value={leverage}
                onChange={(e) => setLeverage(parseFloat(e.target.value))}
                className="w-full h-2 bg-green-linear-gradient-slider h-5 rounded-full appearance-none cursor-pointer"
              />
              <div className="text-white text-xl italic font-normal">
                {leverage.toFixed(1)}x
              </div>
            </div>
            <div className="w-full flex justify-around items-center gap-2.5">
              {['1x', '2x', '3x', '5x', '10x'].map((item) => (
                <button
                  key={item}
                  className={`h-8 px-6 rounded-full ${
                    parseFloat(item) === leverage
                      ? 'bg-gradient-to-l from-teal-500/25 to-transparent'
                      : 'border border-gray-400'
                  } flex justify-center items-center`}
                  onClick={() => setLeverage(parseFloat(item))}
                >
                  <span
                    className={`text-lg italic font-light ${
                      parseFloat(item) === leverage
                        ? 'text-teal-500'
                        : 'text-gray-400'
                    }`}
                  >
                    {item}
                  </span>
                </button>
              ))}
            </div>
          </div>
          <div className="w-full flex flex-col items-end gap-3">
            <div className="w-full h-16 px-8 py-4 bg-white bg-opacity-5 rounded-full flex justify-between items-center">
              <span className="text-gray-400 text-lg italic font-light">
                Target Leverage
              </span>
              <div className="flex items-center gap-2">
                <span className="text-gray-400 text-lg italic font-medium">
                  1x
                </span>
                <span className="w-3 h-2.5 border border-white"></span>
                <span className="text-white text-lg italic font-medium">
                  20x
                </span>
              </div>
            </div>
            <button
              className="w-full py-3 text-white px-5 bg-teal-500 bg-opacity-15 rounded-full flex justify-center items-center"
              onClick={closeModal}
            >
              Confirm Leverage
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
};

export default LeverageModal;
