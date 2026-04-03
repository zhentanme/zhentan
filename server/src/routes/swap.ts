import { Router, Request, Response } from "express";

const BSC_CHAIN_ID = 56;
const BSC_LIFI_KEY = "BSC";
const LIFI_HEADERS = () => ({
  "Content-Type": "application/json",
  "x-lifi-api-key": process.env.LIFI_API_KEY || "",
});

// ─── LiFi response shapes ────────────────────────────────────────────────────

interface LiFiToken {
  address: string;
  chainId: number;
  symbol: string;
  decimals: number;
  name: string;
  coinKey: string;
  logoURI: string;
  priceUSD: string;
}

interface LiFiGasCost {
  type: string;
  price: string;
  estimate: string;
  limit: string;
  amount: string;
  amountUSD: string;
  token: LiFiToken;
}

interface LiFiFeeCost {
  name: string;
  description: string;
  percentage: string;
  token: LiFiToken;
  amount: string;
  amountUSD: string;
  included: boolean;
}

interface LiFiStep {
  id: string;
  type: string;
  tool: string;
  action: {
    fromChainId: number;
    fromAmount: string;
    fromToken: LiFiToken;
    toChainId: number;
    toToken: LiFiToken;
    fromAddress: string;
    toAddress: string;
    slippage: number;
  };
  estimate: {
    tool: string;
    fromAmount: string;
    toAmount: string;
    toAmountMin: string;
    approvalAddress: string;
    executionDuration: number;
    feeCosts: LiFiFeeCost[];
    gasCosts: LiFiGasCost[];
    data?: { bid?: { sendingChainTxManagerAddress: string; encryptedCallData: string } };
  };
  includedSteps: LiFiStep[];
  toolDetails: { key: string; name: string; logoURI: string };
  integrator: string;
  transactionRequest?: {
    value: string;
    to: string;
    data: string;
    chainId: number;
    gasPrice: string;
    gasLimit: string;
    from: string;
  };
}

interface LiFiQuote {
  tool: string;
  toolDetails: { key: string; name: string; logoURI: string };
  action: {
    fromToken: LiFiToken;
    fromAmount: string;
    toToken: LiFiToken;
    fromChainId: number;
    toChainId: number;
    fromAddress: string;
    toAddress: string;
  };
  estimate: {
    approvalAddress: string;
    toAmountMin: string;
    toAmount: string;
    fromAmount: string;
    feeCosts: LiFiFeeCost[];
    gasCosts: LiFiGasCost[];
    executionDuration: number;
    fromAmountUSD: string;
    toAmountUSD: string;
  };
  includedSteps: LiFiStep[];
  transactionRequest: {
    value: string;
    to: string;
    data: string;
    chainId: number;
    gasPrice: string;
    gasLimit: string;
    from: string;
  };
}

interface LiFiRoute {
  id: string;
  fromChainId: number;
  fromAmountUSD: string;
  fromAmount: string;
  fromToken: LiFiToken;
  toChainId: number;
  toAmountUSD: string;
  toAmount: string;
  toAmountMin: string;
  toToken: LiFiToken;
  gasCostUSD: string;
  steps: LiFiStep[];
}

// ─── Normalised quote shape returned to the client ──────────────────────────

interface NormalisedQuote {
  buyAmount: string;
  buyAmountUSD: string;
  sellAmountUSD: string;
  transaction: {
    to: string;
    value: string;
    data: string;
    gasLimit: string;
    gasPrice: string;
    chainId: number;
  };
  approvalAddress: string;
  tool: { key: string; name: string; logoURI: string };
}

// ─── LiFi helpers ────────────────────────────────────────────────────────────

/** Direct single quote via /v1/quote */
async function fetchDirectQuote(
  fromToken: string,
  toToken: string,
  amount: string,
  fromAddress: string
): Promise<NormalisedQuote | null> {
  const params = new URLSearchParams({
    fromChain: BSC_LIFI_KEY,
    toChain: BSC_LIFI_KEY,
    fromToken,
    toToken,
    fromAddress,
    toAddress: fromAddress,
    fromAmount: amount,
    order: "CHEAPEST",
    slippage: "0.05",
    integrator: "zhentan",
  });

  const res = await fetch(`https://li.quest/v1/quote?${params.toString()}`, {
    headers: LIFI_HEADERS(),
  });

  if (!res.ok) return null;

  const data = (await res.json()) as LiFiQuote;
  if (!data.transactionRequest) return null;

  return {
    buyAmount: data.estimate.toAmount,
    buyAmountUSD: data.estimate.toAmountUSD,
    sellAmountUSD: data.estimate.fromAmountUSD,
    transaction: {
      to: data.transactionRequest.to,
      value: data.transactionRequest.value,
      data: data.transactionRequest.data,
      gasLimit: data.transactionRequest.gasLimit,
      gasPrice: data.transactionRequest.gasPrice,
      chainId: data.transactionRequest.chainId,
    },
    approvalAddress: data.estimate.approvalAddress,
    tool: data.toolDetails,
  };
}

/** Best single-step route via /v1/advanced/routes */
async function fetchBestRoute(
  fromToken: string,
  toToken: string,
  amount: string,
  fromAddress: string
): Promise<{ quote: NormalisedQuote; step: LiFiStep } | null> {
  const res = await fetch("https://li.quest/v1/advanced/routes", {
    method: "POST",
    headers: LIFI_HEADERS(),
    body: JSON.stringify({
      fromChainId: BSC_CHAIN_ID,
      toChainId: BSC_CHAIN_ID,
      fromTokenAddress: fromToken,
      toTokenAddress: toToken,
      fromAmount: amount,
      fromAddress,
      toAddress: fromAddress,
      order: "CHEAPEST",
      slippage: 0.05,
      integrator: "zhentan",
    }),
  });

  if (!res.ok) return null;

  const data = await res.json();
  const routes: LiFiRoute[] = data.routes ?? [];
  if (!routes.length) return null;

  const singleStep = routes.filter((r) => r.steps.length === 1);
  const pool = singleStep.length ? singleStep : routes;

  const best = pool.reduce((a, b) =>
    BigInt(b.toAmount) > BigInt(a.toAmount) ? b : a
  );

  return {
    quote: {
      buyAmount: best.toAmount,
      buyAmountUSD: best.toAmountUSD,
      sellAmountUSD: best.fromAmountUSD,
      transaction: { to: "", value: "0x0", data: "0x", gasLimit: "0", gasPrice: "0", chainId: BSC_CHAIN_ID },
      approvalAddress: best.steps[0].estimate.approvalAddress,
      tool: best.steps[0].toolDetails,
    },
    step: best.steps[0],
  };
}

/** Resolve executable transaction for a route step via /v1/advanced/stepTransaction */
async function fetchStepTransaction(step: LiFiStep): Promise<NormalisedQuote | null> {
  const res = await fetch("https://li.quest/v1/advanced/stepTransaction", {
    method: "POST",
    headers: LIFI_HEADERS(),
    body: JSON.stringify({
      id: step.id,
      type: step.type,
      tool: step.tool,
      action: step.action,
      estimate: step.estimate,
      includedSteps: step.includedSteps,
      toolDetails: step.toolDetails,
      integrator: step.integrator,
    }),
  });

  if (!res.ok) return null;

  const data = (await res.json()) as LiFiQuote;
  if (!data.transactionRequest) return null;

  return {
    buyAmount: data.estimate.toAmount,
    buyAmountUSD: data.estimate.toAmountUSD,
    sellAmountUSD: data.estimate.fromAmountUSD,
    transaction: {
      to: data.transactionRequest.to,
      value: data.transactionRequest.value,
      data: data.transactionRequest.data,
      gasLimit: data.transactionRequest.gasLimit,
      gasPrice: data.transactionRequest.gasPrice,
      chainId: data.transactionRequest.chainId,
    },
    approvalAddress: data.estimate.approvalAddress,
    tool: data.toolDetails,
  };
}

// ─── Router ──────────────────────────────────────────────────────────────────

export function createSwapRouter(): Router {
  const router = Router();

  router.get("/", async (req: Request, res: Response) => {
    const { fromToken, toToken, amount, fromAddress } = req.query as Record<string, string>;

    if (!fromToken || !toToken || !amount || !fromAddress) {
      res.status(400).json({
        error: "Missing required parameters: fromToken, toToken, amount, fromAddress",
      });
      return;
    }

    try {
      // Run direct quote and advanced routes in parallel (mirrors Brewit bridge route)
      const [directResult, routeResult] = await Promise.all([
        fetchDirectQuote(fromToken, toToken, amount, fromAddress).catch(() => null),
        fetchBestRoute(fromToken, toToken, amount, fromAddress).catch(() => null),
      ]);

      if (!directResult && !routeResult) {
        res.status(400).json({ error: "No swap routes found for this token pair" });
        return;
      }

      let finalQuote: NormalisedQuote | null = null;

      if (!directResult && routeResult) {
        // Only advanced route available — resolve its transaction
        console.log("Swap: using advanced route (direct quote unavailable)");
        finalQuote = await fetchStepTransaction(routeResult.step);
        if (!finalQuote) finalQuote = null;
      } else if (directResult && !routeResult) {
        // Only direct quote available
        console.log("Swap: using direct quote (advanced route unavailable)");
        finalQuote = directResult;
      } else if (directResult && routeResult) {
        // Both available — pick the one with more output tokens
        if (BigInt(routeResult.quote.buyAmount) > BigInt(directResult.buyAmount)) {
          console.log("Swap: advanced route gives better output, resolving transaction");
          const stepTx = await fetchStepTransaction(routeResult.step);
          finalQuote = stepTx ?? directResult; // fall back to direct if step tx fails
        } else {
          console.log("Swap: direct quote gives better or equal output");
          finalQuote = directResult;
        }
      }

      if (!finalQuote) {
        res.status(400).json({ error: "Failed to resolve executable transaction for swap" });
        return;
      }

      res.json({ status: true, quote: finalQuote });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Internal server error";
      console.error("Swap quote error:", message);
      res.status(500).json({ error: message });
    }
  });

  return router;
}
