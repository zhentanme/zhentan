/** Static fallback token metadata for BNB Chain.
 *  Used when Zerion returns missing name, symbol, or icon for a position.
 *  Keys are lowercase contract addresses. Native BNB uses the zero address key.
 */

export interface TokenFallback {
  name: string;
  symbol: string;
  iconUrl: string;
}

const TW = (checksumAddress: string) =>
  `https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/smartchain/assets/${checksumAddress}/logo.png`;

const TOKEN_FALLBACKS: Record<string, TokenFallback> = {
  // Native BNB (zero address)
  "0x0000000000000000000000000000000000000000": {
    name: "BNB",
    symbol: "BNB",
    iconUrl: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/binance/info/logo.png",
  },


  "0x71da0ba87ffbfc41aab54e3dddb980293c8a7777": {
    name: "Zhentan",
    symbol: "ZHENTAN",
    iconUrl: "https://cdn.dexscreener.com/cms/images/rOBh0EA3qVRGOAxu?width=64&height=64&fit=crop&quality=95&format=auto",
  },

    // USDC (BSC, 18 decimals)
    "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d": {
      name: "USD Coin",
      symbol: "USDC",
      iconUrl: TW("0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d"),
    },

  // USDT
  "0x55d398326f99059ff775485246999027b3197955": {
    name: "Tether USD",
    symbol: "USDT",
    iconUrl: TW("0x55d398326f99059fF775485246999027B3197955"),
  },

  // BUSD
  "0xe9e7cea3dedca5984780bafc599bd69add087d56": {
    name: "BUSD Token",
    symbol: "BUSD",
    iconUrl: TW("0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56"),
  },

  // WBNB
  "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c": {
    name: "Wrapped BNB",
    symbol: "WBNB",
    iconUrl: TW("0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c"),
  },

  // BTCB (Bitcoin BEP20)
  "0x7130d2a12b9bcbfae4f2634d864a1ee1ce3ead9c": {
    name: "Bitcoin",
    symbol: "BTCB",
    iconUrl: TW("0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c"),
  },

  // ETH (BEP20)
  "0x2170ed0880ac9a755fd29b2688956bd959f933f8": {
    name: "Ethereum",
    symbol: "ETH",
    iconUrl: TW("0x2170Ed0880ac9A755fd29B2688956BD959F933F8"),
  },

  // CAKE (PancakeSwap)
  "0x0e09fabb73bd3ade0a17ecc321fd13a19e81ce82": {
    name: "PancakeSwap Token",
    symbol: "CAKE",
    iconUrl: TW("0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82"),
  },

  // XRP (BEP20)
  "0x1d2f0da169ceb9fc7b3144628db156f3f6c60dbe": {
    name: "XRP Token",
    symbol: "XRP",
    iconUrl: TW("0x1D2F0da169ceB9fC7B3144628dB156f3F6c60dBe"),
  },

  // ADA (BEP20)
  "0x3ee2200efb3400fabb9aacf31297cbdd1d435d47": {
    name: "Cardano Token",
    symbol: "ADA",
    iconUrl: TW("0x3EE2200Efb3400fAbB9AaCf31297cBdD1d435D47"),
  },

  // DOT (BEP20)
  "0x7083609fce4d1d8dc0c979aab8c869ea2c873402": {
    name: "Polkadot Token",
    symbol: "DOT",
    iconUrl: TW("0x7083609fCE4d1d8Dc0C979AAb8c869Ea2C873402"),
  },

  // LINK (BEP20)
  "0xf8a0bf9cf54bb92f17374d9e9a321e6a111a51bd": {
    name: "ChainLink Token",
    symbol: "LINK",
    iconUrl: TW("0xF8A0BF9cF54Bb92F17374d9e9A321E6a111a51bD"),
  },

  // LTC (BEP20)
  "0x4338665cbb7b2485a8855a139b75d5e34ab0db94": {
    name: "Litecoin Token",
    symbol: "LTC",
    iconUrl: TW("0x4338665CBB7B2485A8855A139b75D5e34ab0DB94"),
  },

  // DAI (BEP20)
  "0x1af3f329e8be154074d8769d1ffa4ee058b1dbc3": {
    name: "Dai Token",
    symbol: "DAI",
    iconUrl: TW("0x1AF3F329e8BE154074D8769D1FFa4eE058B1DBc3"),
  },

  // UNI (BEP20)
  "0xbf5140a22578168fd562dccf235e5d43a02ce9b1": {
    name: "Uniswap",
    symbol: "UNI",
    iconUrl: TW("0xBf5140A22578168FD562DCcF235E5D43A02ce9B1"),
  },
};

/** Look up static fallback metadata for a token by contract address.
 *  Returns undefined if no fallback is registered.
 */
export function getTokenFallback(address: string | null | undefined): TokenFallback | undefined {
  if (!address) return undefined;
  return TOKEN_FALLBACKS[address.toLowerCase()];
}
