# lending-contract
ERC20 Token Lending

## Overview

A simple decentralized application that allows users to borrow tokens against a collateral in ETH.
When the loan is repaid (plus interest), the collateral is returned to the user. Users can only have one active loan at a time.
Loans have a 30 day limit.

## Requirements
1. Create an ERC20 token with 18 decimal places to serve as the token that can be borrowed.

2. Create a Lending functionality (contract(s)) that allows:
- Users to borrow tokens sending ETH as collateral (define a custom ETH-to-token ratio for lending)
- Users to repay their loans with interest (interest calculation should be very simple)
- Lending contract(s) owner to claim collateral if loan is not paid off in time

3. Create a minimalistic frontend service that integrates with the Lending contract(s) using web3.js/ethers.js, Moralis API or other library of your choice. This service should allow:
- Users to request to borrow tokens
- Users to repay loan
- Lending contract(s) owner to see total number of loans + total number of tokens currently borrowed to all users

## Configuration & Deployment
### Installation
```
npm install
```

### Deployment
```
npx hardhat --network [NETWORK_NAME] deploy.js
```

### Test
```
npx hardhat test
```

You can test the features by using `npx hardhat node` and `npx hardhat console` if you're familiar with hardhat console.

To see the coverage report, run `npx hardhat coverage`.
