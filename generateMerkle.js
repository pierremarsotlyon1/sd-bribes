const { MerkleTree } = require("merkletreejs");
const { utils } = require("ethers");
const keccak256 = require("keccak256");
const fs = require('fs');

function main() {
  const data = [
    {
      "symbol": "SDT",
      "address": "0x73968b9a57c6E53d41345FD57a6E6ae27d6CDB2F",
      "image": "https://img.api.cryptorank.io/coins/stake%20dao1611223377376.png",
      "users": [
        { index: 0, address: "0xb7BFcDC3a2AA2aF3Fe653C9E8a19830977E1993C", amount: 1 },
      ]
    }
  ];

  const global = [];

  for (const key of Object.keys(data)) {
    const elem = data[key];
    const users = elem.users;

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
        root: merkleTree.getHexRoot(),
      };
    }

    global.push({
      "symbol": elem.symbol,
      "address": elem.address,
      "image": elem.image,
      "merkle": res
    });
  }

  fs.writeFileSync('merkle.json', JSON.stringify(global));
}
main();