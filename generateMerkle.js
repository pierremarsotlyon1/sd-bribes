const { MerkleTree } = require("merkletreejs");
const keccak256 = require("keccak256");
const fs = require('fs');
const orderBy = require("lodash/orderBy");
const { gql, request } = require("graphql-request");
const axios = require('axios').default;
const { ethers, utils, BigNumber } = require("ethers");

// INFURA
const infura_json = require("./infura.json");
const INFURA_KEY = infura_json.api_key;

// LAST MERKLE
const lastMerkle = require("./lastMerkle.json");

/////////////////////////////////////////////////////////////////////////////////////////////
//          EDIT PROVIDER AS NEEDED:                                                      //
//
const mainnetProvider = new ethers.providers.InfuraProvider("mainnet", INFURA_KEY);

const MULTI_MERKLE_CONTRACT = "0x03e34b085c52985f6a5d27243f20c84bddc01db4";
const MULTI_MERKLE_ABI = [{ "anonymous": false, "inputs": [{ "indexed": true, "internalType": "address", "name": "token", "type": "address" }, { "indexed": false, "internalType": "uint256", "name": "index", "type": "uint256" }, { "indexed": false, "internalType": "uint256", "name": "amount", "type": "uint256" }, { "indexed": true, "internalType": "address", "name": "account", "type": "address" }, { "indexed": true, "internalType": "uint256", "name": "update", "type": "uint256" }], "name": "Claimed", "type": "event" }, { "anonymous": false, "inputs": [{ "indexed": true, "internalType": "address", "name": "token", "type": "address" }, { "indexed": true, "internalType": "bytes32", "name": "merkleRoot", "type": "bytes32" }, { "indexed": true, "internalType": "uint256", "name": "update", "type": "uint256" }], "name": "MerkleRootUpdated", "type": "event" }, { "anonymous": false, "inputs": [{ "indexed": true, "internalType": "address", "name": "previousOwner", "type": "address" }, { "indexed": true, "internalType": "address", "name": "newOwner", "type": "address" }], "name": "OwnershipTransferred", "type": "event" }, { "inputs": [{ "internalType": "address", "name": "token", "type": "address" }, { "internalType": "uint256", "name": "index", "type": "uint256" }, { "internalType": "address", "name": "account", "type": "address" }, { "internalType": "uint256", "name": "amount", "type": "uint256" }, { "internalType": "bytes32[]", "name": "merkleProof", "type": "bytes32[]" }], "name": "claim", "outputs": [], "stateMutability": "nonpayable", "type": "function" }, { "inputs": [{ "internalType": "address", "name": "account", "type": "address" }, { "components": [{ "internalType": "address", "name": "token", "type": "address" }, { "internalType": "uint256", "name": "index", "type": "uint256" }, { "internalType": "uint256", "name": "amount", "type": "uint256" }, { "internalType": "bytes32[]", "name": "merkleProof", "type": "bytes32[]" }], "internalType": "struct MultiMerkleStash.claimParam[]", "name": "claims", "type": "tuple[]" }], "name": "claimMulti", "outputs": [], "stateMutability": "nonpayable", "type": "function" }, { "inputs": [{ "internalType": "address", "name": "token", "type": "address" }, { "internalType": "uint256", "name": "index", "type": "uint256" }], "name": "isClaimed", "outputs": [{ "internalType": "bool", "name": "", "type": "bool" }], "stateMutability": "view", "type": "function" }, { "inputs": [{ "internalType": "address", "name": "", "type": "address" }], "name": "merkleRoot", "outputs": [{ "internalType": "bytes32", "name": "", "type": "bytes32" }], "stateMutability": "view", "type": "function" }, { "inputs": [], "name": "owner", "outputs": [{ "internalType": "address", "name": "", "type": "address" }], "stateMutability": "view", "type": "function" }, { "inputs": [], "name": "renounceOwnership", "outputs": [], "stateMutability": "nonpayable", "type": "function" }, { "inputs": [{ "internalType": "address", "name": "newOwner", "type": "address" }], "name": "transferOwnership", "outputs": [], "stateMutability": "nonpayable", "type": "function" }, { "inputs": [{ "internalType": "address", "name": "", "type": "address" }], "name": "update", "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }], "stateMutability": "view", "type": "function" }, { "inputs": [{ "internalType": "address", "name": "token", "type": "address" }, { "internalType": "bytes32", "name": "_merkleRoot", "type": "bytes32" }], "name": "updateMerkleRoot", "outputs": [], "stateMutability": "nonpayable", "type": "function" }];
const ENDPOINT = "https://hub.snapshot.org/graphql";

const QUERY_VOTES = gql`
	query Proposal(
		$proposal: String!
		$orderBy: String
		$orderDirection: OrderDirection
    $created: Int
	) {
		votes(
      first: 1000
			where: { proposal: $proposal, vp_gt: 0, created_lt: $created }
			orderBy: $orderBy
			orderDirection: $orderDirection
		) {
			id
			ipfs
			voter
			created
			choice
			vp
			vp_by_strategy
		}
	}
`;

const QUERY_PROPOSAL = gql`
	query Proposal(
		$id: String!
	) {
    proposal(id: $id) {
			id
			ipfs
			title
			body
			start
			end
			state
			author
			created
			choices
			snapshot
			type
			strategies {
				name
				params
			}
			space {
				id
				name
				members
				avatar
				symbol
			}
			scores_state
			scores_total
			scores
			votes
		}
	}
`;

const getAllAccountClaimedSinceLastFreeze = async () => {
  const mainnetContract = new ethers.Contract(
    MULTI_MERKLE_CONTRACT,
    MULTI_MERKLE_ABI,
    mainnetProvider
  );
  let filter = await mainnetContract.filters.MerkleRootUpdated(
    null,
    null, // Freeze
    null,
  );
  const updateMerkleEvents = await mainnetContract.queryFilter(filter);

  // We only get the last merkle update (the freeze one)
  const lastUpdateMerkleEvent = updateMerkleEvents[updateMerkleEvents.length - 1];
  const blockNumber = lastUpdateMerkleEvent.blockNumber;

  // Now we get all claimed since the last freeze
  filter = await mainnetContract.filters.Claimed(
    null,
    null,
    null,
    null,
    null,
  );
  const claimed = await mainnetContract.queryFilter(filter, blockNumber);

  // Return all claimed account
  return claimed.map(c => {
    return { account: c.args.account, token: c.args.token };
  });
}

/**
 * Get all votes for a proposal
 */
const getVotes = async (idProposal) => {
  let votes = [];
  let run = true;
  let created = null

  // Fetch all data
  do {
    let params = {
      proposal: idProposal,
      orderBy: "created",
      orderDirection: "desc",
    };

    if (created) {
      params["created"] = created;
    }

    const result = await request(ENDPOINT, QUERY_VOTES, params);

    if (result.votes?.length > 0) {
      votes = votes.concat(result.votes);
      created = result.votes[result.votes.length - 1].created;
    }
    else {
      run = false;
    }

  } while (run);

  return votes;
}

/**
 * Fetch proposal data
 */
const getProposal = async (idProposal) => {
  const result = await request(ENDPOINT, QUERY_PROPOSAL, {
    id: idProposal,
  });
  return result.proposal;
}

const getScores = async (proposal, votes, voters) => {
  const { data } = await axios.post(
    "https://score.snapshot.org/api/scores",
    {
      params: {
        network: "1",
        snapshot: parseInt(proposal.snapshot),
        strategies: proposal.strategies,
        space: proposal.space.id,
        addresses: voters
      },
    },
  );

  const result = data?.result?.scores?.[0];

  const scores = votes.map((vote) => {
    const vp = vote.vp > 0 ? vote.vp : result?.[vote.voter];
    return { ...vote, vp };
  });

  return orderBy(scores, "vp", "desc");
}

const main = async () => {

  /*********** Inputs ********/
  const idProposal = "QmetMTKHPCTgrwXxq8LBtjw93f9wHmhrGyrcuGH4hM7gKi";
  const bribes = [
    {
      gaugeName: "f-sdteth",
      token: "SDT",
      address: "0x73968b9a57c6E53d41345FD57a6E6ae27d6CDB2F",
      amount: 6000,
      decimals: 18,
    }
  ];
  /***************************/

  // Create a map of bribe's names
  const mapNameBribes = {};
  const mapBribesVotes = {};
  const mapBribeRewards = {};
  bribes.forEach((b, index) => {
    mapNameBribes[index + 1] = b.gaugeName;
    mapBribesVotes[b.gaugeName] = [];
  });

  // Get all votes for a specific gauge vote
  const votes = await getVotes(idProposal);

  // Get proposal
  const proposal = await getProposal(idProposal);

  // Get all votes
  const voters = votes.map((v) => v.voter);

  const scores = await getScores(proposal, votes, voters);

  // For each scores (ie : users who voted)
  // We get only them where we have bribes
  for (const score of scores) {
    // Calculate the total weight
    // For example : choice: { '2': 2, '41': 1, '53': 1 },
    // totalWeight = 4
    let totalWeight = 0.0;
    for (const key of Object.keys(score.choice)) {
      totalWeight += score.choice[key];
    }

    for (const key of Object.keys(score.choice)) {
      if (mapNameBribes[parseInt(key)]) {
        // Use voted for a gauge where we have a bribe
        // Save it
        // Calculate the weight associated to the vote based on the total voting power to the user
        // Example : if a have 2000 in voting power and i voted for 2 gauges at 50/50
        // I will have 1000 in weight for each
        mapBribesVotes[mapNameBribes[parseInt(key)]].push({
          weight: parseFloat(score.choice[key]) * 100 / totalWeight * score.vp / 100,
          voter: score.voter,
        });
      }
    }
  }

  // Now, we have for each voters, the corresponding weight associated
  // We have to calculate their rewards
  for (const bribeName of Object.keys(mapBribesVotes)) {
    const bribe = bribes.find(b => b.gaugeName === bribeName);
    const totalReward = bribe.amount;
    const votes = mapBribesVotes[bribeName];

    // Calculate the total weight for all users
    const totalWeight = votes.reduce((acc, v) => acc + v.weight, 0.0);

    // We have the total weight + the weight of each voters
    // We can calculate the reward amount for each of them
    mapBribeRewards[bribeName] = [];
    for (const vote of votes) {
      const percentageWeight = vote.weight * 100 / totalWeight;
      const rewardAmount = percentageWeight * totalReward / 100;
      mapBribeRewards[bribeName].push({
        voter: vote.voter,
        amount: BigNumber.from(Math.floor(rewardAmount * 1000000)).mul(BigNumber.from(10).pow(bribe.decimals - 6)),
      });
    }
  }

  // mapBribeRewards contains the reward amount of each users for each gauges bribed
  // Now, we have to know who claimed their rewards
  const claimedData = await getAllAccountClaimedSinceLastFreeze();

  // Organize if my tokens
  const claimedByTokens = {};
  for (const cd of claimedData) {
    if (!claimedByTokens[cd.token]) {
      claimedByTokens[cd.token] = [];
    }
    claimedByTokens[cd.token].push(cd.account);
  }

  // Now, we get users who didn't claim yet last rewards
  // Map organize by token address
  let usersWhoNeedClaim = {};

  for (const bribe of lastMerkle) {
    usersWhoNeedClaim[bribe.address] = [];

    // If we don't have claim for this token, so all users need to claim yet
    // We create an empty array which allow all users in the next loop to claim
    if (!claimedByTokens[bribe.address]) {
      claimedByTokens[bribe.address] = [];
    }

    for (const key of Object.keys(bribe.merkle)) {

      //If the user didn't claim, we add him
      if (claimedByTokens[bribe.address].indexOf(key) === -1) {
        usersWhoNeedClaim[bribe.address].push({
          account: key,
          amount: BigNumber.from(bribe.merkle[key].amount),
        });
      }
    }
  }

  // Now, we add them in the new distribution
  for (const gaugeName of Object.keys(mapBribeRewards)) {
    // Get token address
    const tokenAddress = bribes.find(b => b.gaugeName === gaugeName).address;

    // Check if we have a previous distribution to do for this token address
    if (!usersWhoNeedClaim[tokenAddress]) {
      usersWhoNeedClaim[tokenAddress] = [];
    }

    // Increment or add the reward user in the map
    for (const r of mapBribeRewards[gaugeName]) {
      let find = false;
      for (const u of usersWhoNeedClaim[tokenAddress]) {
        if (u.account === r.voter) {
          find = true;
          u.amount = BigNumber.from(u.amount).add(BigNumber.from(r.amount));
          break;
        }
      }

      if (!find) {
        // User already claimed or new user, we add him
        usersWhoNeedClaim[tokenAddress].push({
          amount: BigNumber.from(r.amount),
          account: r.voter,
        });
      }
    }
  }

  // We generate the merkle tree
  //fs.writeFileSync('merkle.json', JSON.stringify(mapBribeRewards));
  // IMPORTANT 
  // Increment the index [0, ...] for each tokens
  const global = [];
  for (const tokenAddress of Object.keys(usersWhoNeedClaim)) {
    const bribe = bribes.find(b => b.address === tokenAddress);
    const usersEligible = usersWhoNeedClaim[tokenAddress];
    const users = [];

    for (let i = 0; i < usersEligible.length; i++) {
      users.push({
        index: i,
        address: usersEligible[i].account,
        amount: usersEligible[i].amount,
      });
    }

    const elements = users.map((x) =>
      utils.solidityKeccak256(["uint256", "address", "uint256"], [x.index, x.address, x.amount])
    );

    const merkleTree = new MerkleTree(elements, keccak256, { sort: true });

    let res = {};

    for (let i = 0; i < users.length; i++) {
      const user = users[i];
      res[user.address] = {
        index: user.index,
        amount: user.amount,
        proof: merkleTree.getHexProof(elements[i]),
      };
    }

    global.push({
      "symbol": bribe.symbol,
      "address": bribe.address,
      "image": bribe.image,
      "merkle": res,
      root: merkleTree.getHexRoot(),
    });
  }

  fs.writeFileSync('merkle.json', JSON.stringify(global));
}

main();