// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./RedBlackTree.sol";
import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";

interface ILiquidityPool {
    function tradeWithOrderBook(
        address asset,
        uint256 orderId,
        uint256 amount,
        bool isBuyOrder,
        uint256 marketPrice
    ) external returns (uint256 filledAmount, uint256 executionPrice);
}


contract OrderBook is ReentrancyGuard, Ownable {
    using RedBlackTreeLib for RedBlackTreeLib.Tree;

    IERC20 public collateralToken;
    ILiquidityPool public liquidityPool;
    AggregatorV3Interface public priceOracle;
 

    enum MarginType {
        Cross,
        Isolated
    }
    enum OrderType {
        Market,
        Limit
    }

    struct Order {
        uint256 price;
        uint256 stopLossPrice;
        uint256 takeProfitPrice;
        uint256 amount;
        uint256 filled;
        address trader;
        bool isBuyOrder;
        OrderType orderType;
        bool isFilled;
        uint256 expiration;
        uint256 leverage;
        MarginType marginType;
        address asset; // New field for asset identifier
    }

    struct Position {
        uint256 size; // Size in the traded asset
        uint256 entryPrice; // Entry price in USDC
        bool isLong;
        uint256 leverage;
        uint256 collateral; // Amount of USDC used as collateral
        MarginType marginType;
        address asset;
    }
    //mapping(address => mapping(address => uint256)) public userBalances; // user => asset => balance
    mapping(address => uint256) public userBalances; // user => USDC balance
    mapping(address => mapping(address => mapping(uint256 => Position)))
        public positions; // user => asset => positionId => Position
    mapping(address => mapping(uint256 => Order)) public orders; // asset => orderId => Order
    mapping(address => RedBlackTreeLib.Tree) private buyOrders; // asset => buy orders tree
    mapping(address => RedBlackTreeLib.Tree) private sellOrders; // asset => sell orders tree
    mapping(address => RedBlackTreeLib.Tree) private stopLosses; // asset => stop losses tree
    mapping(address => RedBlackTreeLib.Tree) private takeProfits; // asset => take profits tree
    mapping(address => uint256) public totalLongVolume; // asset => total long volume
    mapping(address => uint256) public totalShortVolume; // asset => total short volume
    mapping(address => AggregatorV3Interface) public priceOracles; // asset => price oracle
    mapping(address => mapping(address => uint256[])) private userPositionIds; // user => asset => positionIds

    uint256 public insuranceFund;

    uint256 public liquidationThreshold = 50; // 50% as default
    uint256 public autoDeleverageThreshold;

    event Deposit(address indexed user, uint256 amount);
    event Withdraw(address indexed user, uint256 amount);

    event FundingRateApplied(
        uint256 positionId,
        int256 adjustment,
        address indexed asset
    );
    event AutoDeleveraged(
        uint256 positionId,
        uint256 reductionAmount,
        address indexed asset
    );
    event OrderPlaced(
        uint256 orderId,
        address indexed trader,
        OrderType orderType,
        uint256 price,
        uint256 amount,
        uint256 stopLossPrice,
        uint256 takeProfitPrice,
        uint256 expiration,
        address indexed asset
    );
    event OrderMatched(
        uint256 buyOrderId,
        uint256 sellOrderId,
        uint256 matchedAmount,
        uint256 price,
        address indexed asset
    );
    event PositionUpdated(
        address indexed trader,
        uint256 indexed positionId,
        uint256 size,
        uint256 entryPrice,
        bool isLong,
        uint256 leverage,
        uint256 margin,
        MarginType marginType,
        address indexed asset
    );
    event PositionLiquidated(
        address indexed trader,
        uint256 indexed positionId,
        uint256 amount,
        uint256 price,
        address indexed asset
    );
    event PositionClosed(
        address trader,
        uint256 orderId,
        uint256 closeAmount,
        uint256 executionPrice,
        int256 pnl,
        address indexed asset
    );
    event OrderCancelled(
        uint256 orderId,
        address trader,
        bool isBuyOrder,
        uint256 remainingAmount,
        address indexed asset
    );
    event OrderFilledByLiquidityPool(
        uint256 orderId,
        uint256 filledAmount,
        uint256 executionPrice,
        address asset
    );

    error UnderPricedStopLoss(uint256 stopLossPrice, uint256 currentPrice);
    error ExpirationOver(uint256 expiration, uint256 currentTime);

    constructor(
        address _collateralToken,
        address _liquidityPool,
        address _priceOracle

    )
        Ownable(msg.sender)
    {
        collateralToken = IERC20(_collateralToken);
        liquidityPool = ILiquidityPool(_liquidityPool);
         priceOracle = AggregatorV3Interface(_priceOracle);
    }


     function setPriceOracle(address asset, address oracle) external onlyOwner {
        priceOracles[asset] = AggregatorV3Interface(oracle);
    }

    function getLatestPrice(address asset) public view returns (uint256) {
        require(
            address(priceOracles[asset]) != address(0),
            "Price oracle not set for asset"
        );
        (, int256 price, , , ) = priceOracles[asset].latestRoundData();
        return uint256(price);
    }
    
    function deposit(uint256 amount) external nonReentrant {
        require(
            collateralToken.transferFrom(msg.sender, address(this), amount),
            "Transfer failed"
        );
        userBalances[msg.sender] += amount;
        emit Deposit(msg.sender, amount);
    }

    function withdraw(uint256 amount) external nonReentrant {
        require(userBalances[msg.sender] >= amount, "Insufficient balance");
        userBalances[msg.sender] -= amount;
        require(
            collateralToken.transfer(msg.sender, amount),
            "Transfer failed"
        );
        emit Withdraw(msg.sender, amount);
    }

    function assetToCollateral(
        address asset,
        uint256 assetAmount
    ) public view returns (uint256) {
        uint256 assetPrice =getLatestPrice(asset);
        return (assetAmount * assetPrice) / 1e18;
    }

    function placeLimitOrder(
        address asset,
        uint256 price,
        uint256 stopLossPrice,
        uint256 takeProfitPrice,
        uint256 amount,
        bool isBuyOrder,
        uint256 expiration,
        uint256 leverage,
        MarginType marginType
    ) external nonReentrant returns (uint256 orderId) {
        if (expiration <= block.timestamp) {
            revert ExpirationOver(expiration, block.timestamp);
        }

        uint256 requiredCollateral = (amount * price) / (leverage * 1e18);
        require(
            userBalances[msg.sender] >= requiredCollateral,
            "Insufficient balance"
        );
        userBalances[msg.sender] -= requiredCollateral;

        Order memory order = Order(
            price,
            stopLossPrice,
            takeProfitPrice,
            amount,
            0,
            msg.sender,
            isBuyOrder,
            OrderType.Limit,
            false,
            expiration,
            leverage,
            marginType,
            asset
        );
        orderId = uint256(
            keccak256(abi.encodePacked(asset, price, block.timestamp))
        );
        orders[asset][orderId] = order;

        _finalizeLimitOrder(
            asset,
            orderId,
            price,
            amount,
            isBuyOrder,
            stopLossPrice,
            takeProfitPrice,
            expiration
        );

        emit OrderPlaced(
            orderId,
            order.trader,
            OrderType.Limit,
            price,
            amount,
            stopLossPrice,
            takeProfitPrice,
            expiration,
            asset
        );

        return orderId;
    }

    function _finalizeLimitOrder(
        address asset,
        uint256 orderId,
        uint256 price,
        uint256 amount,
        bool isBuyOrder,
        uint256 stopLossPrice,
        uint256 takeProfitPrice,
        uint256 expiration
    ) private {
        if (isBuyOrder) {
            buyOrders[asset].insert(orderId);
            totalLongVolume[asset] += amount;
        } else {
            sellOrders[asset].insert(orderId);
            totalShortVolume[asset] += amount;
        }

        if (stopLossPrice > 0) {
            stopLosses[asset].insert(orderId);
        }
        if (takeProfitPrice > 0) {
            takeProfits[asset].insert(orderId);
        }

        emit OrderPlaced(
            orderId,
            msg.sender,
            OrderType.Limit,
            price,
            amount,
            stopLossPrice,
            takeProfitPrice,
            expiration,
            asset
        );

        matchOrders(asset, orderId, price, amount, isBuyOrder);
    }

    function matchOrders(
        address asset,
        uint256 orderId,
        uint256 price,
        uint256 amount,
        bool isBuyOrder
    ) internal returns (uint256 remainingAmount) {
        remainingAmount = amount;
        Order storage currentOrder = orders[asset][orderId];

        while (remainingAmount > 0) {
            uint256 oppositeOrderId;
            Order storage oppositeOrder;

            if (isBuyOrder) {
                bytes32 firstSellOrder = RedBlackTreeLib.first(
                    sellOrders[asset]
                );
                if (firstSellOrder == bytes32(0)) break;
                oppositeOrderId = RedBlackTreeLib.value(firstSellOrder);
                oppositeOrder = orders[asset][oppositeOrderId];

                if (oppositeOrder.price > price) {
                    break;
                }
            } else {
                bytes32 lastBuyOrder = RedBlackTreeLib.last(buyOrders[asset]);
                if (lastBuyOrder == bytes32(0)) break;
                oppositeOrderId = RedBlackTreeLib.value(lastBuyOrder);
                oppositeOrder = orders[asset][oppositeOrderId];

                if (oppositeOrder.price < price) {
                    break;
                }
            }

            uint256 matchAmount = min(
                oppositeOrder.amount - oppositeOrder.filled,
                remainingAmount
            );
            remainingAmount -= matchAmount;
            oppositeOrder.filled += matchAmount;
            currentOrder.filled += matchAmount;

            _updatePosition(
                currentOrder.trader,
                asset,
                orderId,
                matchAmount,
                oppositeOrder.price,
                isBuyOrder,
                currentOrder.leverage,
                currentOrder.marginType
            );
            _updatePosition(
                oppositeOrder.trader,
                asset,
                oppositeOrderId,
                matchAmount,
                oppositeOrder.price,
                !isBuyOrder,
                oppositeOrder.leverage,
                oppositeOrder.marginType
            );

            emit OrderMatched(
                isBuyOrder ? orderId : oppositeOrderId,
                isBuyOrder ? oppositeOrderId : orderId,
                matchAmount,
                oppositeOrder.price,
                asset
            );

            if (oppositeOrder.amount == oppositeOrder.filled) {
                if (isBuyOrder) {
                    sellOrders[asset].remove(oppositeOrderId);
                } else {
                    buyOrders[asset].remove(oppositeOrderId);
                }
                delete orders[asset][oppositeOrderId];
            }
        }

        if (currentOrder.filled == currentOrder.amount) {
            currentOrder.isFilled = true;
            if (isBuyOrder) {
                buyOrders[asset].remove(orderId);
            } else {
                sellOrders[asset].remove(orderId);
            }
        }

        return remainingAmount;
    }

    function getOrder(
        address asset,
        uint256 orderId
    ) external view returns (Order memory) {
        return orders[asset][orderId];
    }

    function placeMarketOrder(
        address asset,
        uint256 amount,
        bool isBuyOrder,
        uint256 leverage,
        MarginType marginType
    ) public nonReentrant returns (uint256) {
        uint256 price = getLatestPrice(asset);
        uint256 orderId = uint256(
            keccak256(abi.encodePacked(asset, price, block.timestamp))
        );

        uint256 requiredCollateral = (amount * price) / (leverage * 1e18);
        require(
            userBalances[msg.sender] >= requiredCollateral,
            "Insufficient balance"
        );
        userBalances[msg.sender] -= requiredCollateral;

        emit OrderPlaced(
            orderId,
            msg.sender,
            OrderType.Market,
            price,
            amount,
            0, // No stop loss for market orders
            0, // No take profit for market orders
            0, // No expiration for market orders
            asset
        );

        uint256 remainingAmount = amount;
        while (remainingAmount > 0) {
            bytes32 oppositeOrderNode;
            uint256 oppositeOrderId;
            Order storage oppositeOrder;

            if (isBuyOrder) {
                oppositeOrderNode = RedBlackTreeLib.first(sellOrders[asset]);
            } else {
                oppositeOrderNode = RedBlackTreeLib.last(buyOrders[asset]);
            }

            if (oppositeOrderNode == bytes32(0)) {
                break;
            }

            oppositeOrderId = RedBlackTreeLib.value(oppositeOrderNode);
            oppositeOrder = orders[asset][oppositeOrderId];

            uint256 matchAmount = min(
                oppositeOrder.amount - oppositeOrder.filled,
                remainingAmount
            );
            remainingAmount -= matchAmount;
            oppositeOrder.filled += matchAmount;

            _updatePosition(
                msg.sender,
                asset,
                orderId,
                matchAmount,
                oppositeOrder.price,
                isBuyOrder,
                leverage,
                marginType
            );
            _updatePosition(
                oppositeOrder.trader,
                asset,
                oppositeOrderId,
                matchAmount,
                oppositeOrder.price,
                !isBuyOrder,
                oppositeOrder.leverage,
                oppositeOrder.marginType
            );

            emit OrderMatched(
                isBuyOrder ? orderId : oppositeOrderId,
                isBuyOrder ? oppositeOrderId : orderId,
                matchAmount,
                oppositeOrder.price,
                asset
            );

            if (oppositeOrder.filled == oppositeOrder.amount) {
                if (isBuyOrder) {
                    sellOrders[asset].remove(oppositeOrderId);
                } else {
                    buyOrders[asset].remove(oppositeOrderId);
                }
                delete orders[asset][oppositeOrderId];
            }
        }

        if (remainingAmount > 0) {
            handleImbalance(
                asset,
                orderId,
                remainingAmount,
                isBuyOrder,
                leverage,
                marginType
            );
        }

        return orderId;
    }

    function handleImbalance(
        address asset,
        uint256 orderId,
        uint256 amount,
        bool isBuyOrder,
        uint256 leverage,
        MarginType marginType
    ) internal {
        require(address(liquidityPool) != address(0), "Liquidity pool not set");

        uint256 marketPrice = getLatestPrice(asset); // Get the latest price

        (uint256 filledAmount, uint256 executionPrice) = liquidityPool
            .tradeWithOrderBook(
                asset,
                orderId,
                amount,
                isBuyOrder,
                marketPrice
            );

        if (filledAmount > 0) {
            _updatePosition(
                msg.sender,
                asset,
                orderId,
                filledAmount,
                executionPrice,
                isBuyOrder,
                leverage,
                marginType
            );

            emit OrderFilledByLiquidityPool(
                orderId,
                filledAmount,
                executionPrice,
                asset
            );
        }
    }

    function _updatePosition(
        address trader,
        address asset,
        uint256 orderId,
        uint256 amount,
        uint256 price,
        bool isLong,
        uint256 leverage,
        MarginType marginType
    ) internal {
        uint256 positionId = orderId;
        Position storage position = positions[trader][asset][positionId];
        uint256 requiredCollateral = (amount * price) / (leverage * 1e18);

        if (position.size == 0) {
            position.size = amount;
            position.entryPrice = price;
            position.isLong = isLong;
            position.leverage = leverage;
            position.collateral = requiredCollateral;
            position.marginType = marginType;
            position.asset = asset;
            userPositionIds[trader][asset].push(positionId);
        } else {
            uint256 newSize = position.size + amount;
            position.entryPrice =
                (position.entryPrice * position.size + price * amount) /
                newSize;
            position.size = newSize;
            position.collateral += requiredCollateral;
        }

        userBalances[trader] -= requiredCollateral;

        emit PositionUpdated(
            trader,
            positionId,
            position.size,
            position.entryPrice,
            position.isLong,
            position.leverage,
            position.collateral,
            position.marginType,
            asset
        );
    }

    function setLiquidationThreshold(uint256 newThreshold) external onlyOwner {
        require(newThreshold > 0 && newThreshold <= 100, "Invalid threshold");
        liquidationThreshold = newThreshold;
    }

    function executeStopLossOrTakeProfit(
        address trader,
        address asset,
        uint256 orderId,
        uint256 executionPrice,
        bool isStopLoss
    ) external onlyOwner {
        Order storage order = orders[asset][orderId];
        require(order.trader == trader, "Order does not belong to the trader");
        require(order.amount > 0, "Order does not exist");

        Position storage position = positions[trader][asset][orderId];
        uint256 closeAmount;
        int256 pnl;

        if (position.size == 0) {
            closeAmount = order.amount;
            pnl = 0;

            uint256 refundAmount = (order.amount * order.price) /
                (order.leverage * 1e18);
            userBalances[trader] += refundAmount;
        } else {
            closeAmount = position.size;
            pnl = _calculatePnL(position, executionPrice);

            if (pnl > 0) {
                userBalances[trader] += uint256(pnl);
            } else if (pnl < 0) {
                uint256 loss = uint256(-pnl);
                if (loss > position.collateral) {
                    loss = position.collateral;
                }
                position.collateral -= loss;
            }

            userBalances[trader] += position.collateral;

            delete positions[trader][asset][orderId];

            for (
                uint256 i = 0;
                i < userPositionIds[trader][asset].length;
                i++
            ) {
                if (userPositionIds[trader][asset][i] == orderId) {
                    userPositionIds[trader][asset][i] = userPositionIds[trader][
                        asset
                    ][userPositionIds[trader][asset].length - 1];
                    userPositionIds[trader][asset].pop();
                    break;
                }
            }
        }

        if (order.isBuyOrder) {
            if (buyOrders[asset].exists(orderId)) {
                buyOrders[asset].remove(orderId);
            }
        } else {
            if (sellOrders[asset].exists(orderId)) {
                sellOrders[asset].remove(orderId);
            }
        }

        if (stopLosses[asset].exists(orderId)) {
            stopLosses[asset].remove(orderId);
        }
        if (takeProfits[asset].exists(orderId)) {
            takeProfits[asset].remove(orderId);
        }

        delete orders[asset][orderId];

        emit PositionClosed(
            trader,
            orderId,
            closeAmount,
            executionPrice,
            pnl,
            asset
        );
        emit OrderCancelled(
            orderId,
            trader,
            order.isBuyOrder,
            order.amount - order.filled,
            asset
        );
    }

    function liquidatePosition(
        address trader,
        address asset,
        uint256 positionId
    ) public onlyOwner {
        Position storage position = positions[trader][asset][positionId];
        require(position.size > 0, "Position does not exist");

        uint256 currentPrice =getLatestPrice(asset);
        int256 pnl = _calculatePnL(position, currentPrice);
        uint256 currentCollateral = position.collateral;

        if (pnl < 0) {
            currentCollateral = currentCollateral > uint256(-pnl)
                ? currentCollateral - uint256(-pnl)
                : 0;
        }

        uint256 positionValue = (position.size * currentPrice) / 1e18;
        uint256 requiredCollateral = (positionValue * liquidationThreshold) /
            100;

        if (currentCollateral < requiredCollateral) {
            uint256 liquidationAmount = position.size;
            uint256 remainingCollateral = currentCollateral;

            if (position.marginType == MarginType.Cross) {
                uint256 totalRemainingSize = 0;
                for (
                    uint256 i = 0;
                    i < userPositionIds[trader][asset].length;
                    i++
                ) {
                    uint256 otherPositionId = userPositionIds[trader][asset][i];
                    if (otherPositionId != positionId) {
                        totalRemainingSize += positions[trader][asset][
                            otherPositionId
                        ].size;
                    }
                }

                if (totalRemainingSize > 0) {
                    for (
                        uint256 i = 0;
                        i < userPositionIds[trader][asset].length;
                        i++
                    ) {
                        uint256 otherPositionId = userPositionIds[trader][
                            asset
                        ][i];
                        if (otherPositionId != positionId) {
                            Position storage otherPosition = positions[trader][
                                asset
                            ][otherPositionId];
                            uint256 collateralShare = (remainingCollateral *
                                otherPosition.size) / totalRemainingSize;
                            otherPosition.collateral += collateralShare;
                            remainingCollateral -= collateralShare;
                        }
                    }
                }
            }

            insuranceFund += remainingCollateral;

            delete positions[trader][asset][positionId];

            for (
                uint256 i = 0;
                i < userPositionIds[trader][asset].length;
                i++
            ) {
                if (userPositionIds[trader][asset][i] == positionId) {
                    userPositionIds[trader][asset][i] = userPositionIds[trader][
                        asset
                    ][userPositionIds[trader][asset].length - 1];
                    userPositionIds[trader][asset].pop();
                    break;
                }
            }

            emit PositionLiquidated(
                trader,
                positionId,
                liquidationAmount,
                currentPrice,
                asset
            );
        } else {
            revert("Position cannot be liquidated");
        }
    }

    function _calculatePnL(
        Position memory position,
        uint256 currentPrice
    ) internal pure returns (int256) {
        int256 priceDiff = int256(currentPrice) - int256(position.entryPrice);
        if (!position.isLong) {
            priceDiff = -priceDiff;
        }

        // Use a safer multiplication method
        int256 pnl = (priceDiff *
            int256(position.size) *
            int256(position.leverage)) / int256(position.entryPrice);

        // Cap the PnL to avoid overflow
        int256 maxPnl = int256(position.collateral) * 1000; // 1000x collateral as max PnL
        if (pnl > maxPnl) {
            pnl = maxPnl;
        } else if (pnl < -int256(position.collateral)) {
            pnl = -int256(position.collateral);
        }

        return pnl;
    }

    function min(uint256 a, uint256 b) internal pure returns (uint256) {
        return a < b ? a : b;
    }

    function getBuyOrdersCount(address asset) public view returns (uint256) {
        return RedBlackTreeLib.size(buyOrders[asset]);
    }

    function getSellOrdersCount(address asset) public view returns (uint256) {
        return RedBlackTreeLib.size(sellOrders[asset]);
    }


    function applyFundingRate(
        address[] calldata traders,
        address[] calldata assets,
        uint256[] calldata positionIds,
        int256[] calldata adjustments
    ) external onlyOwner {
        require(
            traders.length == assets.length &&
                assets.length == positionIds.length &&
                positionIds.length == adjustments.length,
            "Array lengths must match"
        );

        for (uint256 i = 0; i < positionIds.length; i++) {
            address trader = traders[i];
            address asset = assets[i];
            uint256 positionId = positionIds[i];
            Position storage position = positions[trader][asset][positionId];

            if (adjustments[i] > 0) {
                position.collateral += uint256(adjustments[i]);
            } else {
                uint256 adjustment = uint256(-adjustments[i]);
                if (position.collateral < adjustment) {
                    liquidatePosition(trader, asset, positionId);
                } else {
                    position.collateral -= adjustment;
                }
            }

            emit FundingRateApplied(positionId, adjustments[i], asset);
        }
    }

    function autoDeleverage(
        address[] calldata traders,
        address[] calldata assets,
        uint256[] calldata positionIds,
        uint256[] calldata reductionAmounts
    ) external onlyOwner {
        require(
            traders.length == assets.length &&
                assets.length == positionIds.length &&
                positionIds.length == reductionAmounts.length,
            "Array lengths must match"
        );

        for (uint256 i = 0; i < positionIds.length; i++) {
            address trader = traders[i];
            address asset = assets[i];
            Position storage position = positions[trader][asset][
                positionIds[i]
            ];

            require(
                position.size >= reductionAmounts[i],
                "Invalid reduction amount"
            );

            uint256 currentPrice =getLatestPrice(asset);
            int256 pnl = _calculatePnL(position, currentPrice);
            uint256 collateralReduction = (position.collateral *
                reductionAmounts[i]) / position.size;

            position.size -= reductionAmounts[i];
            position.collateral -= collateralReduction;

            if (pnl > 0) {
                uint256 profit = (uint256(pnl) * reductionAmounts[i]) /
                    position.size;
                userBalances[trader] += profit;
            }

            if (position.size == 0) {
                delete positions[trader][asset][positionIds[i]];
            }

            emit AutoDeleveraged(positionIds[i], reductionAmounts[i], asset);
        }
    }

    function setAutoDeleverageThreshold(
        uint256 newThreshold
    ) external onlyOwner {
        require(
            newThreshold > liquidationThreshold && newThreshold < 100,
            "Invalid threshold"
        );
        autoDeleverageThreshold = newThreshold;
    }

    function withdrawInsuranceFund(uint256 amount) external onlyOwner {
        require(amount <= insuranceFund, "Insufficient insurance fund");
        insuranceFund = insuranceFund - amount;
        require(collateralToken.transfer(owner(), amount), "Transfer failed");
    }

    // Then, update the getUserPositions function:
    function getUserPositions(
        address user,
        address asset
    ) external view returns (uint256[] memory, Position[] memory) {
        uint256[] memory positionIds = userPositionIds[user][asset];
        Position[] memory userPositions = new Position[](positionIds.length);

        for (uint256 i = 0; i < positionIds.length; i++) {
            userPositions[i] = positions[user][asset][positionIds[i]];
        }

        return (positionIds, userPositions);
    }

    /*   function getOrderBook(
        bool isBuyOrder
    ) external view returns (uint256[] memory, uint256[] memory) {
        RedBlackTreeLib.Tree storage tree = isBuyOrder ? buyOrders : sellOrders;
        uint256 size = tree.size();
        uint256[] memory orderIds = new uint256[](size);
        uint256[] memory prices = new uint256[](size);

        uint256 index = 0;
        bytes32 current = isBuyOrder ? buyOrders.last() : sellOrders.first();
        while (!RedBlackTreeLib.isEmpty(current)) {
            uint256 orderId = RedBlackTreeLib.value(current);
            orderIds[index] = orderId;
            prices[index] = orders[orderId].price;
            current = isBuyOrder
                ? buyOrders.prev(current)
                : sellOrders.next(current);
            index++;
        }

        return (orderIds, prices);
    }
*/

    error OrderNotFound();
    error OrderAlreadyFilled();
    error UnauthorizedCancellation();
    error PositionNotFound();
    error UnauthorizedClosing();


    function cancelOrder(address asset, uint256 orderId) external nonReentrant {
        Order storage order = orders[asset][orderId];
        if (order.amount == 0) revert OrderNotFound();
        if (order.trader != msg.sender) revert UnauthorizedCancellation();
        if (order.isFilled) revert OrderAlreadyFilled();

        uint256 remainingAmount = order.amount - order.filled;
        if (remainingAmount == 0) revert OrderAlreadyFilled();

        // Remove order from the order book
        if (order.isBuyOrder) {
            buyOrders[asset].remove(orderId);
        } else {
            sellOrders[asset].remove(orderId);
        }

        // Refund unused collateral
        uint256 refundAmount = (remainingAmount * order.price) /
            (order.leverage * 1e18);
        userBalances[msg.sender] += refundAmount;

        // Update total volume
        if (order.isBuyOrder) {
            totalLongVolume[asset] -= remainingAmount;
        } else {
            totalShortVolume[asset] -= remainingAmount;
        }

        // Remove order from storage
        delete orders[asset][orderId];

        //emit OrderCancelled(orderId, msg.sender, asset, remainingAmount);
    }

    function closePosition(
        address asset,
        uint256 positionId
    ) external nonReentrant {
        Position storage position = positions[msg.sender][asset][positionId];
        if (position.size == 0) revert PositionNotFound();

        uint256 currentPrice =  getLatestPrice(asset); 
        int256 pnl = _calculatePnL(position, currentPrice);

        // Update user balance
        if (pnl > 0) {
            userBalances[msg.sender] += uint256(pnl);
        } else if (pnl < 0) {
            uint256 loss = uint256(-pnl);
            if (loss > position.collateral) {
                loss = position.collateral;
            }
            position.collateral -= loss;
        }

        // Return remaining collateral to user
        userBalances[msg.sender] += position.collateral;

        // Update total volume
        if (position.isLong) {
            totalLongVolume[asset] -= position.size;
        } else {
            totalShortVolume[asset] -= position.size;
        }

        // Remove position from storage
        delete positions[msg.sender][asset][positionId];

        // Remove position ID from user's position list
        for (
            uint256 i = 0;
            i < userPositionIds[msg.sender][asset].length;
            i++
        ) {
            if (userPositionIds[msg.sender][asset][i] == positionId) {
                userPositionIds[msg.sender][asset][i] = userPositionIds[
                    msg.sender
                ][asset][userPositionIds[msg.sender][asset].length - 1];
                userPositionIds[msg.sender][asset].pop();
                break;
            }
        }

        //emit PositionClosed(positionId, msg.sender, asset, pnl, currentPrice);
    }

    mapping(address => uint256) public assetPrices;

    function setAssetPrice(address asset, uint256 price) external onlyOwner {
        assetPrices[asset] = price;
    }

    function getMarginLevel(
        address user,
        address asset,
        uint256 positionId
    ) public view returns (uint256) {
        Position storage position = positions[user][asset][positionId];
        require(position.size > 0, "Position does not exist");

        uint256 currentPrice = assetPrices[asset]; // Use the stored asset price
        int256 pnl = _calculatePnL(position, currentPrice);
        uint256 currentCollateral = position.collateral;

        if (pnl > 0) {
            currentCollateral = currentCollateral + uint256(pnl);
        } else if (pnl < 0 && uint256(-pnl) < currentCollateral) {
            currentCollateral = currentCollateral - uint256(-pnl);
        } else {
            currentCollateral = 0;
        }

        uint256 positionValue = (position.size * currentPrice) / 1e18;

        // Avoid division by zero
        if (positionValue == 0) {
            return 0;
        }

        return (currentCollateral * 10000) / positionValue; // Multiply by 10000 to get basis points
    }
}
