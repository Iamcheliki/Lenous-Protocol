'use client';
import React from 'react';
import Icon from '../UI/icon';
import StopLimit from './StopLimit';
import { useState } from 'react';
import PlaceOrder from './PlaceOrder';
import OrderBook from './OrderBook';

export default function TradeMenu() {
  const [activeMenu, setActiveMenu] = useState(0);

  const menuItems = [
    {
      id: 2,
      name: 'market',
      icon: 'market',
      content: <PlaceOrder />,
    },

    {
      id: 4,
      name: 'Order Book',
      icon: 'orderBook',
      content: <OrderBook />,
    },

    {
      id: 6,
      name: 'Margin Ratio',
      icon: 'marginRatio',
      content: <div>Margin Ratio Component</div>,
    },
    {
      id: 7,
      name: 'Assets',
      icon: 'assets',
      content: <div>Assets Component</div>,
    },
    {
      id: 8,
      name: 'Help',
      icon: 'help',
      content: <div>Help Component</div>,
    },
  ];
  return (
    <>
      <div
        className={`activeMenu relative h-[538px] overflow-y-auto overflow-x-hidden ${
          activeMenu != 0 ? 'w-[400px] pt-4 p-4' : ''
        } bg-dark-gray `}
      >
        {menuItems.find((item) => item.id === activeMenu)?.content}
      </div>
      <div className="w-24 bg-light-gray py-9 flex justify-center">
        <div className="inline">
          {menuItems.map((item, index) => (
            <div
              className={`flex justify-end pointer-cursor mb-9
              `}
              key={item.id}
              onClick={() => setActiveMenu(item.id)}
            >
              {/* <div className="text-white pr-2">{item.name}</div> */}
              <Icon name={item.icon} />
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
