import { ethers } from "hardhat";

async function main() {
    const ownerAddress = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
    const marketAddress = "0x5FC8d32690cc91D4c39d9d3abcBD16989F875707";
    const tokenAddress = "0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9";

    const owner = await ethers.getSigner(ownerAddress);

    const market = await ethers.getContractAt("MarketPay", marketAddress);
    const token = await ethers.getContractAt("TokenTest", tokenAddress);

    const [user11] = await ethers.getSigners();
    console.log("User11 address: ", user11.address);

    const tx = await token.mint(user11.address, 10000n);
    await tx.wait();

    console.log("Minted successfully!. Token balance user11: ", await token.balanceOf(user11.address));
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});