import React from 'react';
import SelectOption from '../share/SelectOption';

interface Props {
  hasTime: boolean;
  setHasTime: (value: boolean) => void;
}

const TimeInfForce: React.FC<Props> = ({ setHasTime, hasTime }) => {
  const options = [
    { value: '1', label: 'Good Til Time' },
    { value: '2', label: 'Immediate Or Cancel' },
  ];

  const handleSelectChange = (value: string) => {
    if (value === '1') {
      setHasTime(true);
    } else {
      setHasTime(false);
    }
  };

  return (
    <div>
      <SelectOption
        options={options}
        onChange={handleSelectChange}
        label={'Time in Force'}
      />
    </div>
  );
};

export default TimeInfForce;
