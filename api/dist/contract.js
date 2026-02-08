"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.initContract = initContract;
exports.completeGame = completeGame;
exports.getOnchainGame = getOnchainGame;
exports.getOracleAddress = getOracleAddress;
const ethers_1 = require("ethers");
const LOBSTER_TRAP_ABI = [
    "function completeGame(uint256 gameId, address[] calldata winners) external",
    "function getGame(uint256 gameId) external view returns (address[5] players, uint8 playerCount, uint8 state, uint256 createdAt, uint256 totalPot)",
    "function oracle() external view returns (address)",
    "event GameStarted(uint256 indexed gameId, address[5] players)",
    "event GameCompleted(uint256 indexed gameId, address[] winners, uint256 prizePerWinner)",
    "event TokensBurned(uint256 indexed gameId, uint256 amount)"
];
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS || '0x6f0E0384Afc2664230B6152409e7E9D156c11252';
const RPC_URL = process.env.RPC_URL || 'https://mainnet.base.org';
let provider;
let wallet;
let contract;
function initContract(privateKey) {
    provider = new ethers_1.ethers.JsonRpcProvider(RPC_URL);
    wallet = new ethers_1.ethers.Wallet(privateKey, provider);
    contract = new ethers_1.ethers.Contract(CONTRACT_ADDRESS, LOBSTER_TRAP_ABI, wallet);
    console.log(`Contract initialized. Oracle wallet: ${wallet.address}`);
}
async function completeGame(onchainGameId, winnerAddresses) {
    console.log(`Completing game ${onchainGameId} with winners:`, winnerAddresses);
    const tx = await contract.completeGame(onchainGameId, winnerAddresses);
    console.log(`Transaction sent: ${tx.hash}`);
    const receipt = await tx.wait();
    console.log(`Transaction confirmed in block ${receipt.blockNumber}`);
    return tx.hash;
}
async function getOnchainGame(gameId) {
    const [players, playerCount, state, createdAt, totalPot] = await contract.getGame(gameId);
    return { players, playerCount, state, createdAt, totalPot };
}
function getOracleAddress() {
    return wallet?.address || '';
}
