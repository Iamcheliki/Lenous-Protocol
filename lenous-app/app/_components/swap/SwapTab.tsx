'use client';
import React, { useState, useEffect, ChangeEvent } from 'react';
import { tokenList } from '@/app/_libs/utils/constants/TokenList';
import SwapInput from './SwapInput';
import ModalTokensList from './ModalTokensList';
import SwapButton from './SwapButton';
import Icon from '../UI/icon';
import JSBI from 'jsbi';
import {
  Token,
  CurrencyAmount,
  TradeType,
  Percent,
  ChainId,
} from '@uniswap/sdk-core';
import {
  Pool,
  Route,
  Trade,
  FeeAmount,
  SwapQuoter,
  SwapRouter,
  SwapOptions,
} from '@uniswap/v3-sdk';
import { ethers } from 'ethers';
import { useEthersProvider, useEthersSigner } from '@/app/_libs/utils/ethers';
import { useAccount } from 'wagmi';
import Quoter from '@uniswap/v3-periphery/artifacts/contracts/lens/Quoter.sol/Quoter.json';
import IUniswapV3PoolABI from '@uniswap/v3-core/artifacts/contracts/interfaces/IUniswapV3Pool.sol/IUniswapV3Pool.json';

const SwapTab = () => {
  const [tokenOne, setTokenOne] = useState(tokenList[0]);
  const [tokenTwo, setTokenTwo] = useState(tokenList[1]);
  const [tokenOneAmount, setTokenOneAmount] = useState<number | string>('');
  const [tokenTwoAmount, setTokenTwoAmount] = useState<number | string>('');
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [changeToken, setChangeToken] = useState<number>(1);
  const [prices, setPrices] = useState<any>({});
  const { address } = useAccount();
  const provider = useEthersProvider();
  const signer = useEthersSigner();
  // const chainId = 137; // Polygon mainnet chain ID

  useEffect(() => {
    fetchPrices();

    const ws = new WebSocket(
      'wss://ws.coincap.io/prices?assets=' + tokenOne.id + ',' + tokenTwo.id
    );

    ws.onopen = () => {
      console.log('WebSocket connected');
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      setPrices((prevPrices: any) => {
        const updatedPrices = { ...prevPrices };

        if (data[tokenOne.id]) {
          updatedPrices.tokenOne = parseFloat(data[tokenOne.id]).toFixed(4);
        }

        if (data[tokenTwo.id]) {
          updatedPrices.tokenTwo = parseFloat(data[tokenTwo.id]).toFixed(4);
        }

        updatedPrices.ratio =
          parseFloat(updatedPrices.tokenOne) /
          parseFloat(updatedPrices.tokenTwo);

        return updatedPrices;
      });
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    ws.onclose = () => {
      console.log('WebSocket connection closed');
    };

    return () => {
      ws.close();
    };
  }, [tokenOne, tokenTwo]);

  useEffect(() => {
    if (
      tokenOneAmount !== '' &&
      prices &&
      prices.ratio !== undefined &&
      parseFloat(prices.ratio) !== 0
    ) {
      const amountNumber = parseFloat(tokenOneAmount as string);
      setTokenTwoAmount(
        (amountNumber * parseFloat(prices.ratio)).toFixed(6).toString()
      );
    } else {
      setTokenTwoAmount('');
    }
  }, [tokenOneAmount, prices, tokenOne]);

  const fetchPrices = async () => {
    try {
      const [TokenOneRes, TokenTwoRes] = await Promise.all([
        fetch(`https://api.coincap.io/v2/assets/${tokenOne.id}`),
        fetch(`https://api.coincap.io/v2/assets/${tokenTwo.id}`),
      ]);

      const dataOne = await TokenOneRes.json();
      const tokenOnePrice = parseFloat(dataOne.data.priceUsd).toFixed(4);

      const dataTwo = await TokenTwoRes.json();
      const tokenTwoPrice = parseFloat(dataTwo.data.priceUsd).toFixed(4);

      if (parseFloat(tokenTwoPrice) !== 0) {
        const usdPrices = {
          tokenOne: tokenOnePrice,
          tokenTwo: tokenTwoPrice,
          ratio: parseFloat(tokenOnePrice) / parseFloat(tokenTwoPrice),
        };

        setPrices(usdPrices);
      } else {
        console.warn('TokenTwo price is zero, skipping ratio calculation');
      }
    } catch (error) {
      console.error('Error fetching token prices:', error);
    }
  };

  const onChangeTokenInput = (e: ChangeEvent<HTMLInputElement>) => {
    let amount = e.target.value;
    const re = /^[0-9]*\.?[0-9]*$/;

    if (amount === '' || re.test(amount)) {
      setTokenOneAmount(amount);
    }
  };

  const changeSwapToken = (assetNumber: number) => {
    setIsOpen(true);
    setChangeToken(assetNumber);
  };

  const modifyToken = (i: number) => {
    clearTokenInput();
    if (changeToken === 1) {
      setTokenOne(tokenList[i]);
    } else {
      setTokenTwo(tokenList[i]);
    }
    setIsOpen(false);
  };

  const switchTokens = () => {
    clearTokenInput();
    const tempToken = tokenOne;
    setTokenOne(tokenTwo);
    setTokenTwo(tempToken);
  };

  const clearTokenInput = () => {
    setTokenOneAmount('');
    setTokenTwoAmount('');
  };

  const getPoolAddress = async (tokenA: Token, tokenB: Token) => {
    const poolAddress = Pool.getAddress(tokenA, tokenB, FeeAmount.MEDIUM);
    console.log(poolAddress);
    return poolAddress;
  };
  function fromReadableAmount(
    amount: number,
    decimals: number
  ): ethers.BigNumber {
    return ethers.utils.parseUnits(amount.toString(), decimals);
  }
  const executeSwap = async () => {
    if (!signer || !provider) {
      console.error('Signer or provider is not available');
      return;
    }
    console.log(address);

    const tokenA = new Token(
      ChainId.MAINNET,
      '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
      18,
      'WETH',
      'Wrapped Ether'
    );

    const tokenB = new Token(
      ChainId.MAINNET,
      '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
      6,
      'USDC',
      'USD//C'
    );
    const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
    const poolAddress = await getPoolAddress(tokenA, tokenB);

    if (!poolAddress || poolAddress === ZERO_ADDRESS) {
      console.error('No pool found for the token pair');
      return;
    }
    console.log(IUniswapV3PoolABI.abi);
    console.log('Pool Address:', poolAddress);
    const poolContract = new ethers.Contract(
      poolAddress,
      IUniswapV3PoolABI.abi,
      provider
    );

    // Fetch slot0 data
    const [token0, token1, liquidity, slot0, fee] = await Promise.all([
      poolContract.token0(),
      poolContract.token1(),
      poolContract.liquidity(),
      poolContract.slot0(),
      poolContract.fee(),
    ]);
    const pool = new Pool(
      tokenA,
      tokenB,
      FeeAmount.MEDIUM,
      slot0[0].toString(),
      liquidity.toString(),
      slot0[1]
    );

    const route = new Route([pool], tokenA, tokenB);
    console.log(route);
    const QUOTER_CONTRACT_ADDRESS =
      '0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6';
    const quoterContract = new ethers.Contract(
      QUOTER_CONTRACT_ADDRESS,
      Quoter.abi,
      provider
    );

    const quotedAmountOut =
      await quoterContract.callStatic.quoteExactInputSingle(
        token0,
        token1,
        fee,
        fromReadableAmount(1, 18).toString(),
        0
      );
    console.log(quotedAmountOut);

    const options: SwapOptions = {
      slippageTolerance: new Percent(50, 10_000), // 50 bips, or 0.50%
      deadline: Math.floor(Date.now() / 1000) + 60 * 20, // 20 minutes from the current Unix time
      recipient: address!,
    };

    const uncheckedTrade = Trade.createUncheckedTrade({
      route: route,
      inputAmount: CurrencyAmount.fromRawAmount(
        tokenA,
        fromReadableAmount(1, 18).toString()
      ),
      outputAmount: CurrencyAmount.fromRawAmount(
        tokenB,
        JSBI.BigInt(quotedAmountOut)
      ),
      tradeType: TradeType.EXACT_INPUT,
    });
    console.log(uncheckedTrade);
    const methodParameters = SwapRouter.swapCallParameters(
      [uncheckedTrade],
      options
    );
    console.log(methodParameters);

    const V3_SWAP_ROUTER_ADDRESS = '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45';
    const MAX_FEE_PER_GAS = '100000000000';
    const MAX_PRIORITY_FEE_PER_GAS = '100000000000';

    const tx = {
      data: methodParameters.calldata,
      to: V3_SWAP_ROUTER_ADDRESS,
      value: methodParameters.value,
      from: address,
      maxFeePerGas: MAX_FEE_PER_GAS,
      maxPriorityFeePerGas: MAX_PRIORITY_FEE_PER_GAS,
    };

    try {
      const txResponse = await signer.sendTransaction(tx);
      await txResponse.wait();
      console.log('Transaction completed:', txResponse);
    } catch (error) {
      console.error('Error executing swap:', error);
    }
  };
  return (
    <div className="p-8">
      <SwapInput
        token={tokenOne}
        tokenWraptitle="You pay"
        tokenAmount={tokenOneAmount}
        clearAction={clearTokenInput}
        onChange={onChangeTokenInput}
        disable={false}
        changeToken={() => changeSwapToken(1)}
        tokenPrice={prices.tokenOne}
      />
      <div className="switchTokens flex justify-center" onClick={switchTokens}>
        <div className="border border-neutral-light p-2 rounded-full -mt-2">
          <Icon name="switchToken" />
        </div>
      </div>
      <SwapInput
        token={tokenTwo}
        tokenWraptitle="You receive"
        tokenAmount={tokenTwoAmount}
        clearAction={clearTokenInput}
        disable={true}
        changeToken={() => changeSwapToken(2)}
        tokenPrice={prices.tokenTwo}
      />
      <ModalTokensList
        isOpen={isOpen}
        modifyToken={modifyToken}
        closeModal={() => setIsOpen(false)}
      />
      <SwapButton executeSwap={executeSwap} />
    </div>
  );
};

export default SwapTab;
