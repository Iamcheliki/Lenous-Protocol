import React from 'react';
import SelectOption from '../share/SelectOption';

interface Props {
  marginType: number;
  setMarginType: (value: number) => void;
}

const MarginType: React.FC<Props> = ({ marginType, setMarginType }) => {
  const options = [
    { value: 'Cross', label: 'Cross' },
    { value: 'Isolated', label: 'Isolated' },
  ];
  const handleSelectChange = () => {};
  return <SelectOption options={options} onChange={handleSelectChange} />;
};
export default MarginType;
