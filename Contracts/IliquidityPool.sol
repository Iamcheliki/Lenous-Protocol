// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IliquidityPool {
    function getAvailableLiquidity(
        bool isBuyOrder
    ) external returns (uint256, bool);

    function tradeWithOrderBook(
        uint256 orderId,
        uint256 amount,
        bool isBuy
    ) external;
}
