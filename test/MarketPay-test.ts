import { expect } from "chai";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { MarketPay, TokenTest } from "../typechain-types";

describe ("MarketPay", function() {
    let owner: SignerWithAddress;
    let user1: SignerWithAddress;
    let user2: SignerWithAddress;
    let token: TokenTest;
    let token2: TokenTest;
    let market: MarketPay;

    async function  deploy() {
        [owner, user1, user2] = await ethers.getSigners();

        const TokenTest = await ethers.getContractFactory("TokenTest");
        token = await TokenTest.deploy(owner.address);
        await token.waitForDeployment();

        const TokenTest2 = await ethers.getContractFactory("TokenTest");
        token2 = await TokenTest2.deploy(owner.address);
        await token2.waitForDeployment();

        const MarketPay = await ethers.getContractFactory("MarketPay");
        market = await MarketPay.deploy();
        await market.waitForDeployment();

        const tx = market.addTokenApproval(token.target);
        (await tx).wait();
        
        await token.mint(user1.address, 10000n);
        await token.mint(user2.address, 10000n);

        return {owner, user1, user2, token, token2, market};
    }

    describe("Test", function() {
        beforeEach(async function() {
            const {owner, user1, user2, token, market} = await deploy();
        })
        it("Instalation test", async function() {
        
            expect(await market.isTokenApproved(token.target)).to.be.true;
            
            expect (await token.balanceOf(user1.address)).to.eq(10000n);
            expect (await token.balanceOf(user2.address)).to.eq(10000n);

            expect(await market.addTokenApproval(token2.target)).to.emit(market, "TokenApprovalSet")
                .withArgs(token2.target);

            await expect(market.addTokenApproval(token.target)).to.be.revertedWithCustomError(market, "TokenAlreadyExisted");
            await expect(market.connect(user1).addTokenApproval(token2.target))
                .to.be.revertedWithCustomError(market, "OwnableUnauthorizedAccount");
            await expect(market.addTokenApproval(ethers.ZeroAddress))
                .to.be.revertedWithCustomError(market, "ZeroAddress");
            await expect(market.removeTokenApproval(ethers.ZeroAddress))
                .to.be.revertedWithCustomError(market, "ZeroAddress");
        })
        it("Payment Customer1 successfull", async function() {
            const paymentAmount = 1000n;
            const orderId = "Pump2a";
            
            await token.connect(user1).approve(market.target, paymentAmount);

            const balanceUser1Before = await token.balanceOf(user1.address);

            const tx = await market.connect(user1).pay(orderId, token.target, paymentAmount);
            await expect(tx).to.emit(market, "PaymentDone").withArgs(orderId, user1.address, token.target, paymentAmount)
            await tx.wait();

            expect(await token.balanceOf(user1)).to.eq(balanceUser1Before - paymentAmount);

            await expect(market.connect(user1).pay(orderId, token2.target, paymentAmount))
                .to.be.revertedWithCustomError(market, "NonSupportToken");
            await expect(market.connect(user1).pay(orderId, token.target, 0n))
                .to.be.revertedWithCustomError(market, "ZeroAmount");
        })

        it("Payment Customer1+Customer2 successfull", async function() {
            const paymentAmount1 = 1000n;
            const paymentAmount2 = 1500n;
            const orderId1 = "Pump2a";
            const orderId2 = "Pump3a";
            
            await token.connect(user1).approve(market.target, paymentAmount1);
            await token.connect(user2).approve(market.target, paymentAmount2);

            const balanceUser1Before = await token.balanceOf(user1.address);
            const balanceUser2Before = await token.balanceOf(user2.address);

            const tx1 = await market.connect(user1).pay(orderId1, token.target, paymentAmount1);
            await tx1.wait();
            const tx2 = await market.connect(user2).pay(orderId2, token.target, paymentAmount2);
            await tx2.wait();

            await expect(tx1).to.emit(market, "PaymentDone").withArgs(orderId1, user1.address, token.target, paymentAmount1)
            await expect(tx2).to.emit(market, "PaymentDone").withArgs(orderId2, user2.address, token.target, paymentAmount2)


            const tokenContractBalanceAfterPayment = await token.balanceOf(market.target);

            expect(tokenContractBalanceAfterPayment).to.eq(paymentAmount1 + paymentAmount2);

            expect(await token.balanceOf(user1)).to.eq(balanceUser1Before - paymentAmount1);
            expect(await token.balanceOf(user2)).to.eq(balanceUser2Before - paymentAmount2);

        })
        it("Successfull Batch Pay", async function() {
            const paymentAmout1 = 1000n;
            const paymentAmout2 = 2000n;

            const orderIds = ["Pump2a", "Pump3a"];

            await token.connect(user1).approve(market.target, paymentAmout1 + paymentAmout2);

            const balanceUser1Before = await token.balanceOf(user1.address);
            const balanceContractBefore = await token.balanceOf(market.target);

            const tx = await market.connect(user1).payBatch(orderIds, token.target, [paymentAmout1, paymentAmout2]);
            await expect(tx).to.emit(market, "BatchPaymentDone")
                .withArgs(orderIds, user1.address, token.target, [paymentAmout1, paymentAmout2], paymentAmout1+paymentAmout2);
            await tx.wait();

            const balanceUser1After = await token.balanceOf(user1.address);
            const balanceContractAfter = await token.balanceOf(market.target);

            expect(balanceUser1Before - balanceUser1After).to.eq(paymentAmout1 + paymentAmout2);
            expect(balanceContractAfter - balanceContractBefore).to.eq(paymentAmout1 + paymentAmout2);
        })
        it("Reverts if token token is not supported", async function() {
            const paymentAmout1 = 1000n;
            const paymentAmout2 = 2000n;

            const orderIds = ["Pump2a", "Pump3a"];

            await token.connect(user1).approve(market.target, paymentAmout1 + paymentAmout2);

            await expect(market.connect(user1)
                .payBatch(orderIds, token2.target, [paymentAmout1, paymentAmout2]))
                    .to.be.revertedWithCustomError(market, "NonSupportToken");
        })
        it("Revert if length of Order Ids does not correcpond with length of Amount", async function() {
            const orderIds = ["Pump2a", "Pump3a"];
            const paymentAmout1 = 1000n;
            
            await token.connect(user1).approve(market.target, paymentAmout1);
            await expect(market.connect(user1)
                .payBatch(orderIds, token.target, [paymentAmout1]))
                    .to.be.revertedWithCustomError(market, "LengthDoesNotMatch");

        })
        it("Revert if Empty Batch", async function() {
            
            await expect(market.connect(user1).payBatch([], token.target, []))
                .to.be.revertedWithCustomError(market, "EmptyBatch");
        })
        it("Revert if one of item has been lost", async function() {
            const orderIds = ["", "Pump3a"];
            const paymentAmout1 = 1000n;
            const paymentAmout2 = 2000n;

            await token.connect(user1).approve(market.target, paymentAmout1 + paymentAmout2);
            await expect(market.connect(user1).payBatch(orderIds, token.target, [paymentAmout1, paymentAmout2]))
                .to.be.revertedWithCustomError(market, "LostItems");
        })
        it("Revert if one of amount is zero", async function() {
            const orderIds = ["Pump2a", "Pump3a"];
            const paymentAmout1 = 1000n;
            const paymentAmout2 = 0n;

            await token.connect(user1).approve(market.target, paymentAmout1 + paymentAmout2);

            await expect(market.connect(user1).payBatch(orderIds, token.target, [paymentAmout1, paymentAmout2]))
                .to.be.revertedWithCustomError(market, "ZeroAmount");
        })
        it("Revert payBatch if batch exceeds MAX_BATCH_SIZE", async function() {
            const size = 101;
            const orderIds = Array.from({length: size}, (_, i) => `Order${i}`);
            const amounts = Array.from({length: size}, () => 1n);

            await token.connect(user1).approve(market.target, BigInt(size));

            await expect(market.connect(user1).payBatch(orderIds, token.target, amounts))
                .to.be.revertedWithCustomError(market, "BatchTooLarge");
        })
        it("Revert pay if orderId already processed", async function() {
            const paymentAmount = 1000n;
            const orderId = "DuplicateOrder";

            await token.connect(user1).approve(market.target, paymentAmount * 2n);
            await market.connect(user1).pay(orderId, token.target, paymentAmount);

            await expect(market.connect(user1).pay(orderId, token.target, paymentAmount))
                .to.be.revertedWithCustomError(market, "OrderAlreadyProcessed");
        })
        it("Revert payBatch if orderId already processed", async function() {
            const paymentAmount = 1000n;
            const orderId = "DuplicateBatch";

            await token.connect(user1).approve(market.target, paymentAmount * 3n);
            await market.connect(user1).pay(orderId, token.target, paymentAmount);

            await expect(market.connect(user1).payBatch([orderId, "NewOrder"], token.target, [paymentAmount, paymentAmount]))
                .to.be.revertedWithCustomError(market, "OrderAlreadyProcessed");
        })

        it("Withdraw successfull", async function() {
            const paymentAmount = 1000n;
            const orderId = "Pump2a";
            await token.connect(user1).approve(market.target, paymentAmount);
            const tx = await market.connect(user1).pay(orderId, token.target, paymentAmount);
            await tx.wait();

            const tokenContractBalanceAfterPayment = await token.balanceOf(market.target);
            expect(tokenContractBalanceAfterPayment).to.eq(paymentAmount);

            const withdrawAmount = 1000n;

            const wTx = await market.withdrawal(token.target, owner.address, withdrawAmount);
            await wTx.wait();

            expect(await token.balanceOf(owner.address)).to.eq(withdrawAmount);
            expect(await token.balanceOf(market.target)).to.eq(tokenContractBalanceAfterPayment - withdrawAmount)
            
            await expect(wTx).to.emit(market, "Withdrawn").withArgs(token.target, owner.address, withdrawAmount)

            await expect(market.connect(user1)
                .withdrawal(token.target,user1.address, withdrawAmount))
                    .to.be.revertedWithCustomError(market, "OwnableUnauthorizedAccount");

            await expect(market.withdrawal(token.target, owner.address, tokenContractBalanceAfterPayment + 1n))
                .to.be.revertedWithCustomError(market, "NotEnoughFunds");
            await expect(market.withdrawal(token.target, ethers.ZeroAddress, withdrawAmount))
                .to.be.revertedWithCustomError(market, "ZeroAddress");
            await expect(market.withdrawal(token.target, owner.address, 0n))
                .to.be.revertedWithCustomError(market, "ZeroAmount");
        })

        it("Withdrawal All successfully", async function() {
            const paymentAmount = 1000n;
            const orderId = "Pump2a";
            await token.connect(user1).approve(market.target, paymentAmount);
            const tx = await market.connect(user1).pay(orderId, token.target, paymentAmount);
            await tx.wait();

            const tokenContractBalanceAfterPayment = await token.balanceOf(market.target);
            const wTx = await market.withdrawalAll(token.target,owner.address);
            await wTx.wait();

            await expect(wTx).to.emit(market, "WithdrawnAll").withArgs(token.target, owner.address, tokenContractBalanceAfterPayment);

            expect(await token.balanceOf(owner.address)).to.eq(tokenContractBalanceAfterPayment);
        })
        it("Revert WithdrawalAll if to = ZeroAddress", async function() {
            const paymentAmount = 1000n;
            const orderId = "Pump2a";
            await token.connect(user1).approve(market.target, paymentAmount);
            const tx = await market.connect(user1).pay(orderId, token.target, paymentAmount);
            await tx.wait();

            await expect(market.withdrawalAll(token.target, ethers.ZeroAddress))
                .to.be.revertedWithCustomError(market, "ZeroAddress");

        })
        it("Revert if balance Contract is Zero", async function() {
            await expect(market.withdrawalAll(token.target, owner.address))
                .to.be.revertedWithCustomError(market, "NotEnoughFunds")
        })
        it("Remove TokenAppoval successfull", async function() {
            await expect(market.connect(user1).removeTokenApproval(token.target))
                .to.be.revertedWithCustomError(market, "OwnableUnauthorizedAccount");
            
            const tx = await market.removeTokenApproval(token.target);
            await tx.wait();

            await expect(tx).to.emit(market, "TokenApprovalRemoved").withArgs(token.target);
            expect(await market.isTokenApproved(token.target)).to.be.false;

            await expect(market.connect(user1).pay("Pump", token.target, 1000n))
                .to.be.revertedWithCustomError(market, "NonSupportToken");
        })
        it("Revert if paused, not revert for withdrawalAll", async function() {

            const paymentAmount = 1000n;
            const orderId = "Pump2a";

            await token.connect(user1).approve(market.target, paymentAmount);

            const tx1 = await market.connect(user1).pay(orderId, token.target, paymentAmount);
            await tx1.wait();

            const tx = await market.pause();
            await tx.wait();

            await expect(market.connect(user1).pay(orderId, token.target, paymentAmount))
                .to.be.revertedWithCustomError(market, "EnforcedPause");
            await expect(market.addTokenApproval(token2.target))
                .to.be.revertedWithCustomError(market, "EnforcedPause");
            await expect(market.removeTokenApproval(token.target))
                .to.be.revertedWithCustomError(market, "EnforcedPause");
            await expect(market.withdrawal(token.target, owner.address, 500n))
                .to.be.revertedWithCustomError(market, "EnforcedPause");

            const tokenBalanceContract = await token.balanceOf(market.target);
            const wTx = await market.withdrawalAll(token.target, owner.address);
            await wTx.wait();
            const ownerBalanceAfter = await token.balanceOf(owner.address);
            expect(ownerBalanceAfter).to.eq(tokenBalanceContract);

        })
        it("Functions successfull working after pause->unpause", async function() {
            const paymentAmount = 1000n;
            const orderId = "Pump2a";
                
            await token.connect(user1).approve(market.target, paymentAmount);

            const tx1 = await market.connect(user1).pay(orderId, token.target, paymentAmount);
            await tx1.wait();

            const txP = await market.pause();
            await txP.wait();

            await expect(market.connect(user1).pay(orderId, token.target, paymentAmount))
                .to.be.revertedWithCustomError(market, "EnforcedPause");
            
            await token.connect(user1).approve(market.target, paymentAmount);

            const txUP = await market.unpause();
            await txUP.wait();
            const tx2 = await market.connect(user1).pay("Pump2b", token.target, paymentAmount);
            await expect(tx2).to.be.not.reverted;
            const tokenBalanceContract = await token.balanceOf(market.target);
            expect(tokenBalanceContract).to.eq(2n * paymentAmount);

            await expect(market.addTokenApproval(token2.target)).to.be.not.reverted;
            await expect(market.removeTokenApproval(token.target)).to.be.not.reverted;

            const wTx = await market.withdrawal(token.target, owner.address, paymentAmount);
            await wTx.wait();

            const tokenBalanceOwner = await token.balanceOf(owner.address);
            expect(tokenBalanceOwner).to.eq(paymentAmount);

        })
    })
    describe("Test ETH", function() {
        beforeEach(async function() {
            const {owner, user1, user2, token, market} = await deploy();
        })
        it("Pay with ETH successfully", async function() {
            const amount = ethers.parseEther("1");
            const orderId = "Pump2a";
            const balanceETHContractBefore = await ethers.provider.getBalance(market.target);

            const tx = await market.connect(user1).payWithETH(orderId, {value: amount});
            await expect(tx).to.emit(market, "PaymentETHDone").withArgs(orderId, user1.address, amount);
            await tx.wait();

            const balanceETHContractAfter = await ethers.provider.getBalance(market.target);

            expect(balanceETHContractAfter - balanceETHContractBefore).to.eq(amount)
        })
        it("Revert if orderID did not filled", async function() {
            const amount = ethers.parseEther("1");
            const orderId = "";
            
            await expect(market.connect(user1).payWithETH(
                orderId,
                {value: amount}
            )).to.be.revertedWithCustomError(market, "LostItems");
        })
        it("Revert if amount is zero", async function() {
            const amount = 0;
            const orderId = "Pump2a";

            await expect(market.connect(user1).payWithETH(
                orderId,
                {value: amount}
            )).to.be.revertedWithCustomError(market, "ZeroAmount")
        })
        it("Pay batch with ETH successfully", async function() {
            const paymentAmout1 = ethers.parseEther("1");
            const paymentAmout2 = ethers.parseEther("2");

            const amount = paymentAmout1 + paymentAmout2;

            const orderIds = ["Pump2a", "Pump3a"];

            const balanceETHContractBefore = await ethers.provider.getBalance(market.target);

            const tx = await market.connect(user1).payBatchWithETH(orderIds, [paymentAmout1, paymentAmout2], {value: amount} );
            await expect(tx).to.emit(market, "BatchWithETHPaymentDone").withArgs(orderIds, user1.address, [paymentAmout1, paymentAmout2], amount);
            await tx.wait();

            const balanceETHContractAfter = await ethers.provider.getBalance(market.target);

            expect(balanceETHContractAfter - balanceETHContractBefore).to.eq(amount);

        })
        it("Revert batch if orderIds is empty", async function() {
            const paymentAmout1 = ethers.parseEther("1");
            const paymentAmout2 = ethers.parseEther("2");

            const amount = paymentAmout1 + paymentAmout2;

            await expect(market.connect(user1).payBatchWithETH([], [], {value: amount}))
                .to.be.revertedWithCustomError(market, "EmptyBatch");
        })
        it("Revert batch if amount is zero", async function() {
            const orderIds = ["Pump2a", "Pump3a"];
            const amount = ethers.parseEther("0");

            await expect(market.connect(user1).payBatchWithETH(orderIds, [0n, 0n], {value:amount}))
                .to.be.revertedWithCustomError(market, "ZeroAmount");

        })
        it("Revert batch if one of orderIds is empty", async function() {
            const paymentAmout1 = ethers.parseEther("1");
            const paymentAmout2 = ethers.parseEther("2");

            const amount = paymentAmout1 + paymentAmout2;

            const orderIds = ["", "Pump3a"];

            await expect(market.connect(user1).payBatchWithETH(orderIds, [paymentAmout1, paymentAmout2], {value: amount}))
                .to.be.revertedWithCustomError(market, "LostItems");
        })
        it("Revert payBatchWithETH if batch exceeds MAX_BATCH_SIZE", async function() {
            const size = 101;
            const orderIds = Array.from({length: size}, (_, i) => `Order${i}`);
            const amounts = Array.from({length: size}, () => ethers.parseEther("0.01"));
            const total = amounts.reduce((a, b) => a + b, 0n);

            await expect(market.connect(user1).payBatchWithETH(orderIds, amounts, {value: total}))
                .to.be.revertedWithCustomError(market, "BatchTooLarge");
        })
        it("Revert payBatchWithETH if msg.value does not match sum of amounts", async function() {
            const paymentAmout1 = ethers.parseEther("1");
            const paymentAmout2 = ethers.parseEther("2");
            const orderIds = ["Pump2a", "Pump3a"];

            await expect(market.connect(user1).payBatchWithETH(orderIds, [paymentAmout1, paymentAmout2], {value: paymentAmout1}))
                .to.be.revertedWithCustomError(market, "MsgValueMismatch");
        })
        it("Revert payBatchWithETH if one of amounts is zero", async function() {
            const paymentAmout1 = ethers.parseEther("1");
            const paymentAmout2 = 0n;
            const orderIds = ["Pump2a", "Pump3a"];
            const total = paymentAmout1 + paymentAmout2;

            await expect(market.connect(user1).payBatchWithETH(orderIds, [paymentAmout1, paymentAmout2], {value: total}))
                .to.be.revertedWithCustomError(market, "ZeroAmount");
        })
        it("Revert payWithETH if orderId already processed", async function() {
            const amount = ethers.parseEther("1");
            const orderId = "DuplicateETH";

            await market.connect(user1).payWithETH(orderId, {value: amount});

            await expect(market.connect(user1).payWithETH(orderId, {value: amount}))
                .to.be.revertedWithCustomError(market, "OrderAlreadyProcessed");
        })
        it("Revert payBatchWithETH if orderId already processed", async function() {
            const amount = ethers.parseEther("1");
            const orderId = "DuplicateBatchETH";

            await market.connect(user1).payWithETH(orderId, {value: amount});

            await expect(market.connect(user1).payBatchWithETH([orderId, "NewOrderETH"], [amount, amount], {value: amount * 2n}))
                .to.be.revertedWithCustomError(market, "OrderAlreadyProcessed");
        })
        it("Withdraw ETH successfully", async function() {
            const amount = ethers.parseEther("1");
            const orderId = "Pump2a";

            const tx = await market.connect(user1).payWithETH(orderId, {value: amount});
            await tx.wait();

            const balanceETHBefore = await ethers.provider.getBalance(market.target);
            const withdrawAmountETH = ethers.parseEther("0.5");

            const wTX = await market.withdrawalETH(owner.address, withdrawAmountETH);
            await wTX.wait();

            const balanceETHAfter = await ethers.provider.getBalance(market.target);

            expect(balanceETHBefore - balanceETHAfter).to.eq(withdrawAmountETH);

            await expect(wTX).to.emit(market, "WithdrawnETH").withArgs(owner.address, withdrawAmountETH);
        })
        it("Revert withdrawETH if ZeroAddress", async function() {
            await expect(market.withdrawalETH(ethers.ZeroAddress, ethers.parseEther("0.5"))).to.revertedWithCustomError(market, "ZeroAddress");
        })
        it("Revert withdrawETH if ZeroAmount", async function() {
            await expect(market.withdrawalETH(owner.address, 0)).to.revertedWithCustomError(market, "ZeroAmount");
        })
        it("Revert withdrawETH if not enough funds", async function() {
            await expect(market.withdrawalETH(owner.address, ethers.parseEther("0.5"))).to.revertedWithCustomError(market, "NotEnoughFunds");
        })
        it("Revert withdrawETH if pause", async function() {
            const amount = ethers.parseEther("1");
            const orderId = "Pump2a";

            const tx = await market.connect(user1).payWithETH(orderId, {value: amount});
            await tx.wait();

            await market.pause();

            await expect(market.withdrawalETH(owner.address, ethers.parseEther("0.5"))).to.revertedWithCustomError(market, "EnforcedPause");
        })
        it("WithdralETH successful when pause -> unpause", async function () {
            const amount = ethers.parseEther("1");
            const orderId = "Pump2a";

            const tx = await market.connect(user1).payWithETH(orderId, {value: amount});
            await tx.wait();

            await market.pause();

            const balanceETHBefore = await ethers.provider.getBalance(market.target);
            const withdrawAmountETH = ethers.parseEther("0.5");

            await market.unpause();

            const wTX = await market.withdrawalETH(owner.address, withdrawAmountETH);
            await wTX.wait();

            const balanceETHAfter = await ethers.provider.getBalance(market.target);

            expect(balanceETHBefore - balanceETHAfter).to.eq(withdrawAmountETH);
        })
        it("withdrawalETH succeeds when amount equals exact contract balance", async function() {
            const amount = ethers.parseEther("1");
            const orderId = "Pump2a";

            const tx = await market.connect(user1).payWithETH(orderId, {value: amount});
            await tx.wait();

            const contractBalance = await ethers.provider.getBalance(market.target);
            expect(contractBalance).to.eq(amount);

            const wTX = await market.withdrawalETH(owner.address, contractBalance);
            await wTX.wait();

            expect(await ethers.provider.getBalance(market.target)).to.eq(0n);
            await expect(wTX).to.emit(market, "WithdrawnETH").withArgs(owner.address, contractBalance);
        })
        it("WithdrawALL ETH successfully", async function() {
            const amount = ethers.parseEther("1");
            const orderId = "Pump2a";

            const tx = await market.connect(user2).payWithETH(orderId, {value: amount});
            await tx.wait();

            const balanceETHBefore = await ethers.provider.getBalance(market.target);
            const balanceETHUserBefore = await ethers.provider.getBalance(user1.address);

            const wTX = await market.withdrawalAllETH(user1.address);
            await wTX.wait();

            const balanceETHAfter = await ethers.provider.getBalance(market.target);
            const balanceETHUserAfter = await ethers.provider.getBalance(user1.address);

            expect(balanceETHAfter).to.eq(0);
            expect(balanceETHUserAfter - balanceETHUserBefore).to.eq(balanceETHBefore);

            await expect(wTX).to.emit(market, "WithdrawnETHAll").withArgs(user1.address, balanceETHBefore);
        })
        it("Revert withdrawETH if ZeroAddress", async function() {
            await expect(market.withdrawalAllETH(ethers.ZeroAddress)).to.revertedWithCustomError(market, "ZeroAddress");
        })
        
        it("NOT Revert withdrawALLETH if not enough funds", async function() {
            await expect(market.withdrawalAllETH(owner.address)).to.revertedWithCustomError(market, "NotEnoughFunds");
        })
        it("WithdrawALLETH succeeds when paused (emergency escape)", async function() {
            const amount = ethers.parseEther("1");
            const orderId = "Pump2a";

            const tx = await market.connect(user2).payWithETH(orderId, {value: amount});
            await tx.wait();

            const balanceETHBefore = await ethers.provider.getBalance(market.target);
            const balanceETHUserBefore = await ethers.provider.getBalance(user1.address);

            await market.pause();

            const wTX = await market.withdrawalAllETH(user1.address);
            await wTX.wait();

            const balanceETHAfter = await ethers.provider.getBalance(market.target);
            const balanceETHUserAfter = await ethers.provider.getBalance(user1.address);

            expect(balanceETHAfter).to.eq(0);
            expect(balanceETHUserAfter - balanceETHUserBefore).to.eq(balanceETHBefore);
        })
        
    })
})