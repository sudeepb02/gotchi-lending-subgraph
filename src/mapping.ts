import { BigInt, Address } from "@graphprotocol/graph-ts"
import {
  AavegotchiDiamond,
  GotchiLendingAdd,
  GotchiLendingEnd,
  GotchiLendingExecute
} from "../generated/AavegotchiDiamond/AavegotchiDiamond"
import { Account, GotchiLending, Whitelist } from "../generated/schema"

export function handleGotchiLendingAdd(event: GotchiLendingAdd): void { 
  let lending = GotchiLending.load(event.params.listingId.toString())
  if (!lending) {
    lending = createNewGotchiLending(event.params.listingId, event.address)
  }
  lending.save();
}

export function handleGotchiLendingEnd(event: GotchiLendingEnd): void {
  let lending = GotchiLending.load(event.params.listingId.toString())
  if (!lending) {
    lending = createNewGotchiLending(event.params.listingId, event.address)
  }
  lending.completed = true
  lending.endTimestamp = event.block.timestamp
  lending.actualPeriod = event.block.timestamp.minus(lending.startTimestamp)
  lending.save()
}

export function handleGotchiLendingExecute(event: GotchiLendingExecute): void {
  let lending = GotchiLending.load(event.params.listingId.toString())
  if (!lending) {
    lending = createNewGotchiLending(event.params.listingId, event.address)
  }

  let contract = AavegotchiDiamond.bind(event.address)
  let response = contract.try_getGotchiLendingListingInfo(event.params.listingId);
  if (!response.reverted) {
    let listingResult = response.value.value0;
    createNewUser(listingResult.borrower.toHex())
    lending.borrower = listingResult.borrower.toHex()
  }

  lending.started = true
  lending.startTimestamp = event.block.timestamp
  lending.save()
}

function createNewGotchiLending(listingId: BigInt, eventAddress: Address): GotchiLending {
  let lending = new GotchiLending(listingId.toString())
  let contract = AavegotchiDiamond.bind(eventAddress)
  let response = contract.try_getGotchiLendingListingInfo(listingId);
  if (response.reverted) {
    return new GotchiLending("0");
  }

  let listingResult = response.value.value0;
  let gotchiResult = response.value.value1;

  lending.gotchiId = gotchiResult.tokenId;

  lending.agreedPeriod = listingResult.period
  lending.actualPeriod = BigInt.zero();
  lending.startTimestamp = BigInt.zero();
  lending.endTimestamp = BigInt.zero();

  lending.upfrontCost = listingResult.initialCost
  lending.splitOwner = listingResult.revenueSplit[0];
  lending.splitBorrower = listingResult.revenueSplit[1];
  lending.splitOther = listingResult.revenueSplit[2];

  // lending.whitelist = 
  createNewUser(listingResult.lender.toHex())
  createNewUser(listingResult.borrower.toHex())
  createNewUser(listingResult.thirdParty.toHex())

  lending.lender = listingResult.lender.toHex();
  lending.borrower = listingResult.borrower.toHex();
  lending.thirdPartyAddress = listingResult.thirdParty.toHex();

  lending.started = false
  lending.cancelled = false
  lending.completed = false

  return lending;
}

function createNewUser(userAddress: string): void {
  let account = Account.load(userAddress)
  if (!account) {
    account = new Account(userAddress)
    account.save()
  }
}