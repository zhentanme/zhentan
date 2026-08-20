# Onchain Activity — BNB Chain

All transactions below are ERC-4337 UserOperations submitted to EntryPoint v0.7, gasless via Pimlico paymaster. Each was co-signed by the Zhentan NanoBot/Hermes agent after passing through the screening pipeline.

---

## Smart Accounts

| # | Safe Address | Explorer |
|---|-------------|---------|
| 1 | `0xeb35a6F9ABC12e33c80D5B1667875cD4e7E79b59` | [Safe.global](https://app.safe.global/home?safe=bnb:0xeb35a6F9ABC12e33c80D5B1667875cD4e7E79b59) · [BscScan](https://bscscan.com/address/0xeb35a6F9ABC12e33c80D5B1667875cD4e7E79b59) |
| 2 | `0x24330761B37081e02022B88C3f652fb0F8030D69` | [Safe.global](https://app.safe.global/home?safe=bnb:0x24330761B37081e02022B88C3f652fb0F8030D69) . [BscScan](https://bscscan.com/address/0x24330761B37081e02022B88C3f652fb0F8030D69) |

---

## Transactions

### Tx 1 — PancakeSwap WBNB → CAKE swap (agent-reviewed, DApp via WalletConnect)

| Field | Value |
|-------|-------|
| **Hash** | [`0x98fea4...c9d3`](https://bscscan.com/tx/0x98fea481dc55d8f59d26d5b15000e279e332a348d186619e29d6209ab5b3c9d3) |
| **Safe** | `0xeb35a6F9ABC12e33c80D5B1667875cD4e7E79b59` |
| **Date** | 2026-02-18 |
| **Action** | Swapped ~0.0016 WBNB → ~0.79 CAKE via PancakeSwap v3 |
| **Origin** | WalletConnect DApp session (PancakeSwap) |
| **Verdict** | REVIEW — agent ran deep analysis, sent Telegram notification, user approved |
| **Execution** | Agent signed 2-of-2, submitted UserOperation to EntryPoint v0.7 |
| **Gas** | Sponsored by Pimlico paymaster (gasless) |
| **Block** | [81,936,971](https://bscscan.com/block/81936971) |

---

### Tx 2 — Token transfer reviewed by agent

| Field | Value |
|-------|-------|
| **Hash** | [`0x971ffb...333d`](https://bscscan.com/tx/0x971ffb1ce92b1c98f891f61d520801bafbae8ec87965e5fda33b844186fb333d) |
| **Safe** | `0x24330761B37081e02022B88C3f652fb0F8030D69` |
| **Date** | 2026-02-17 |
| **Action** | Token transfer from Safe, routed through PancakeSwap v3 |
| **Origin** | Zhentan Send UI |
| **Verdict** | REVIEW — agent ran deep analysis, sent Telegram notification, user approved |
| **Execution** | Agent signed 2-of-2, submitted UserOperation to EntryPoint v0.7 |
| **Gas** | Sponsored by Pimlico paymaster (gasless) |
| **Block** | [81,786,132](https://bscscan.com/block/81786132) |

---

## Infrastructure

| Contract | Address | Role |
|----------|---------|------|
| EntryPoint v0.7 | [`0x000000007172...`](https://bscscan.com/address/0x0000000071727De22E5E9d8BAf0edAc6f37da032) | ERC-4337 entry point — both txs submitted via `handleUserOps()` |
| Safe Singleton 1.4.1 | [`0x29fcB4...0762`](https://bscscan.com/address/0x29fcB43b46531BcA003ddC8FCB67FFE91900C762) | Smart account implementation |
| Safe Proxy Factory | [`0x4e1DCf...c67`](https://bscscan.com/address/0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67) | Deploys per-user Safe proxies |
