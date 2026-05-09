# LinkedIn Post — MarketPay Release

---

Shipped a project I'm genuinely excited about: a Web3 payment layer that plugs into an existing MERN e-commerce platform — without rewriting a single line of Web2 code.

The idea is simple: what if a grocery store accepted USDC or ETH alongside regular card payments? Non-crypto users see exactly the same experience as before. Crypto users get a transparent, on-chain payment option. No vendor lock-in, no stored card data — just an immutable event on Ethereum.

---

**What I built — MarketPay:**

→ Smart contract accepts ERC-20 stablecoins + native ETH
→ Batch payments: up to 100 orders settled in a single transaction
→ Global orderId idempotency — each payment ID can only be used once, across all currencies
→ Two access-control variants: Ownable (solo deployment) and AccessManaged (multi-role team with treasury / pauser / token-manager roles)
→ On-chain events serve as the audit trail; the backend indexes them and updates MongoDB

**Security layer:**
• ReentrancyGuard on every state-changing function
• SafeERC20 for non-standard token compatibility
• Pausable circuit breaker with always-available emergency sweep
• MAX_BATCH_SIZE cap to prevent block gas limit DoS
• receive() reverts — no accidental ETH accepted

**Stack:**
Solidity 0.8.30 · OpenZeppelin v5 · Hardhat · TypeScript · ethers.js v6 · TypeChain · 67 tests · GitHub Actions CI · Codecov

---

The architecture diagram above shows the key insight: the smart contract is a thin settlement layer. All pricing, order management, and user data stays off-chain. Blockchain features are additive — the platform works perfectly fine without them.

Next up: Timelock + multisig for emergency withdrawals.

🔗 github.com/stepanovnikita95-tech/MarketPay-Web2-Web3

What's your take on gradual Web3 adoption in traditional e-commerce — layer it on top or rebuild from scratch?

---

#Solidity #Web3 #SmartContracts #Ethereum #Blockchain #OpenZeppelin #Hardhat #TypeScript #DeFi #ERC20
