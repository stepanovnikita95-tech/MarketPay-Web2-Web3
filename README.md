# MarketPay — On-Chain Payment Gateway

[![Solidity](https://img.shields.io/badge/Solidity-%5E0.8.30-black?logo=solidity)](https://docs.soliditylang.org/)
[![Hardhat](https://img.shields.io/badge/Built%20with-Hardhat-orange)](https://hardhat.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Tests & Coverage](https://github.com/stepanovnikita95-tech/Solidity-Insurance-Pool/actions/workflows/test.yml/badge.svg)](https://github.com/stepanovnikita95-tech/Solidity-Insurance-Pool/actions/workflows/test.yml)
<!-- COVERAGE BADGE -->

> A lightweight, auditable smart contract payment gateway for a hybrid **Web2 + Web3 e-commerce platform** (Nest-Mart Grocery). Accepts ERC-20 stablecoins and ETH, supports batch payments, and emits immutable on-chain payment events — all without storing any personal or pricing data.

---

## Overview

MarketPay is a Web3 extension layer built on top of an existing MERN e-commerce platform. The smart contract acts as a **verification and settlement layer**: it accepts payments, emits events, and lets the backend index them — while all business logic stays off-chain.

**Design principles:**
- No user data stored on-chain — only an order hash and payment facts
- No pricing or order management logic inside the contract
- Blockchain features are additive and do not affect non-crypto users
- Stablecoins reduce volatility risk; ETH support is also available

---

## Architecture

### Two Contract Variants

The project ships the same payment logic in two access-control flavours:

| Contract | Access Control | Best For |
|---|---|---|
| [`MarketPay.sol`](contracts/MarketPay.sol) | `Ownable` — single owner | Centralised / solo deployment |
| [`MarketPayAM.sol`](contracts/MarketPayAM.sol) | `AccessManaged` — role-based via OpenZeppelin AccessManager | Multi-role / team deployment |

[`MarketPayAuthority.sol`](contracts/MarketPayAuthority.sol) is the AccessManager contract that governs roles for `MarketPayAM`.

### Core Payment Flow

```
User approves ERC-20 spend
        │
        ▼
  pay() / payBatch()
        │
        ├─ validates orderId (1–64 chars, not duplicate)
        ├─ validates token is whitelisted
        ├─ pulls tokens via safeTransferFrom
        └─ emits PaymentDone / BatchPaymentDone
                │
                ▼
       Backend indexes event
       and updates order status in MongoDB
```

---

## Features

### Payment Methods

| Method | Description |
|---|---|
| `pay(orderId, token, amount)` | Single ERC-20 payment |
| `payWithETH(orderId)` | Single ETH payment |
| `payBatch(orderIds[], token, amounts[])` | Batch ERC-20 — up to 100 orders in one tx |
| `payBatchWithETH(orderIds[], amounts[])` | Batch ETH — `msg.value` must equal sum of amounts |

### Admin Methods

| Method | Description |
|---|---|
| `addTokenApproval(token)` | Add ERC-20 token to whitelist |
| `removeTokenApproval(token)` | Remove token from whitelist |
| `withdrawal(token, to, amount)` | Partial ERC-20 withdrawal |
| `withdrawalETH(to, amount)` | Partial ETH withdrawal |
| `withdrawalAll(token, to)` | Full ERC-20 sweep |
| `withdrawalAllETH(to)` | Full ETH sweep |
| `pause()` / `unpause()` | Emergency circuit breaker |

### Events Emitted

```solidity
PaymentDone(string orderId, address indexed customer, address token, uint256 indexed amount)
PaymentETHDone(string orderId, address indexed customer, uint256 indexed amountETH)
BatchPaymentDone(string[] orderIds, address indexed customer, address token, uint256[] amounts, uint256 indexed totalAmount)
BatchWithETHPaymentDone(string[] orderIds, address indexed customer, uint256[] amounts, uint256 indexed totalAmountETH)
```

---

## Security

| Mechanism | Purpose |
|---|---|
| `ReentrancyGuard` | Prevents reentrancy attacks on all state-changing functions |
| `SafeERC20` | Guards against non-standard ERC-20 implementations |
| `Pausable` | Emergency pause by owner / authority |
| `_processedOrders` mapping | Idempotency — each `orderId` can only be paid once, **globally across all payment types (ERC-20 and ETH)** |
| `MAX_BATCH_SIZE = 100` | Caps batch size to prevent block gas limit DoS |
| `receive() reverts` | Blocks accidental direct ETH transfers |
| `orderId` length check (1–64 bytes) | Prevents empty or oversized order IDs |

---

## Design Notes

### Emergency Withdrawal (Intentional Behaviour)

`withdrawalAll` and `withdrawalAllETH` intentionally bypass `whenNotPaused`. The owner / treasury role can always sweep funds out even while the contract is paused. This is a deliberate safety valve to prevent funds from being permanently locked if the contract is paused in an emergency.

**Roadmap — next release:** This pattern will be replaced by dedicated `emergencyWithdraw` functions protected by a Timelock + multisig. Regular `withdrawalAll` / `withdrawalAllETH` will then respect the pause state, and emergency withdrawals will require a time delay and multi-party approval.

### orderId Uniqueness

`orderId` is a **global** idempotency key shared across all payment methods — ERC-20 and ETH alike. Once an `orderId` has been processed by any of `pay`, `payWithETH`, `payBatch`, or `payBatchWithETH`, it can never be reused.

Your backend **must generate globally unique order IDs** across all payment channels and currencies. Reusing an orderId for a different payment type will result in an `OrderAlreadyProcessed` revert.

---

## MarketPayAM Deployment Checklist

After deploying `MarketPayAuthority` and `MarketPayAM`, the following steps **must** be executed before the contract is usable. Skipping step 3 will leave all `restricted` functions accessible to the admin only (AccessManager default).

**1. Deploy contracts**
```bash
npx hardhat run scripts/deploy.ts --network sepolia
```

**2. Grant roles**
```typescript
const TREASURY_ROLE     = await authority.TREASURY_ROLE();      // 1
const PAUSER_ROLE       = await authority.PAUSER_ROLE();        // 2
const TOKEN_MANAGER_ROLE = await authority.TOKEN_MANAGER_ROLE(); // 3

await authority.grantRole(TREASURY_ROLE,      treasuryAddress,     0);
await authority.grantRole(PAUSER_ROLE,        pauserAddress,       0);
await authority.grantRole(TOKEN_MANAGER_ROLE, tokenManagerAddress, 0);
```

**3. Wire functions to roles**
```typescript
// Treasury
await authority.setTargetFunctionRole(market.target, [
    market.interface.getFunction("withdrawal").selector,
    market.interface.getFunction("withdrawalAll").selector,
    market.interface.getFunction("withdrawalETH").selector,
    market.interface.getFunction("withdrawalAllETH").selector,
], TREASURY_ROLE);

// Pauser
await authority.setTargetFunctionRole(market.target, [
    market.interface.getFunction("pause").selector,
    market.interface.getFunction("unpause").selector,
], PAUSER_ROLE);

// Token Manager
await authority.setTargetFunctionRole(market.target, [
    market.interface.getFunction("addTokenApproval").selector,
    market.interface.getFunction("removeTokenApproval").selector,
], TOKEN_MANAGER_ROLE);
```

**4. Whitelist at least one token**
```typescript
await market.connect(tokenManager).addTokenApproval(tokenAddress);
```

> If step 3 is skipped, all `restricted` functions default to `ADMIN_ROLE` only and will revert for any other caller.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Smart contracts | Solidity `0.8.30`, EVM Cancun |
| Framework | Hardhat `2.x` + TypeScript |
| Libraries | OpenZeppelin Contracts `v5` |
| Ethers | ethers.js `v6` |
| Type safety | TypeChain (ethers-v6 target) |
| Testing | Mocha / Chai — **59 tests** |
| Coverage | solidity-coverage |
| Testnet | Sepolia (Alchemy RPC) |

---

## Getting Started

### Prerequisites

- Node.js `>= 18`
- npm `>= 9`

### Installation

```bash
git clone https://github.com/<your-username>/MarketPay.git
cd MarketPay
npm install
```

### Environment Variables

Copy the example and fill in your values:

```bash
cp .env.example .env
```

| Variable | Description |
|---|---|
| `ALCHEMY_SEPOLIA_URL` | Alchemy RPC endpoint for Sepolia |
| `PRIVATE_KEY` | Deployer wallet private key (no `0x` prefix) |
| `ETHERSCAN_API_KEY` | For contract verification on Etherscan |

---

## Commands

```bash
# Compile contracts
npx hardhat compile

# Run all tests
npx hardhat test

# Run a specific test suite
npx hardhat test test/MarketPay-test.ts
npx hardhat test test/MarketPayAM-test.ts

# Code coverage
npx hardhat coverage

# Gas report
REPORT_GAS=true npx hardhat test

# Local node
npx hardhat node

# Deploy to Sepolia
npx hardhat run scripts/deploy.ts --network sepolia

# Verify on Etherscan
npx hardhat verify --network sepolia <CONTRACT_ADDRESS>
```

---

## Test Results

```
MarketPay.sol
  ✔ 42 tests — payments, batch, withdrawals, access control, pause

MarketPayAM.sol
  ✔ 25 tests — same coverage + role-based access via AccessManager

67 passing
```

---

## Deployed Contracts (Sepolia)

| Contract | Address |
|---|---|
| `MarketPay` | — |
| `MarketPayAM` | — |
| `MarketPayAuthority` | — |

---

## License

[MIT](LICENSE)
