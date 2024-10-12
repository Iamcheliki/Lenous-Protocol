
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import "./OrderBook.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./IorderBook.sol";

contract LiquidityPool is ERC20Burnable, ReentrancyGuard {
    IERC20 public tradingToken;
    uint256 public totalLiquidity;
    IorderBook public Orderbook;
    mapping(address => uint256) public balances;
    mapping(address => uint256) public rewards;
    mapping(address => uint256) public leveragedLiquidity;

    uint256 public constant MAX_LEVERAGE = 5;

    constructor(
        address _tradingTokenAddress
    ) ERC20("LiquidityProviderToken", "LPT") {
        tradingToken = IERC20(_tradingTokenAddress);
    }

    function setOrderBookAddress(address _orderBookAddress) external {
        Orderbook = IorderBook(_orderBookAddress);
    }

    function provideLiquidity(
        uint256 amount,
        uint256 leverage
    ) external nonReentrant {
        require(leverage <= MAX_LEVERAGE, "Leverage exceeds maximum allowed");
        require(
            tradingToken.transferFrom(msg.sender, address(this), amount),
            "Transfer failed"
        );
        uint256 mintAmount = calculateLPTokensToMint(amount);
        _mint(msg.sender, mintAmount);
        totalLiquidity += amount;
        balances[msg.sender] += amount;
        leveragedLiquidity[msg.sender] = amount * leverage;
    }

    function withdrawLiquidity(uint256 lpTokenAmount) external nonReentrant {
        uint256 withdrawAmount = calculateWithdrawAmount(lpTokenAmount);
        _burn(msg.sender, lpTokenAmount);
        require(
            tradingToken.transfer(msg.sender, withdrawAmount),
            "Transfer failed"
        );
        totalLiquidity -= withdrawAmount;
        balances[msg.sender] -= withdrawAmount;
        leveragedLiquidity[msg.sender] = 0;
    }

    function tradeWithOrderBook(
        uint256 orderId,
        uint256 amount
    ) external nonReentrant {
        require(
            msg.sender == address(Orderbook),
            "Unauthorized: Caller is not the Orderbook"
        );

        // Fetch order details from the OrderBook
        (uint256 orderAmount, uint256 orderPrice, bool orderIsBuy) = Orderbook
            .getOrderDetails(orderId);
        address trader = Orderbook.getTrader(orderId);

        // Determine the amount of liquidity available for the trade
        uint256 availableLiquidity = totalLiquidity;
        uint256 amountToTrade = (amount <= availableLiquidity)
            ? amount
            : availableLiquidity;

        // Calculate the trading fee
        uint256 fee = calculateTradingFee(amountToTrade);
        uint256 netAmount = amountToTrade - fee;

        // Update liquidity balances based on the trade direction
        if (orderIsBuy) {
            // If the order is a buy, the liquidity pool should sell
            require(
                balances[address(this)] >= netAmount,
                "Insufficient liquidity to sell"
            );
            require(
                tradingToken.transfer(trader, netAmount),
                "Transfer failed"
            );
            totalLiquidity -= netAmount;
        } else {
            // If the order is a sell, the liquidity pool should buy
            require(
                tradingToken.allowance(trader, address(this)) >= netAmount,
                "Insufficient allowance to buy"
            );
            require(
                tradingToken.transferFrom(trader, address(this), netAmount),
                "Transfer from failed"
            );
            totalLiquidity += netAmount;
        }

        // Notify the OrderBook that the order has been partially or fully filled
        Orderbook.updateOrderFill(orderId, netAmount);

        // Distribute the trading fee
        distributeTradingFee(fee);
    }

    function getAvailableLiquidity() public view returns (uint256) {
        return totalLiquidity;
    }

    function calculateLPTokensToMint(
        uint256 depositAmount
    ) private view returns (uint256) {
        if (totalSupply() == 0) {
            return depositAmount;
        } else {
            return (depositAmount * totalSupply()) / totalLiquidity;
        }
    }

    function calculateWithdrawAmount(
        uint256 lpTokenAmount
    ) public view returns (uint256) {
        return (lpTokenAmount * totalLiquidity) / totalSupply();
    }

    function calculateTradingFee(
        uint256 amount
    ) private pure returns (uint256) {
        return (amount * 3) / 1000; // 0.3% trading fee
    }

    function distributeTradingFee(uint256 fee) private {
        uint256 totalShares = totalSupply();
        if (totalShares > 0) {
            uint256 feePerShare = (fee * 1e18) / totalShares;
            for (uint256 i = 0; i < totalShares; i++) {
                address provider = _getProviderAtIndex(i);
                uint256 providerShares = balanceOf(provider);
                uint256 providerFee = (providerShares * feePerShare) / 1e18;
                balances[provider] += providerFee;
            }
        }
    }

    function distributeRewards() external nonReentrant {
        uint256 totalShares = totalSupply();
        if (totalShares > 0) {
            uint256 rewardAmount = tradingToken.balanceOf(address(this)) -
                totalLiquidity;
            if (rewardAmount > 0) {
                uint256 rewardPerShare = (rewardAmount * 1e18) / totalShares;
                for (uint256 i = 0; i < totalShares; i++) {
                    address provider = _getProviderAtIndex(i);
                    uint256 providerShares = balanceOf(provider);
                    uint256 providerReward = (providerShares * rewardPerShare) /
                        1e18;
                    rewards[provider] += providerReward;
                }
            }
        }
    }

    function _getProviderAtIndex(uint256 index) private pure returns (address) {
        return address(uint160(index));
    }
}
