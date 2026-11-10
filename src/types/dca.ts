export type IntentToken = {
  assetId: string;
  decimals: number;
  blockchain: string;
  symbol: string;
  price?: string;
  contractAddress?: string | null;
};

export type Schedule = {
  id: string;
  label: string;
  amount: string;
  originAsset: string;
  originSymbol: string;
  originChain: string;
  targetAsset: string;
  targetSymbol: string;
  recipient: string;
  refundTo: string;
  interval: "daily" | "weekly" | "monthly";
  slippage: number;
  nextRun: string;
  active: boolean;
  createdAt: string;
};

export type Purchase = {
  id: string;
  scheduleId?: string;
  status: string;
  amountIn: string;
  amountOut: string;
  inputSymbol: string;
  outputSymbol: string;
  date: string;
  depositAddress?: string;
  depositMemo?: string | null;
  explorerUrl?: string;
};

export type QuoteResponse = {
  correlationId?: string;
  quote?: {
    depositAddress?: string;
    depositMemo?: string | null;
    amountIn?: string;
    amountInFormatted?: string;
    amountInUsd?: string;
    amountOut?: string;
    amountOutFormatted?: string;
    amountOutUsd?: string;
    minAmountOut?: string;
    timeEstimate?: number;
    deadline?: string;
    timeWhenInactive?: string;
  };
  [key: string]: unknown;
};
