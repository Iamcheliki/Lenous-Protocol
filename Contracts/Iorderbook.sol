// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import "./OrderBook.sol";

interface IorderBook {
    function getOrderDetails(
        uint256 orderId
    ) external view returns (uint256, uint256, bool);

    function getTrader(uint256 orderId) external view returns (address);

    function updateOrderFill(uint256 orderId, uint256 amountFilled) external;
}
