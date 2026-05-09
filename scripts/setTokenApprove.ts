import { ethers } from "hardhat";

async function main() {
    const ownerAddress = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
    const marketAddress = "0x5FC8d32690cc91D4c39d9d3abcBD16989F875707";
    const tokenAddress = "0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9";

    const owner = await ethers.getSigner(ownerAddress);

    const market = await ethers.getContractAt("MarketPay", marketAddress);
    const token = await ethers.getContractAt("TokenTest", tokenAddress);

    console.log("Connecting to MarketPay at:", marketAddress);
    
    const tx = await market.connect(owner).setTokenApproval(tokenAddress);
    await tx.wait();

    console.log("Token set successfully! Hash:", tx.hash);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});