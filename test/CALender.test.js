const { expect } = require("chai");
const { ethers } = require("hardhat");

const { ADDRESS_ZERO, advanceTimeBy } = require("./utils")

describe("CALender", () => {
  let caLender;
  let mockERC20;
  let owner, alice, bob, carol, signers;
  let caBalanceBefore, caBalanceAfter, aliceBalanceBefore, aliceBalanceAfter, bobBalanceBefore, bobBalanceAfter;
  let caETHBefore, caETHAfter, aliceETHBefore, aliceETHAfter, bobETHBefore, bobETHAfter, carolETHBefore, carolETHAfter;

  beforeEach(async () => {
    [owner, alice, bob, carol, signers] = await ethers.getSigners();
    caLender = await ethers
      .getContractFactory("CALender")
      .then((factory) => factory.deploy(500));
    await caLender.deployed();

    mockERC20 = await ethers
      .getContractFactory("MockERC20")
      .then((factory) => factory.deploy("CA Token", "CAT", ethers.utils.parseEther("1000000")));

    await mockERC20.connect(owner).transfer(alice.address, ethers.utils.parseEther("100000"));
    await mockERC20.connect(owner).transfer(bob.address, ethers.utils.parseEther("1000"));
    await mockERC20.connect(alice).approve(caLender.address, ethers.utils.parseEther("50000"));
    await mockERC20.connect(bob).approve(caLender.address, ethers.utils.parseEther("3150"));
  });

  describe("deployment", () => {
    it("should set the interest rate", async () => {
      expect(await caLender.interestRate()).to.equal(500);
    });
  });

  describe("#setInterestRate", () => {
    it("should be reverted if non-owner tries", async () => {
      await expect(
        caLender.connect(alice).setInterestRate(500)
      ).to.be.reverted;
    });

    it("should set the interest rate", async () => {
      await caLender.setInterestRate(300);
      expect(await caLender.interestRate()).to.equal(300);
    });
  });

  describe("#setLoanRatio", () => {
    it("should fail if non-owner tries", async () => {
      await expect(caLender.connect(alice).setLoanRatio(mockERC20.address, 3000 * 1e4))
        .to.be.reverted;
    });

    it("should fail if zero address is given", async () => {
      await expect(caLender.setLoanRatio(ADDRESS_ZERO, 3000 * 1e4))
        .to.be.revertedWith("CALender: invalid reserve");
    });

    it("should fail if ratio is zero", async () => {
      await expect(caLender.setLoanRatio(mockERC20.address, 0))
        .to.be.revertedWith("CALender: invalid ratio");
    });

    it("should set the loan ratio for ERC20 token against ETH", async () => {
      await caLender.setLoanRatio(mockERC20.address, 3000 * 1e4);
      expect(await caLender.loanRatios(mockERC20.address)).to.equal(3000 * 1e4);
    });
  });

  describe("#deposit", () => {
    it("should be reverted if zero address is given", async () => {
      await expect(caLender.connect(alice).deposit(ADDRESS_ZERO, ethers.utils.parseEther("10000")))
        .to.be.revertedWith("CALender: invalid reserve");
    });

    it("should transfer ERC20 token to the contract", async () => {
      aliceBalanceBefore = await mockERC20.balanceOf(alice.address);
      caBalanceBefore = await mockERC20.balanceOf(caLender.address);
      await caLender.connect(alice).deposit(mockERC20.address, ethers.utils.parseEther("10000"));

      aliceBalanceAfter = await mockERC20.balanceOf(alice.address);
      caBalanceAfter = await mockERC20.balanceOf(caLender.address);
      expect(aliceBalanceBefore.sub(aliceBalanceAfter)).to.equal(ethers.utils.parseEther("10000"));
      expect(caBalanceAfter.sub(caBalanceBefore)).to.equal(ethers.utils.parseEther("10000"));
    });
  });

  describe("#borrow", () => {
    beforeEach(async () => {
      await caLender.connect(alice).deposit(mockERC20.address, ethers.utils.parseEther("30000"));
      await caLender.setLoanRatio(mockERC20.address, 3000 * 1e4);
    });

    it("should be reverted if zero address is given", async () => {
      await expect(caLender.connect(bob).borrow(ADDRESS_ZERO, { value: ethers.utils.parseEther("1") }))
        .to.be.revertedWith("CALender: invalid reserve");
    });

    it("should be reverted if no ETH is given", async () => {
      await expect(caLender.connect(bob).borrow(mockERC20.address, { value: 0 }))
        .to.be.revertedWith("CALender: insufficient ETH");
    });

    it("should be reverted if requested borrow amount if larger than reserve amount", async () => {
      await expect(caLender.connect(bob).borrow(mockERC20.address, { value: ethers.utils.parseEther("11") }))
        .to.be.revertedWith("CALender: insufficient reserve");
    });

    it("should create a loan of given token and paid ETH for the user", async () => {
      caETHBefore = await ethers.provider.getBalance(caLender.address);
      bobETHBefore = await ethers.provider.getBalance(bob.address);

      await caLender.connect(bob).borrow(mockERC20.address, { value: ethers.utils.parseEther("1") });

      const userLoan = await caLender.userLoans(bob.address);
      expect(userLoan.reserve).to.equal(mockERC20.address);
      expect(userLoan.collateralETH).to.equal(ethers.utils.parseEther("1"));
      expect(userLoan.borrowAmount).to.equal(ethers.utils.parseEther("3000"));
      expect(userLoan.repaid).to.equal(false);
      expect(userLoan.borrowTimestamp).not.to.be.equal(0);

      caETHAfter = await ethers.provider.getBalance(caLender.address);
      bobETHAfter = await ethers.provider.getBalance(bob.address);

      expect(caETHAfter.sub(caETHBefore)).to.equal(ethers.utils.parseEther("1"));
      expect(bobETHBefore.sub(bobETHAfter))
        .to.be.within(ethers.utils.parseEther("1"), ethers.utils.parseEther("1.001")); // include gas fee

      expect(caLender.connect(carol).borrow(mockERC20.address, { value: ethers.utils.parseEther("2") }))
        .not.to.be.reverted;
    });

    it("should be reverted if user has a un-reapid loan", async () => {
      await caLender.connect(bob).borrow(mockERC20.address, { value: ethers.utils.parseEther("1") });
      expect(caLender.connect(bob).borrow(mockERC20.address, { value: ethers.utils.parseEther("2") }))
        .to.be.revertedWith("CALender: repay required");
    });
  });

  describe("#repay", () => {
    beforeEach(async () => {
      await caLender.connect(alice).deposit(mockERC20.address, ethers.utils.parseEther("30000"));
      await caLender.setLoanRatio(mockERC20.address, 3000 * 1e4);
      await caLender.connect(bob).borrow(mockERC20.address, { value: ethers.utils.parseEther("1") });
    });

    it("should repay, refund collateral ETH back and set loan repaid status - 1", async () => {
      await advanceTimeBy(60*60*24*30);
      caBalanceBefore = await mockERC20.balanceOf(caLender.address);
      bobBalanceBefore = await mockERC20.balanceOf(bob.address);
      caETHBefore = await ethers.provider.getBalance(caLender.address);
      bobETHBefore = await ethers.provider.getBalance(bob.address);
      await caLender.connect(bob).repay(mockERC20.address, ethers.utils.parseEther("3150"));

      const userLoan = await caLender.userLoans(bob.address);
      expect(userLoan.repaid).to.equal(true);

      caBalanceAfter = await mockERC20.balanceOf(caLender.address);
      bobBalanceAfter = await mockERC20.balanceOf(bob.address);
      caETHAfter = await ethers.provider.getBalance(caLender.address);
      bobETHAfter = await ethers.provider.getBalance(bob.address);
      expect(caBalanceAfter.sub(caBalanceBefore)).to.equal(ethers.utils.parseEther("3150"));
      expect(bobBalanceBefore.sub(bobBalanceAfter)).to.equal(ethers.utils.parseEther("3150"));
      expect(caETHBefore.sub(caETHAfter)).to.equal(ethers.utils.parseEther("1"));
      expect(bobETHAfter.sub(bobETHBefore))
        .to.be.within(ethers.utils.parseEther("0.999"), ethers.utils.parseEther("1")); // include gas fee
    });

    it("should repay borrow amount + interest and refund collateral ETH back - 2", async () => {
      await advanceTimeBy(60*60*24*15);
      caBalanceBefore = await mockERC20.balanceOf(caLender.address);
      bobBalanceBefore = await mockERC20.balanceOf(bob.address);
      caETHBefore = await ethers.provider.getBalance(caLender.address);
      bobETHBefore = await ethers.provider.getBalance(bob.address);
      await caLender.connect(bob).repay(mockERC20.address, ethers.utils.parseEther("3075"));

      const userLoan = await caLender.userLoans(bob.address);
      expect(userLoan.repaid).to.equal(true);

      caBalanceAfter = await mockERC20.balanceOf(caLender.address);
      bobBalanceAfter = await mockERC20.balanceOf(bob.address);
      caETHAfter = await ethers.provider.getBalance(caLender.address);
      bobETHAfter = await ethers.provider.getBalance(bob.address);
      expect(caBalanceAfter.sub(caBalanceBefore)).to.equal(ethers.utils.parseEther("3075"));
      expect(bobBalanceBefore.sub(bobBalanceAfter)).to.equal(ethers.utils.parseEther("3075"));
      expect(caETHBefore.sub(caETHAfter)).to.equal(ethers.utils.parseEther("1"));
      expect(bobETHAfter.sub(bobETHBefore))
        .to.be.within(ethers.utils.parseEther("0.999"), ethers.utils.parseEther("1")); // include gas fee
    });

    it("should be reverted if loan is already repaid", async () => {
      await advanceTimeBy(60*60*24*30);
      await caLender.connect(bob).repay(mockERC20.address, ethers.utils.parseEther("3150"));
      await expect(caLender.connect(bob).repay(mockERC20.address, ethers.utils.parseEther("3150")))
        .to.be.revertedWith("CALender: already repaid");
    });

    it("should be reverted if loan period is surpassed", async () => {
      await advanceTimeBy(60*60*24*31);
      await expect(caLender.connect(bob).repay(mockERC20.address, ethers.utils.parseEther("3150")))
        .to.be.revertedWith("CALender: loan expired");
    });

    it("should be reverted if repay ERC20 token is not enough", async () => {
      await advanceTimeBy(60*60*24*30);
      await expect(caLender.connect(bob).repay(mockERC20.address, ethers.utils.parseEther("3100")))
        .to.be.revertedWith("CALender: insufficient repay");
    });
  });

  describe("#claimCollateral", () => {
    beforeEach(async () => {
      await caLender.connect(alice).deposit(mockERC20.address, ethers.utils.parseEther("30000"));
      await caLender.setLoanRatio(mockERC20.address, 3000 * 1e4);
      await caLender.connect(bob).borrow(mockERC20.address, { value: ethers.utils.parseEther("1") });
    });

    it("should be reverted if non-owner tries", async () => {
      await expect(caLender.connect(alice).claimCollateral(bob.address))
        .to.be.reverted;
    });

    it("should be reverted if loan is repaid", async () => {
      await advanceTimeBy(60*60*24*30);
      await caLender.connect(bob).repay(mockERC20.address, ethers.utils.parseEther("3150"));
      await expect(caLender.connect(owner).claimCollateral(bob.address))
        .to.be.revertedWith("CALender: loan repaid");
    });

    it("should be reverted if loan collateral is claimed", async () => {
      await advanceTimeBy(60*60*24*31);
      await caLender.connect(owner).claimCollateral(bob.address);
      await expect(caLender.connect(owner).claimCollateral(bob.address))
        .to.be.revertedWith("CALender: collateral claimed");
    });

    it("should be reverted if loan is not expired", async () => {
      await advanceTimeBy(60*60*24*30);
      await expect(caLender.connect(owner).claimCollateral(bob.address))
        .to.be.revertedWith("CALender: loan not expired");
    });

    it("should transfer the collateral to the owner", async () => {
      await advanceTimeBy(60*60*24*31);
      await expect(await caLender.connect(owner).claimCollateral(bob.address))
        .to.changeEtherBalances([owner, caLender], [ethers.utils.parseEther("1"), ethers.utils.parseEther("-1")])
    });
  });
});
