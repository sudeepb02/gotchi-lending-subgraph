import { BigInt, Bytes, Address, log, ethereum } from "@graphprotocol/graph-ts";
import {
  AavegotchiDiamond,
  GotchiLendingAdd,
  GotchiLendingEnd,
  GotchiLendingExecute,
  GotchiLendingClaim,
  GotchiLendingCancel,
  WhitelistCreated,
  WhitelistUpdated,
} from "../generated/AavegotchiDiamond/AavegotchiDiamond";
import { Account, GotchiLending, Whitelist } from "../generated/schema";

const FUD = Address.fromHexString("0x403e967b044d4be25170310157cb1a4bf10bdd0f");
const FOMO = Address.fromHexString(
  "0x44a6e0be76e1d9620a7f76588e4509fe4fa8e8c8"
);
const ALPHA = Address.fromHexString(
  "0x6a3e7c3c6ef65ee26975b12293ca1aad7e1daed2"
);
const KEK = Address.fromHexString("0x42e5e06ef5b90fe15f853f59299fc96259209c5c");

export function handleGotchiLendingAdd(event: GotchiLendingAdd): void {
  let lending = GotchiLending.load(event.params.listingId.toString());
  if (!lending) {
    lending = createNewGotchiLending(event.params.listingId, event.address);
  }
  lending.save();
}

export function handleGotchiLendingEnd(event: GotchiLendingEnd): void {
  let lending = GotchiLending.load(event.params.listingId.toString());
  if (!lending) {
    lending = createNewGotchiLending(event.params.listingId, event.address);
  }
  lending.completed = true;
  lending.endTimestamp = event.block.timestamp;
  lending.actualPeriod = event.block.timestamp.minus(lending.startTimestamp);
  lending.save();
}

export function handleGotchiLendingExecute(event: GotchiLendingExecute): void {
  let lending = GotchiLending.load(event.params.listingId.toString());
  if (!lending) {
    lending = createNewGotchiLending(event.params.listingId, event.address);
  }

  let contract = AavegotchiDiamond.bind(event.address);
  let response = contract.try_getGotchiLendingListingInfo(
    event.params.listingId
  );
  if (!response.reverted) {
    let listingResult = response.value.value0;
    createNewUser(listingResult.borrower.toHex());
    lending.borrower = listingResult.borrower.toHex();
  }

  lending.started = true;
  lending.startTimestamp = event.block.timestamp;
  lending.save();
}

export function handleGotchiLendingClaim(event: GotchiLendingClaim): void {
  log.info("Handle gotchi lending triggered ", []);
  let lending = GotchiLending.load(event.params.listingId.toString());
  // Lending will always exists on Lending claim event trigger
  if (lending) {
    let tokens = event.params.tokenAddresses;
    let amounts = event.params.amounts;
    for (let index = 0; index < tokens.length; index++) {
      const token = tokens[index];
      const amount = amounts[index];
      if (token.equals(FUD)) {
        lending.claimedFUD = lending.claimedFUD.plus(amount);
        lending.fudEquivalent = lending.fudEquivalent.plus(amount);
      } else if (token.equals(FOMO)) {
        lending.claimedFOMO = lending.claimedFOMO.plus(amount);
        lending.fudEquivalent = lending.fudEquivalent.plus(amount.times(BigInt.fromI32(2)));
      } else if (token.equals(ALPHA)) {
        lending.claimedALPHA = lending.claimedALPHA.plus(amount);
        lending.fudEquivalent = lending.fudEquivalent.plus(amount.times(BigInt.fromI32(4)));
      } else if (token.equals(KEK)) {
        lending.claimedKEK = lending.claimedKEK.plus(amount);
        lending.fudEquivalent = lending.fudEquivalent.plus(amount.times(BigInt.fromI32(10)));
      }
      log.info("Claimed {} amount of token {}", [
        amount.toString(),
        token.toHexString(),
      ]);
      lending.totalAlchemica = lending.totalAlchemica.plus(amount);
      lending.save();
    }
  }
}

export function handleGotchiLendingCancel(event: GotchiLendingCancel): void {
  // let lending = getOrCreateGotchiLending(event.params.listingId);
  let lending = GotchiLending.load(event.params.listingId.toString());
  if (lending) {
    lending.cancelled = true;
    lending.save();
  }
}

export function handleWhitelistCreated(event: WhitelistCreated): void {
  createOrUpdateWhitelist(event.params.whitelistId, event);
}

export function handleWhitelistUpdated(event: WhitelistUpdated): void {
  createOrUpdateWhitelist(event.params.whitelistId, event);
}

function createNewGotchiLending(
  listingId: BigInt,
  eventAddress: Address
): GotchiLending {
  let lending = new GotchiLending(listingId.toString());
  let contract = AavegotchiDiamond.bind(eventAddress);
  let response = contract.try_getGotchiLendingListingInfo(listingId);
  if (response.reverted) {
    return new GotchiLending("0");
  }

  let listingResult = response.value.value0;
  let gotchiResult = response.value.value1;

  lending.gotchiId = gotchiResult.tokenId;
  lending.gotchiBRS = gotchiResult.baseRarityScore;

  lending.agreedPeriod = listingResult.period;
  lending.actualPeriod = BigInt.zero();
  lending.startTimestamp = BigInt.zero();
  lending.endTimestamp = BigInt.zero();

  lending.upfrontCost = listingResult.initialCost;
  lending.splitOwner = listingResult.revenueSplit[0];
  lending.splitBorrower = listingResult.revenueSplit[1];
  lending.splitOther = listingResult.revenueSplit[2];

  lending.whitelist = listingResult.whitelistId.toString()

  createNewUser(listingResult.lender.toHex());
  createNewUser(listingResult.borrower.toHex());
  createNewUser(listingResult.thirdParty.toHex());

  lending.lender = listingResult.lender.toHex();
  lending.borrower = listingResult.borrower.toHex();
  lending.thirdPartyAddress = listingResult.thirdParty.toHex();

  lending.started = false;
  lending.cancelled = false;
  lending.completed = false;

  lending.claimedFUD = BigInt.zero();
  lending.claimedFOMO = BigInt.zero();
  lending.claimedALPHA = BigInt.zero();
  lending.claimedKEK = BigInt.zero();
  lending.fudEquivalent = BigInt.zero();
  lending.totalAlchemica = BigInt.zero();

  lending.save();
  return lending;
}

function createNewUser(userAddress: string): void {
  let account = Account.load(userAddress);
  if (!account) {
    account = new Account(userAddress);
    account.save();
  }
}

export function createOrUpdateWhitelist(
  id: BigInt,
  event: ethereum.Event
): Whitelist | null {
  let contract = AavegotchiDiamond.bind(event.address);
  let response = contract.try_getWhitelist(id);

  if (response.reverted) {
    return null;
  }

  let result = response.value;

  let members = result.addresses;
  let name = result.name;

  let whitelist = Whitelist.load(id.toString());
  if (!whitelist) {
    whitelist = new Whitelist(id.toString());
    whitelist.ownerAddress = result.owner;
    whitelist.name = name;
  }

  whitelist.members = members.map<Bytes>((e) => e);

  whitelist.save();
  return whitelist;
}