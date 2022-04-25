const { ethers } = require("hardhat")

const ADDRESS_ZERO = "0x0000000000000000000000000000000000000000"

async function advanceTimeBy(time) {
  await ethers.provider.send('evm_increaseTime', [time])
}

module.exports = {
  ADDRESS_ZERO, advanceTimeBy
}
