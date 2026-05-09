import { ethers } from "hardhat";

async function  deploy() {
    const [owner, user1] = await ethers.getSigners();

    console.log("Deployer address: ", owner.address);
    console.log("Deployer balance: ", ethers.formatEther(
        await ethers.provider.getBalance(owner.address)));

    const TokenTest = await ethers.getContractFactory("TokenTest");
    const token = await TokenTest.deploy(owner.address);
    await token.waitForDeployment();
    console.log("Token deployed with address: ", token.target);

    const TokenTest2 = await ethers.getContractFactory("TokenTest");
    const token2 = await TokenTest2.deploy(owner.address);
    await token2.waitForDeployment();
    console.log("Token2 deployed with address: ", token2.target);

    const MarketPay = await ethers.getContractFactory("MarketPay");
    const market = await MarketPay.deploy();
    await market.waitForDeployment();
    console.log("MarketPay deployed with address: ", market.target);

}

deploy().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});