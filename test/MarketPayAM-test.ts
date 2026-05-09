import { expect } from "chai";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { MarketPayAM, TokenTest, MarketPayAuthority } from "../typechain-types";

describe ("MarketPayAM", function() {
    let owner: SignerWithAddress;
    let user1: SignerWithAddress;
    let user2: SignerWithAddress;
    let token: TokenTest;
    let token2: TokenTest;
    let market: MarketPayAM;
    let authority: MarketPayAuthority;

    async function  deploy() {
        [owner, user1, user2] = await ethers.getSigners();

        const TokenTest = await ethers.getContractFactory("TokenTest");
        token = await TokenTest.deploy(owner.address);
        await token.waitForDeployment();

        const TokenTest2 = await ethers.getContractFactory("TokenTest");
        token2 = await TokenTest2.deploy(owner.address);
        await token2.waitForDeployment();

        const MarketPayAuthority = await ethers.getContractFactory("MarketPayAuthority");
        authority = await MarketPayAuthority.deploy(owner.address);
        await authority.waitForDeployment();
        
        const MarketPayAM = await ethers.getContractFactory("MarketPayAM");
        market = await MarketPayAM.deploy(authority.target);
        await market.waitForDeployment();

        await setTokenManagerRole(user1);

        await setTreasuryRole(user1);

        await setPauserRole(user2);

        const tx = market.connect(user1).addTokenApproval(token.target);
        (await tx).wait();
        
        await token.mint(user1.address, 10000n);
        await token.mint(user2.address, 10000n);

        return {owner, user1, user2, token, token2, market};
    }

    async function payToken(user:SignerWithAddress, _amount:any, _orderId:string, target:MarketPayAM, token:TokenTest) {
        const paymentAmount = _amount;
        const orderId = _orderId;
        
        await token.connect(user).approve(target, paymentAmount);
        const tx = await target.connect(user).pay(orderId, token, paymentAmount);
        await tx.wait();
    }
    async function setTreasuryRole(user:SignerWithAddress) {
        const TREASURY_ROLE = await authority.TREASURY_ROLE();
        await authority.grantRole(TREASURY_ROLE, user, 0);

        const withdrawalSelector = market.interface.getFunction("withdrawal")!.selector;
        const withdrawalAll = market.interface.getFunction("withdrawalAll").selector; 
        const withdrawalETHSelector = market.interface.getFunction("withdrawalETH")!.selector;
        const withdrawalAllETHSelector = market.interface.getFunction("withdrawalAllETH")!.selector; 
 
    
        await authority.setTargetFunctionRole(
            market.target,
            [withdrawalSelector, withdrawalAll, withdrawalETHSelector, withdrawalAllETHSelector],
            TREASURY_ROLE
        );
    }
    async function setPauserRole(user:SignerWithAddress) {
        const PAUSER_ROLE = await authority.PAUSER_ROLE();

        await authority.grantRole(PAUSER_ROLE, user, 0);

        const pauseSelector = market.interface.getFunction("pause")!.selector;
        const unpauseSelector = market.interface.getFunction("unpause")!.selector;

        await authority.setTargetFunctionRole(
            market.target,
            [pauseSelector, unpauseSelector],
            PAUSER_ROLE
        )
    }
    async function setTokenManagerRole(user:SignerWithAddress) {
        const TOKEN_MANAGER_ROLE = await authority.TOKEN_MANAGER_ROLE();

        await authority.grantRole(TOKEN_MANAGER_ROLE, user, 0);

        const setTokenSelector = market.interface.getFunction("addTokenApproval")!.selector;
        const removeTokenSelector = market.interface.getFunction("removeTokenApproval")!.selector;

        await authority.setTargetFunctionRole(
            market.target,
            [setTokenSelector, removeTokenSelector],
            TOKEN_MANAGER_ROLE
        )
    }


    describe("Test-AccessManager", function() {
        
        beforeEach(async function() {
            const {owner, user1, user2, token, market} = await deploy();
        })
        it("Instalation test", async function() {
        
            expect(await market.isTokenApproved(token.target)).to.be.true;
            
            expect (await token.balanceOf(user1.address)).to.eq(10000n);
            expect (await token.balanceOf(user2.address)).to.eq(10000n);

            expect(await market.connect(user1).addTokenApproval(token2.target)).to.emit(market, "TokenApprovalSet")
                .withArgs(token2.target);

            await expect(market.connect(user1).addTokenApproval(token.target)).to.be.revertedWithCustomError(market, "TokenAlreadyExisted");
            await expect(market.connect(user2).addTokenApproval(token2.target))
                .to.be.revertedWithCustomError(market, "AccessManagedUnauthorized");
            await expect(market.connect(user1).addTokenApproval(ethers.ZeroAddress))
                .to.be.revertedWithCustomError(market, "ZeroAddress");
            await expect(market.connect(user1).removeTokenApproval(ethers.ZeroAddress))
                .to.be.revertedWithCustomError(market, "ZeroAddress");

            expect(await market.authority()).to.eq(authority.target);
        })
        describe("Payment - deposit with no roles", function() {

        
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
            it("Revert WithdrawalAll if to = ZeroAddress", async function() {
                const paymentAmount = 1000n;
                const orderId = "Pump2a";
                
                await payToken(user1, paymentAmount, orderId, market, token);

                await expect(market.connect(user1).withdrawalAll(token.target, ethers.ZeroAddress))
                    .to.be.revertedWithCustomError(market, "ZeroAddress");
            })
            it("Revert if balance Contract is Zero", async function() {
                await expect(market.connect(user1).withdrawalAll(token.target, owner.address))
                    .to.be.revertedWithCustomError(market, "NotEnoughFunds")
            })
        })
        describe("Payments - withdrawal, withdrawalAll, set/remove tokenApproval with roles", function() {
            it("Remove TokenAppoval successfull", async function() {
                await expect(market.connect(user2).removeTokenApproval(token.target))
                    .to.be.revertedWithCustomError(market, "AccessManagedUnauthorized");
                
                const tx = await market.connect(user1).removeTokenApproval(token.target);
                await tx.wait();

                await expect(tx).to.emit(market, "TokenApprovalRemoved").withArgs(token.target);
                expect(await market.isTokenApproved(token.target)).to.be.false;

                await expect(market.connect(user1).pay("Pump", token.target, 1000n))
                    .to.be.revertedWithCustomError(market, "NonSupportToken");
            })
            it("Revert if paused, not revert for withdrawalAll", async function() {

                const paymentAmount = 1000n;
                const orderId = "Pump2a";

                await payToken(user1, paymentAmount, orderId, market, token);

                const tx = await market.connect(user2).pause();
                await tx.wait();

                await expect(market.connect(user1).pay(orderId, token.target, paymentAmount))
                    .to.be.revertedWithCustomError(market, "EnforcedPause");
                await expect(market.connect(user1).addTokenApproval(token2.target))
                    .to.be.revertedWithCustomError(market, "EnforcedPause");
                await expect(market.connect(user1).removeTokenApproval(token.target))
                    .to.be.revertedWithCustomError(market, "EnforcedPause");
                await expect(market.connect(user1).withdrawal(token.target, owner.address, 500n))
                    .to.be.revertedWithCustomError(market, "EnforcedPause");

                const tokenBalanceContract = await token.balanceOf(market.target);
                const wTx = await market.connect(user1).withdrawalAll(token.target, owner.address);
                await wTx.wait();
                const ownerBalanceAfter = await token.balanceOf(owner.address);
                expect(ownerBalanceAfter).to.eq(tokenBalanceContract);

            })
            it("Functions successfull working after pause->unpause", async function() {
                const paymentAmount = 1000n;
                const orderId = "Pump2a";
                    
                await payToken(user1, paymentAmount, orderId, market, token);

                const txP = await market.connect(user2).pause();
                await txP.wait();

                await expect(market.connect(user1).pay(orderId, token.target, paymentAmount))
                    .to.be.revertedWithCustomError(market, "EnforcedPause");
                
                const txUP = await market.connect(user2).unpause();
                await txUP.wait();

                await token.connect(user1).approve(market.target, paymentAmount);
                
                const tx2 = await market.connect(user1).pay("Pump2b", token.target, paymentAmount);
                await expect(tx2).to.be.not.reverted;
                const tokenBalanceContract = await token.balanceOf(market.target);
                expect(tokenBalanceContract).to.eq(2n * paymentAmount);

                await expect(market.connect(user1).addTokenApproval(token2.target)).to.be.not.reverted;
                await expect(market.connect(user1).removeTokenApproval(token.target)).to.be.not.reverted;

                const wTx = await market.connect(user1).withdrawal(token.target, owner.address, paymentAmount);
                await wTx.wait();

                const tokenBalanceOwner = await token.balanceOf(owner.address);
                expect(tokenBalanceOwner).to.eq(paymentAmount);
            })
            it("Withdrawal + WithdrawETH successfully if specific role set to user", async function() {
                const paymentAmount = 5000n;
                const orderId = "Pump2a";
                const paymentAmountETH = ethers.parseEther("5");

                await payToken(user2, paymentAmount, orderId, market, token);

                const txETH = await market.connect(user2).payWithETH("Pump2a-ETH", {value: paymentAmountETH})

                const tokenContractBalanceAfterPayment = await token.balanceOf(market.target);
                expect(tokenContractBalanceAfterPayment).to.eq(paymentAmount);

                const withdrawAmount = 1000n;
                const withdrawAmountETH = ethers.parseEther("1");
                
                const balanceOwnerBefore = await token.balanceOf(owner);
                const balanceETHOwnerBefore = await ethers.provider.getBalance(owner);
                
                const wTx = await market.connect(user1).withdrawal(token.target, owner.address, withdrawAmount);
                await wTx.wait();

                const wETHtx = await market.connect(user1).withdrawalETH(owner.address, withdrawAmountETH);
                await wETHtx.wait();
                
                const balanceOwnerAfter = await token.balanceOf(owner);
                const balanceETHOwnerAfter = await ethers.provider.getBalance(owner);

                expect(balanceOwnerAfter - balanceOwnerBefore).eq(withdrawAmount);
                expect(await token.balanceOf(market.target)).to.eq(tokenContractBalanceAfterPayment - withdrawAmount);
                expect(balanceETHOwnerAfter - balanceETHOwnerBefore).to.eq(withdrawAmountETH);
                
                await expect(wTx).to.emit(market, "Withdrawn").withArgs(token.target, owner.address, withdrawAmount);
                await expect(wETHtx).to.emit(market, "WithdrawnETH").withArgs(owner.address, withdrawAmountETH);

                await expect(market.connect(user1).withdrawal(token.target, owner.address, tokenContractBalanceAfterPayment + 1n))
                    .to.be.revertedWithCustomError(market, "NotEnoughFunds");
                await expect(market.connect(user1).withdrawal(token.target, ethers.ZeroAddress, withdrawAmount))
                    .to.be.revertedWithCustomError(market, "ZeroAddress");
                await expect(market.connect(user1).withdrawal(token.target, owner.address, 0n))
                    .to.be.revertedWithCustomError(market, "ZeroAmount");

                await expect(market.withdrawal(token.target, owner.address, withdrawAmount))
                    .to.be.revertedWithCustomError(market, "AccessManagedUnauthorized");

                await setTreasuryRole(owner);

                const balanceUser1Before2 = await token.balanceOf(user1);
                const balanceETHUser1Before2 = await ethers.provider.getBalance(user1);
                const tokenContractBalanceAfterPayment2 = await token.balanceOf(market.target);

                const wwTx = await market.connect(owner).withdrawal(token.target, user1.address, withdrawAmount);
                await wwTx.wait();
                await expect(wwTx).to.emit(market, "Withdrawn").withArgs(token.target, user1.address, withdrawAmount);

                const wwETHTx = await market.connect(owner).withdrawalETH(user1.address, withdrawAmountETH);
                await wwETHTx.wait();
                await expect(wwETHTx).to.emit(market, "WithdrawnETH").withArgs(user1.address, withdrawAmountETH)

                const balanceUser1After2 = await token.balanceOf(user1);
                const balanceETHUser1After2 = await ethers.provider.getBalance(user1);

                expect(balanceUser1After2 - balanceUser1Before2).eq(withdrawAmount);
                expect(await token.balanceOf(market.target)).to.eq(tokenContractBalanceAfterPayment2 - withdrawAmount);
                expect(balanceETHUser1After2 - balanceETHUser1Before2).to.eq(withdrawAmountETH);
            })
            it("withdrawalETH succeeds when amount equals exact contract balance", async function() {
                const paymentAmountETH = ethers.parseEther("2");
                const orderId = "Pump2a";

                const txETH = await market.connect(user2).payWithETH(orderId, {value: paymentAmountETH});
                await txETH.wait();

                const contractBalance = await ethers.provider.getBalance(market.target);
                expect(contractBalance).to.eq(paymentAmountETH);

                const wTX = await market.connect(user1).withdrawalETH(owner.address, contractBalance);
                await wTX.wait();

                expect(await ethers.provider.getBalance(market.target)).to.eq(0n);
                await expect(wTX).to.emit(market, "WithdrawnETH").withArgs(owner.address, contractBalance);
            })
            it("Withdraw All + WithdrawETH successfully if specific role set to user", async function() {
                const paymentAmount = 5000n;
                const orderId = "Pump2a";
                const paymentAmountETH = ethers.parseEther("5");

                await payToken(user2, paymentAmount, orderId, market, token);

                const txETH = await market.connect(user2).payWithETH("Pump2a-ETH", {value: paymentAmountETH})

                const tokenContractBalanceAfterPayment = await token.balanceOf(market.target);
                const balanceETHContractAfterPayment = await ethers.provider.getBalance(market.target);
                expect(tokenContractBalanceAfterPayment).to.eq(paymentAmount);
                
                const balanceOwnerBefore = await token.balanceOf(owner);
                const balanceETHOwnerBefore = await ethers.provider.getBalance(owner);
                
                const wTx = await market.connect(user1).withdrawalAll(token.target, owner.address);
                await wTx.wait();

                const wETHtx = await market.connect(user1).withdrawalAllETH(owner.address);
                await wETHtx.wait();
                
                const balanceOwnerAfter = await token.balanceOf(owner);
                const balanceETHOwnerAfter = await ethers.provider.getBalance(owner);

                expect(balanceOwnerAfter - balanceOwnerBefore).eq(tokenContractBalanceAfterPayment);
                expect(await token.balanceOf(market.target)).to.eq(0);
                expect(balanceETHOwnerAfter - balanceETHOwnerBefore).to.eq(balanceETHContractAfterPayment);
                
                await expect(wTx).to.emit(market, "WithdrawnAll").withArgs(token.target, owner.address, tokenContractBalanceAfterPayment);
                await expect(wETHtx).to.emit(market, "WithdrawnETHAll").withArgs(owner.address, balanceETHContractAfterPayment);

            })
        })
        
    })
})