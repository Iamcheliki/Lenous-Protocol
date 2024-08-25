'use client';
import React, { useState } from 'react';
import PositionTable from './positions/PositionTable';
import Icon from '../UI/icon';

export default function TradeTabs() {
  const [activeTab, setActiveTab] = useState(1);
  const tabs = [
    {
      id: 1,
      label: 'positions',
      content: '',
    },
    {
      id: 2,
      label: 'History',
      content: '',
    },
    {
      id: 3,
      label: 'Strategy',
      content: '',
    },
    {
      id: 4,
      label: 'Assets',
      content: '',
    },
  ];
  return (
    <div className="py-8 container">
      <div className="flex justify-between">
        <div className="inline-flex ">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              className={`pr-20 py-2 text-lg  font-medium focus:outline-none rounded-t-3xl ${
                activeTab === tab.id ? 'text-primary' : 'text-neutral-light'
              }`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="flex">
          <button className="text-white bg-primary border py-1 px-6 mr-4  rounded-3xl">
            filter
          </button>
          <button className="text-white flex items-center border rounded-3xl  py-1 px-4 border-white ">
            search
            <span className="pl-2">
              <Icon name="search" />
            </span>
          </button>
        </div>
      </div>
      <div className=" mt-12 min-h-[350px]">
        {/* {tabs.map((tab) => ( */}
        <div>
          <PositionTable />
        </div>
        {/* ))} */}
      </div>
    </div>
  );
}
