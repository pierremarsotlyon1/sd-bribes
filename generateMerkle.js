const { MerkleTree } = require("merkletreejs");
const { utils } = require("ethers");
const keccak256 = require("keccak256");
const fs = require('fs');

function main() {
  const data = [
    {
      "symbol": "SDT",
      "address": "0x73968b9a57c6e53d41345fd57a6e6ae27d6cdb2f",
      "image": "https://img.api.cryptorank.io/coins/stake%20dao1611223377376.png",
      "users": [
        { index: 0, address: "0xD08c8e6d78a1f64B1796d6DC3137B19665cb6F1F", amount: 10 },
        { index: 0, address: "0xb7D15753D3F76e7C892B63db6b4729f700C01298", amount: 15 },
        { index: 0, address: "0xf69Ca530Cd4849e3d1329FBEC06787a96a3f9A68", amount: 30 },
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
        proof: merkleTree.getHexProof(elements[i])
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