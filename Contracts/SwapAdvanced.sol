// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol";
import "@uniswap/v3-periphery/contracts/interfaces/IQuoter.sol";
import "@uniswap/v3-periphery/contracts/libraries/TransferHelper.sol";
import "@uniswap/v3-periphery/contracts/libraries/Path.sol";

contract SwapToUSDC {
    using Path for bytes;

    ISwapRouter public immutable swapRouter;
    IQuoter public immutable quoter;
    address public immutable USDC;
    address public immutable WETH;

    event SwapExecuted(address indexed tokenIn, uint256 amountIn, uint256 amountOut);
    event PriceQuote(address indexed tokenIn, uint256 amountIn, uint256 estimatedOut);

    constructor(ISwapRouter _swapRouter, IQuoter _quoter, address _USDC, address _WETH) {
        swapRouter = _swapRouter;
        quoter = _quoter;
        USDC = _USDC;
        WETH = _WETH;
    }

    function getBestSwapPath(address tokenIn, uint256 amountIn) public returns (bytes memory bestPath, uint256 bestAmountOut) {
        bytes[] memory paths = new bytes[](2);
        paths[0] = abi.encodePacked(tokenIn, uint24(3000), USDC);
        paths[1] = abi.encodePacked(tokenIn, uint24(3000), WETH, uint24(500), USDC);

        for (uint i = 0; i < paths.length; i++) {
            try quoter.quoteExactInput(paths[i], amountIn) returns (uint256 amountOut) {
                if (amountOut > bestAmountOut) {
                    bestPath = paths[i];
                    bestAmountOut = amountOut;
                }
            } catch {
                // If the quote fails, skip this path
            }
        }

        require(bestAmountOut > 0, "No valid swap path found");
        emit PriceQuote(tokenIn, amountIn, bestAmountOut);
    }

    function swapTokensForUSDC(address tokenIn, uint256 amountIn, uint256 amountOutMinimum) external returns (uint256 amountOut) {
        require(tokenIn != USDC, "Cannot swap USDC for USDC");
        TransferHelper.safeTransferFrom(tokenIn, msg.sender, address(this), amountIn);
        TransferHelper.safeApprove(tokenIn, address(swapRouter), amountIn);

        (bytes memory path, ) = getBestSwapPath(tokenIn, amountIn);

        ISwapRouter.ExactInputParams memory params = ISwapRouter.ExactInputParams({
            path: path,
            recipient: msg.sender,
            deadline: block.timestamp,
            amountIn: amountIn,
            amountOutMinimum: amountOutMinimum
        });

        amountOut = swapRouter.exactInput(params);
        require(amountOut >= amountOutMinimum, "Insufficient output amount");
        emit SwapExecuted(tokenIn, amountIn, amountOut);
        return amountOut;
    }

    function getEstimatedUSDCOutput(address tokenIn, uint256 amountIn) external returns (uint256 amountOut) {
        require(tokenIn != USDC, "Cannot swap USDC for USDC");
        (, amountOut) = getBestSwapPath(tokenIn, amountIn);
        return amountOut;
    }
}
