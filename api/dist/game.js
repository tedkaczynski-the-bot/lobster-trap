"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.state = void 0;
exports.registerPlayer = registerPlayer;
exports.getPlayerByApiKey = getPlayerByApiKey;
exports.getOpenLobbies = getOpenLobbies;
exports.createLobby = createLobby;
exports.joinLobby = joinLobby;
exports.leaveLobby = leaveLobby;
exports.sendMessage = sendMessage;
exports.castVote = castVote;
exports.getGame = getGame;
exports.getPlayerGame = getPlayerGame;
exports.getPlayerRole = getPlayerRole;
exports.getMessages = getMessages;
exports.getLiveGames = getLiveGames;
const uuid_1 = require("uuid");
const contract_1 = require("./contract");
// In-memory state (use Redis/DB in production)
exports.state = {
    games: new Map(),
    players: new Map(),
    apiKeyToPlayer: new Map(),
};
// Timing constants (ms)
const DISCUSSION_TIME = 5 * 60 * 1000; // 5 minutes
const VOTING_TIME = 2 * 60 * 1000; // 2 minutes
const REVEAL_TIME = 10 * 1000; // 10 seconds
// ============ Player Management ============
function registerPlayer(name, wallet) {
    const existing = Array.from(exports.state.players.values()).find(p => p.wallet === wallet);
    if (existing)
        return existing;
    const player = {
        id: (0, uuid_1.v4)(),
        name,
        wallet,
        apiKey: `lt_${(0, uuid_1.v4)().replace(/-/g, '')}`,
        createdAt: new Date(),
    };
    exports.state.players.set(player.id, player);
    exports.state.apiKeyToPlayer.set(player.apiKey, player.id);
    return player;
}
function getPlayerByApiKey(apiKey) {
    const playerId = exports.state.apiKeyToPlayer.get(apiKey);
    if (!playerId)
        return undefined;
    return exports.state.players.get(playerId);
}
// ============ Lobby Management ============
function getOpenLobbies() {
    return Array.from(exports.state.games.values())
        .filter(g => g.phase === 'lobby' && g.players.length < 5);
}
function createLobby(player, onchainGameId) {
    const game = {
        id: (0, uuid_1.v4)(),
        onchainGameId,
        phase: 'lobby',
        round: 0,
        players: [{
                playerId: player.id,
                name: player.name,
                wallet: player.wallet,
                isAlive: true,
                hasVoted: false,
            }],
        messages: [],
        votes: [],
        eliminated: [],
        createdAt: new Date(),
    };
    exports.state.games.set(game.id, game);
    return game;
}
function joinLobby(gameId, player) {
    const game = exports.state.games.get(gameId);
    if (!game || game.phase !== 'lobby' || game.players.length >= 5) {
        return null;
    }
    // Check if already in game
    if (game.players.some(p => p.playerId === player.id)) {
        return game;
    }
    game.players.push({
        playerId: player.id,
        name: player.name,
        wallet: player.wallet,
        isAlive: true,
        hasVoted: false,
    });
    // Auto-start when full
    if (game.players.length === 5) {
        startGame(game);
    }
    return game;
}
function leaveLobby(gameId, playerId) {
    const game = exports.state.games.get(gameId);
    if (!game || game.phase !== 'lobby')
        return false;
    const idx = game.players.findIndex(p => p.playerId === playerId);
    if (idx === -1)
        return false;
    game.players.splice(idx, 1);
    // Cancel if empty
    if (game.players.length === 0) {
        exports.state.games.delete(gameId);
    }
    return true;
}
// ============ Game Flow ============
function startGame(game) {
    // Assign trap randomly
    const trapIndex = Math.floor(Math.random() * game.players.length);
    game.players.forEach((p, i) => {
        p.role = i === trapIndex ? 'trap' : 'survivor';
    });
    game.trapId = game.players[trapIndex].playerId;
    game.phase = 'discussion';
    game.round = 1;
    game.phaseEndsAt = new Date(Date.now() + DISCUSSION_TIME);
    console.log(`Game ${game.id} started! Trap: ${game.players[trapIndex].name}`);
    // Schedule phase transitions
    schedulePhaseTransition(game);
}
function schedulePhaseTransition(game) {
    const timeLeft = game.phaseEndsAt.getTime() - Date.now();
    setTimeout(() => {
        if (game.phase === 'discussion') {
            startVoting(game);
        }
        else if (game.phase === 'voting') {
            processVotes(game);
        }
        else if (game.phase === 'reveal') {
            checkWinCondition(game);
        }
    }, Math.max(0, timeLeft));
}
function startVoting(game) {
    game.phase = 'voting';
    game.votes = [];
    game.players.forEach(p => p.hasVoted = false);
    game.phaseEndsAt = new Date(Date.now() + VOTING_TIME);
    console.log(`Game ${game.id} entering voting phase`);
    schedulePhaseTransition(game);
}
function processVotes(game) {
    // Count votes
    const voteCounts = new Map();
    game.votes.forEach(v => {
        voteCounts.set(v.targetId, (voteCounts.get(v.targetId) || 0) + 1);
    });
    // Find highest
    let maxVotes = 0;
    let eliminated = [];
    voteCounts.forEach((count, playerId) => {
        if (count > maxVotes) {
            maxVotes = count;
            eliminated = [playerId];
        }
        else if (count === maxVotes) {
            eliminated.push(playerId);
        }
    });
    // Tie-breaker: random
    if (eliminated.length > 1) {
        eliminated = [eliminated[Math.floor(Math.random() * eliminated.length)]];
    }
    if (eliminated.length > 0) {
        const eliminatedPlayer = game.players.find(p => p.playerId === eliminated[0]);
        if (eliminatedPlayer) {
            eliminatedPlayer.isAlive = false;
            game.eliminated.push(eliminated[0]);
            console.log(`Game ${game.id}: ${eliminatedPlayer.name} eliminated (was ${eliminatedPlayer.role})`);
        }
    }
    game.phase = 'reveal';
    game.phaseEndsAt = new Date(Date.now() + REVEAL_TIME);
    schedulePhaseTransition(game);
}
async function checkWinCondition(game) {
    const alivePlayers = game.players.filter(p => p.isAlive);
    const trapAlive = alivePlayers.some(p => p.role === 'trap');
    // Trap eliminated = survivors win
    if (!trapAlive) {
        game.winner = 'survivors';
        await endGame(game);
        return;
    }
    // 2 or fewer players left with trap alive = trap wins
    if (alivePlayers.length <= 2 && trapAlive) {
        game.winner = 'trap';
        await endGame(game);
        return;
    }
    // Continue to next round
    game.round++;
    game.phase = 'discussion';
    game.phaseEndsAt = new Date(Date.now() + DISCUSSION_TIME);
    game.votes = [];
    game.players.forEach(p => p.hasVoted = false);
    console.log(`Game ${game.id} starting round ${game.round}`);
    schedulePhaseTransition(game);
}
async function endGame(game) {
    game.phase = 'completed';
    // Determine winners
    let winners;
    if (game.winner === 'trap') {
        winners = game.players.filter(p => p.role === 'trap');
    }
    else {
        winners = game.players.filter(p => p.isAlive && p.role === 'survivor');
    }
    const winnerAddresses = winners.map(w => w.wallet);
    console.log(`Game ${game.id} ended. Winner: ${game.winner}. Addresses:`, winnerAddresses);
    // Call smart contract
    if (game.onchainGameId) {
        try {
            const txHash = await (0, contract_1.completeGame)(game.onchainGameId, winnerAddresses);
            console.log(`Onchain payout complete: ${txHash}`);
        }
        catch (err) {
            console.error(`Failed to complete onchain:`, err);
        }
    }
}
// ============ Game Actions ============
function sendMessage(gameId, playerId, content) {
    const game = exports.state.games.get(gameId);
    if (!game || game.phase !== 'discussion')
        return null;
    const player = game.players.find(p => p.playerId === playerId);
    if (!player || !player.isAlive)
        return null;
    const message = {
        id: (0, uuid_1.v4)(),
        gameId,
        playerId,
        playerName: player.name,
        content: content.slice(0, 500), // Limit length
        timestamp: new Date(),
    };
    game.messages.push(message);
    return message;
}
function castVote(gameId, voterId, targetId) {
    const game = exports.state.games.get(gameId);
    if (!game || game.phase !== 'voting')
        return false;
    const voter = game.players.find(p => p.playerId === voterId);
    const target = game.players.find(p => p.playerId === targetId);
    if (!voter || !target || !voter.isAlive || !target.isAlive)
        return false;
    if (voterId === targetId)
        return false; // Can't vote self
    if (voter.hasVoted)
        return false;
    game.votes.push({ voterId, targetId });
    voter.hasVoted = true;
    // Check if all voted
    const aliveCount = game.players.filter(p => p.isAlive).length;
    const voteCount = game.votes.length;
    if (voteCount >= aliveCount) {
        // All voted, process immediately
        clearTimeout(undefined); // Would need to track timeout ID properly
        processVotes(game);
    }
    return true;
}
// ============ Queries ============
function getGame(gameId) {
    return exports.state.games.get(gameId);
}
function getPlayerGame(playerId) {
    return Array.from(exports.state.games.values()).find(g => g.phase !== 'completed' && g.players.some(p => p.playerId === playerId));
}
function getPlayerRole(gameId, playerId) {
    const game = exports.state.games.get(gameId);
    if (!game)
        return null;
    const player = game.players.find(p => p.playerId === playerId);
    return player?.role || null;
}
function getMessages(gameId, since) {
    const game = exports.state.games.get(gameId);
    if (!game)
        return [];
    if (since) {
        return game.messages.filter(m => m.timestamp > since);
    }
    return game.messages;
}
function getLiveGames() {
    return Array.from(exports.state.games.values())
        .filter(g => g.phase !== 'lobby' && g.phase !== 'completed');
}
