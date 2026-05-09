import { ethers } from "hardhat";

async function main() {
    const user11Address = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
    const marketAddress = "0x5FC8d32690cc91D4c39d9d3abcBD16989F875707";
    const tokenAddress = "0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9";

    const orderId = "Pump2a";
    const amount = 2000n;

    const user11 = await ethers.getSigner(user11Address);
    const market = await ethers.getContractAt("MarketPay", marketAddress);
    const token = await ethers.getContractAt("TokenTest", tokenAddress);

    const mTx = await token.mint(user11, 10000n);
    await mTx.wait();

    const balanceUserBefore = await token.balanceOf(user11);
    const balanceContractBefore = await token.balanceOf(market);
    console.log("Token Balance User11 Before", balanceUserBefore);
    console.log("Token Balance Contract before", balanceContractBefore);

    const aTx = await token.connect(user11).approve(market, amount);
    await aTx.wait();

    const tx = await market.connect(user11).pay(orderId, token, amount);
    await tx.wait();

    const balanceUserAfter = await token.balanceOf(user11);
    const balanceContractAfter = await token.balanceOf(market);

    console.log("Payment successfully completed!");
    console.log("Token Balance Yser11 After", balanceUserAfter);
    console.log("Token Balance Contract After", balanceContractAfter);

}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});