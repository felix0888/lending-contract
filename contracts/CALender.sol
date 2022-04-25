//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "hardhat/console.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract CALender is Ownable {

    using SafeERC20 for IERC20;

    struct LoanInfo {
        address reserve;
        bool repaid;
        bool collateralClaimed;
        uint borrowTimestamp;
        uint collateralETH;
        uint borrowAmount;
    }

    mapping (address => uint) public loanRatios;

    mapping (address => LoanInfo) public userLoans;

    uint public interestRate;

    uint public constant RATE_NUMERATOR = 1e4;
    uint public constant LOAN_LIMIT = 30 days;

    constructor(uint _interestRate) {
        setInterestRate(_interestRate);
    }

    function setInterestRate(uint _interestRate) public onlyOwner {
        interestRate = _interestRate;
    }

    function setLoanRatio(address _reserve, uint _ratio) external onlyOwner {
        require(_reserve != address(0), "CALender: invalid reserve");
        require(_ratio > 0, "CALender: invalid ratio");
        loanRatios[_reserve] = _ratio;
    }

    function deposit(address _reserve, uint _amount) external {
        require(_reserve != address(0), "CALender: invalid reserve");
        IERC20(_reserve).safeTransferFrom(msg.sender, address(this), _amount);
    }

    function borrow(address _reserve) external payable {
        require(_reserve != address(0), "CALender: invalid reserve");
        require(msg.value > 0, "CALender: insufficient ETH");

        LoanInfo storage userLoan = userLoans[msg.sender];
        require(userLoan.borrowTimestamp == 0 || userLoan.repaid, "CALender: repay required");

        uint borrowAmount = msg.value * loanRatios[_reserve] / RATE_NUMERATOR;
        require(IERC20(_reserve).balanceOf(address(this)) > borrowAmount, "CALender: insufficient reserve");

        userLoan.reserve = _reserve;
        userLoan.collateralETH = msg.value;
        userLoan.borrowAmount = borrowAmount;
        userLoan.borrowTimestamp = block.timestamp;

        IERC20(_reserve).safeTransfer(msg.sender, borrowAmount);
    }

    function repay(address _reserve, uint _amount) external {
        LoanInfo storage userLoan = userLoans[msg.sender];
        require(!userLoan.repaid, "CALender: already repaid");
        require(block.timestamp - userLoan.borrowTimestamp <= LOAN_LIMIT, "CALender: loan expired");

        uint interestToPay = userLoan.borrowAmount * (block.timestamp - userLoan.borrowTimestamp) / 30 days;
        interestToPay = interestToPay * interestRate / RATE_NUMERATOR;
        uint amountToRepay = userLoan.borrowAmount + interestToPay;

        require(_amount >= amountToRepay, "CALender: insufficient repay");

        userLoan.repaid = true;
        IERC20(_reserve).safeTransferFrom(msg.sender, address(this), amountToRepay);
        (bool success, ) = payable(msg.sender).call{ value: userLoan.collateralETH }("");
        require(success, "CALender: ETH transfer failed");
    }

    function claimCollateral(address _user) external onlyOwner {
        LoanInfo storage userLoan = userLoans[_user];
        require(!userLoan.repaid, "CALender: loan repaid");
        require(!userLoan.collateralClaimed, "CALender: collateral claimed");
        require(block.timestamp - userLoan.borrowTimestamp > LOAN_LIMIT, "CALender: loan not expired");

        userLoan.collateralClaimed = true;
        (bool success, ) = payable(msg.sender).call{ value: userLoan.collateralETH }("");
        require(success, "CALender: claim collateral failed");
    }
}
