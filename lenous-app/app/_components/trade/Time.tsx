import React, { useState } from 'react';
import SelectOption from '../share/SelectOption';

interface TimeProps {
  setTime: (time: { type: string; amount: number }) => void;
}

export default function Time({ setTime }: TimeProps) {
  const [amount, setAmount] = useState<number>(28);
  const [timeType, setTimeType] = useState<string>('Mins');

  const options = [
    { value: 'Days', label: 'Days' },
    { value: 'Mins', label: 'Mins' },
    { value: 'Hours', label: 'Hours' },
    { value: 'Weeks', label: 'Weeks' },
  ];

  const handleSelectChange = (value: string) => {
    setTimeType(value);
    setTime({ type: value, amount });
  };

  const handleAmountChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newAmount = parseInt(event.target.value, 10);
    setAmount(newAmount);
    setTime({ type: timeType, amount: newAmount });
  };

  return (
    <div className="flex bg-white-bg-05 py-2 px-4 rounded-2xl">
      <div>
        <div className="text-neutral-light font-extralight italic">Time</div>
        <input
          type="number"
          value={amount}
          onChange={handleAmountChange}
          className="inline-block w-16 bg-transparent text-white"
        />
      </div>
      <SelectOption options={options} onChange={handleSelectChange} />
    </div>
  );
}
