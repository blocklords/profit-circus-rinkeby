import { BigInt } from "@graphprotocol/graph-ts"
import {
  Contract,
  Claimed,
  Deposited,
  FactorySet,
  OwnershipTransferred,
  SessionStarted,
  Withdrawn
} from "../generated/Contract/Contract"
import { Session, Balance } from "../generated/schema"



export function handleClaimed(event: Claimed): void {
  let sessionId = event.params.sessionId.toHex()
  let balanceId = sessionId + "-" + event.params.owner.toHex();

  let balance = Balance.load(balanceId)
  if (balance == null) {
    return;
  }

  let session = Session.load(sessionId)
  if (session == null) {
    return;
  }

	updateInterestPerToken(event.block.timestamp, session)

  updateClaiming(event.block.timestamp, session, balance)

  updateBalanceInterestPerToken(session, balance)

  session.save()
  balance.save()
}


function updateBalanceInterestPerToken(session: Session | null, balance: Balance | null): (Balance | null) {
  if (session == null || balance == null) {
    return balance
  }

  balance.claimedReward = session.claimedPerToken.plus(balance.amount);

  return balance
}

function isActive(now: BigInt, session: Session | null): boolean {
  if (session == null) {
    return false
  }

  let endTime = session.startTime.plus(session.period)

  // _endTime will be 0 if session never started.
  if (now < session.startTime || now > endTime) {
      return false
  }

  return true
}

function calculateInterest(timestamp: BigInt, session: Session | null, balance: Balance | null): BigInt {
  if (balance == null || session == null) {
    return BigInt.fromI32(0)
  }

		// How much of total deposit is belong to player as a floating number
		if (balance.amount.isZero() || session.amount.isZero()) {
			return BigInt.fromI32(0);
		}

		let sessionCap = timestamp;
		if (isActive(timestamp, session) == false) {
			sessionCap = session.startTime.plus(session.period)

			// claimed after session expire, means no any claimables
			if (balance.claimedTime >= sessionCap) {
				return BigInt.fromI32(0);
			}
		}
    let claimedPerToken = session.claimedPerToken.plus((sessionCap.minus(session.lastInterestUpdate)).times(session.interestPerToken))
		// (balance * total claimable) - user deposit earned amount per token - balance.claimedTime
    let	interest = balance.amount.times(claimedPerToken).minus(balance.claimedReward)

		return interest;
}

function updateClaiming(timestamp: BigInt, session: Session | null, balance: Balance | null): void {
  if (session == null || balance == null) {
    return
  }

  let interest = calculateInterest(timestamp, session, balance)
  if (interest.isZero()) {
    return
  }

  // we avoid sub. underflow, for calulating session.claimedPerToken
  if (isActive(timestamp, session) == false) {
    balance.claimedTime = session.startTime.plus(session.period)
  } else {
    balance.claimedTime = timestamp
  }
  session.claimed     = session.claimed.plus(interest)
  session.claimed     = session.claimed.plus(interest)
}

function updateInterestPerToken(timestamp: BigInt, session: Session | null): (Session | null) {
  if (session == null) {
    return session
  }
  let timeDuration = timestamp.minus(session.lastInterestUpdate)
  
  // I calculate previous claimed rewards
  // (session.claimedPerToken += (now - session.lastInterestUpdate) * session.interestPerToken)
	session.claimedPerToken = session.claimedPerToken.plus(timeDuration.times(session.interestPerToken))

  // I record that interestPerToken is 0.1 CWS (rewardUnit/amount) in session.interestPerToken
  // I update the session.lastInterestUpdate to now
  if (session.amount.isZero()) {
		session.interestPerToken = BigInt.fromI32(0)
	} else {
	  session.interestPerToken = session.rewardUnit.div(session.amount) // 0.1
	}

	// we avoid sub. underflow, for calulating session.claimedPerToken
	session.lastInterestUpdate = timestamp

  return session
}

export function handleDeposited(event: Deposited): void {}

export function handleFactorySet(event: FactorySet): void {}

export function handleOwnershipTransferred(event: OwnershipTransferred): void {}

export function handleSessionStarted(event: SessionStarted): void {
  // Entities can be loaded from the store using a string ID; this ID
  // needs to be unique across all entities of the same type
  let session = Session.load(event.params.sessionIdd.toHex())

  // Entities only exist after they have been saved to the store;
  // `null` checks allow to create entities on demand
  if (session == null) {
    session = new Session(event.params.sessionIdd.toHex())
    session.transaction = event.transaction.from.toHex()
  }


  session.stakingToken = event.params.stakingToken // staked token, users earn CWS token
  session.totalReward = event.params.reward        // amount of CWS to airdrop
  session.period = event.params.endTime.minus(event.params.startTime)         		  // session duration in seconds
	session.startTime = event.params.startTime     		  // session start in unixtimestamp
	session.generation = event.params.generation    		  // Seascape Nft generation given for minted NFT in the game
	session.claimed = BigInt.fromI32(0)       		  // amount of already claimed CWS
	session.amount = BigInt.fromI32(0)        		  // total amount of deposited tokens to the session by users
	session.rewardUnit = event.params.reward.div(session.period)    		  // reward per second = totalReward/period
	session.interestPerToken = BigInt.fromI32(0) 	// total earned interest per token since the beginning of the session
	session.claimedPerToken = BigInt.fromI32(0)    // total amount of tokens earned by a one staked token, since the beginning of the session
	session.lastInterestUpdate = event.params.startTime // last time when claimedPerToken and interestPerToken


  // Entities can be written to the store with `.save()`
  session.save()

  // Note: If a handler doesn't require existing field values, it is faster
  // _not_ to load the session from the store. Instead, create it fresh with
  // `new session(...)`, set the fields that should be updated and save the
  // session back to the store. Fields that were not set or unset remain
  // unchanged, allowing for partial updates to be applied.

  // It is also possible to access smart contracts from mappings. For
  // example, the contract that has emitted the event can be connected to
  // with:
  //
  // let contract = Contract.bind(event.address)
  //
  // The following functions can then be called on this contract to access
  // state variables and other data:
  //
  // - contract.CWS(...)
  // - contract.balances(...)
  // - contract.depositTimes(...)
  // - contract.lastSessionIds(...)
  // - contract.owner(...)
  // - contract.sessions(...)
  // - contract.claim(...)
  // - contract.stakedBalanceOf(...)
  // - contract.earned(...)
  // - contract.claimable(...)
  // - contract.stakedBalance(...)

}

export function handleWithdrawn(event: Withdrawn): void {}
