const {deployAll, UPDATER_1, UPDATER_2, addFastPriceFeedUpdaters, USER_1, POSITION_ROUTER_EXECUTION_FEE,
  addFastPriceFeedTokens
} = require("./setup-common");
const {updatePriceBitsAndOptionallyExecute} = require("./keeper-common");
const {expandDecimals} = require("../../test/shared/utilities");
const {toUsd} = require("../../test/shared/units");
const {sleep} = require("../shared/helpers");

async function main() {
  const {positionRouter, router, fastPriceFeed, vault, weth, atom} = await deployAll()
  const tokens = [{symbol: "ETH", precision: 100_000, address: weth.address}, {symbol: "ATOM", precision: 100_000, address: atom.address}]
  await addFastPriceFeedUpdaters(fastPriceFeed, [UPDATER_1.address, UPDATER_2.address])
  await addFastPriceFeedTokens(fastPriceFeed, tokens)
  await openPosition(positionRouter, router, weth, weth)

  await updatePriceBitsAndOptionallyExecute(tokens, fastPriceFeed, positionRouter, UPDATER_1)

  const pricesInFeed1 = await checkPricesInFeed(fastPriceFeed, tokens)
  console.log(`Prices in feed ${JSON.stringify(pricesInFeed1)}`)
  console.log(`GMX Position: ${JSON.stringify(await getPosition(vault, weth))}`)

  await sleep(60_000) // wait for price noticeably change

  await updatePriceBitsAndOptionallyExecute(tokens, fastPriceFeed, positionRouter, UPDATER_2)
  const pricesInFeed2 = await checkPricesInFeed(fastPriceFeed, tokens)
  console.log(`Prices in feed ${JSON.stringify(pricesInFeed2)}`)

  console.log("Prices in feed changes")
  pricesInFeed1.forEach((priceInFeed1, index) => console.log(`${priceInFeed1.token}: ${priceInFeed1.price} -> ${pricesInFeed2[index].price}`))
}

async function openPosition(positionRouter, router, collateralToken, indexToken) {
  console.log("Increasing position")

  await router.connect(USER_1).approvePlugin(positionRouter.address)
  await collateralToken.connect(USER_1).approve(router.address, expandDecimals(1, 18))

  const tx = await positionRouter.connect(USER_1).createIncreasePosition(
    [collateralToken.address], // _path
    indexToken.address, // _indexToken
    expandDecimals(1, 18), // _amountIn
    0, // _minOut
    toUsd(6000), // _sizeDelta
    true, // _isLong
    toUsd(10_000), // _acceptablePrice,
    POSITION_ROUTER_EXECUTION_FEE, // _executionFee
    ethers.constants.HashZero, // _referralCode
    ethers.constants.AddressZero, // _callbackTarget
    { value: POSITION_ROUTER_EXECUTION_FEE } // msg.value
  )
  await tx.wait()
}

async function checkPricesInFeed(fastPriceFeed, tokens) {
  return await Promise.all(tokens.map(async token => {
    return {token: token.symbol, price: ethers.utils.formatUnits(await fastPriceFeed.prices(token.address), 30)}
  }))
}

async function getPosition(vault, token) {
  const position = await vault.getPosition(
    USER_1.address, // _account
    token.address, // _collateralToken
    token.address, // _indexToken
    true // _isLong
  )
  return {
    size: ethers.utils.formatUnits(position[0], 30),
    collateral: ethers.utils.formatUnits(position[1], 30),
    averagePrice: ethers.utils.formatUnits(position[2], 30),
    entryFundingRate: ethers.utils.formatUnits(position[3], 30),
    reserveAmount: ethers.utils.formatUnits(position[4], 30),
    realisedPnl: ethers.utils.formatUnits(position[5], 30),
    hasProfit: position[6],
    lastIncreasedTime: ethers.utils.formatUnits(position[7], 30)
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })