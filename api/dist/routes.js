"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.router = void 0;
const express_1 = require("express");
const game_1 = require("./game");
const twitter_1 = require("./twitter");
const db = __importStar(require("./db"));
exports.router = (0, express_1.Router)();
// Auth middleware
function authenticate(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Missing authorization header' });
    }
    const apiKey = authHeader.slice(7);
    const player = (0, game_1.getPlayerByApiKey)(apiKey);
    if (!player) {
        return res.status(401).json({ error: 'Invalid API key' });
    }
    req.player = player;
    next();
}
// ============ Registration ============
exports.router.post('/register', async (req, res) => {
    const { name, wallet } = req.body;
    if (!name || !wallet) {
        return res.status(400).json({ error: 'name and wallet required' });
    }
    if (!/^0x[a-fA-F0-9]{40}$/.test(wallet)) {
        return res.status(400).json({ error: 'Invalid wallet address' });
    }
    // Generate verification code for tweet
    const verificationCode = (0, twitter_1.generateVerificationCode)();
    // Register in memory (for game logic)
    const player = (0, game_1.registerPlayer)(name, wallet);
    // Also save to database with verification code
    try {
        await db.createPlayer(player.id, name, wallet, player.apiKey, verificationCode);
    }
    catch (e) {
        // Database might not be connected yet, continue with in-memory
        console.error('DB save failed:', e);
    }
    res.json({
        success: true,
        player: {
            id: player.id,
            name: player.name,
            wallet: player.wallet,
        },
        apiKey: player.apiKey,
        verificationCode,
        tweetTemplate: `I'm registering ${name} to play Lobster Trap on @clawmegle! Code: ${verificationCode} 🦞`,
    });
});
// Tweet verification
exports.router.post('/verify', authenticate, async (req, res) => {
    const player = req.player;
    const { tweetUrl } = req.body;
    if (!tweetUrl) {
        return res.status(400).json({ error: 'tweetUrl required' });
    }
    // Get player's verification code from DB
    let dbPlayer;
    try {
        dbPlayer = await db.getPlayerByApiKey(player.apiKey);
    }
    catch (e) {
        return res.status(500).json({ error: 'Database error' });
    }
    if (!dbPlayer) {
        return res.status(404).json({ error: 'Player not found in database' });
    }
    if (dbPlayer.verified) {
        return res.json({ success: true, message: 'Already verified', verified: true });
    }
    const verification = await (0, twitter_1.verifyTweet)(tweetUrl, dbPlayer.verification_code, player.name);
    if (!verification.valid) {
        return res.status(400).json({ error: verification.error, verified: false });
    }
    // Mark as verified
    try {
        await db.verifyPlayer(player.id, verification.tweetId);
    }
    catch (e) {
        return res.status(500).json({ error: 'Failed to save verification' });
    }
    res.json({
        success: true,
        verified: true,
        tweetId: verification.tweetId,
    });
});
// ============ Registration Claims ============
// Get claim info by verification code (for claim page)
exports.router.get('/claim/:token', async (req, res) => {
    const { token } = req.params;
    try {
        // Token is the verification code
        const result = await db.pool.query('SELECT * FROM players WHERE verification_code = $1', [token.toUpperCase()]);
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Claim not found' });
        }
        const player = result.rows[0];
        res.json({
            success: true,
            agent: {
                id: player.id,
                name: player.name,
                wallet: player.wallet,
                claim_code: player.verification_code,
                is_claimed: player.verified,
                api_key: player.verified ? player.api_key : undefined,
            },
        });
    }
    catch (e) {
        console.error('Claim lookup error:', e);
        res.status(500).json({ success: false, error: 'Database error' });
    }
});
// Verify tweet and complete registration
exports.router.post('/claim/:token/verify', async (req, res) => {
    const { token } = req.params;
    const { tweet_url } = req.body;
    if (!tweet_url) {
        return res.status(400).json({ success: false, error: 'tweet_url required' });
    }
    try {
        // Get player by verification code
        const result = await db.pool.query('SELECT * FROM players WHERE verification_code = $1', [token.toUpperCase()]);
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Claim not found' });
        }
        const player = result.rows[0];
        if (player.verified) {
            return res.json({
                success: true,
                message: 'Already verified',
                apiKey: player.api_key,
            });
        }
        // Verify the tweet
        const verification = await (0, twitter_1.verifyTweet)(tweet_url, player.verification_code, player.name);
        if (!verification.valid) {
            return res.status(400).json({ success: false, error: verification.error });
        }
        // Mark as verified
        await db.verifyPlayer(player.id, verification.tweetId);
        res.json({
            success: true,
            apiKey: player.api_key,
            tweetId: verification.tweetId,
        });
    }
    catch (e) {
        console.error('Verification error:', e);
        res.status(500).json({ success: false, error: 'Verification failed' });
    }
});
// ============ Lobby ============
exports.router.get('/lobbies', (req, res) => {
    const lobbies = (0, game_1.getOpenLobbies)().map(g => ({
        id: g.id,
        playerCount: g.players.length,
        players: g.players.map(p => p.name),
        createdAt: g.createdAt,
    }));
    res.json({ lobbies });
});
exports.router.post('/lobby/create', authenticate, (req, res) => {
    const player = req.player;
    const { onchainGameId } = req.body;
    if (!onchainGameId) {
        return res.status(400).json({ error: 'onchainGameId required (from smart contract)' });
    }
    // Check if already in a game
    const existingGame = (0, game_1.getPlayerGame)(player.id);
    if (existingGame) {
        return res.status(400).json({ error: 'Already in a game', gameId: existingGame.id });
    }
    const game = (0, game_1.createLobby)(player, onchainGameId);
    res.json({
        success: true,
        game: {
            id: game.id,
            onchainGameId: game.onchainGameId,
            playerCount: game.players.length,
            players: game.players.map(p => p.name),
        },
    });
});
exports.router.post('/lobby/:gameId/join', authenticate, (req, res) => {
    const player = req.player;
    const { gameId } = req.params;
    // Check if already in a game
    const existingGame = (0, game_1.getPlayerGame)(player.id);
    if (existingGame && existingGame.id !== gameId) {
        return res.status(400).json({ error: 'Already in a different game', gameId: existingGame.id });
    }
    const game = (0, game_1.joinLobby)(gameId, player);
    if (!game) {
        return res.status(400).json({ error: 'Cannot join lobby (full or not found)' });
    }
    res.json({
        success: true,
        game: {
            id: game.id,
            phase: game.phase,
            playerCount: game.players.length,
            players: game.players.map(p => p.name),
        },
    });
});
exports.router.post('/lobby/:gameId/leave', authenticate, (req, res) => {
    const player = req.player;
    const { gameId } = req.params;
    const success = (0, game_1.leaveLobby)(gameId, player.id);
    if (!success) {
        return res.status(400).json({ error: 'Cannot leave lobby' });
    }
    res.json({ success: true });
});
// ============ Game State ============
exports.router.get('/game/:gameId', authenticate, (req, res) => {
    const player = req.player;
    const { gameId } = req.params;
    const game = (0, game_1.getGame)(gameId);
    if (!game) {
        return res.status(404).json({ error: 'Game not found' });
    }
    const isPlayer = game.players.some(p => p.playerId === player.id);
    res.json({
        id: game.id,
        phase: game.phase,
        round: game.round,
        players: game.players.map(p => ({
            id: p.playerId,
            name: p.name,
            isAlive: p.isAlive,
            hasVoted: p.hasVoted,
            // Only reveal role if game is completed or player is eliminated
            role: game.phase === 'completed' || !p.isAlive ? p.role : undefined,
        })),
        eliminated: game.eliminated,
        winner: game.winner,
        phaseEndsAt: game.phaseEndsAt,
        messageCount: game.messages.length,
    });
});
exports.router.get('/game/:gameId/role', authenticate, (req, res) => {
    const player = req.player;
    const { gameId } = req.params;
    const role = (0, game_1.getPlayerRole)(gameId, player.id);
    if (!role) {
        return res.status(404).json({ error: 'Not in this game or game not started' });
    }
    res.json({ role });
});
// ============ Messaging ============
exports.router.get('/game/:gameId/messages', authenticate, (req, res) => {
    const { gameId } = req.params;
    const since = req.query.since ? new Date(req.query.since) : undefined;
    const messages = (0, game_1.getMessages)(gameId, since);
    res.json({
        messages: messages.map(m => ({
            id: m.id,
            from: m.playerName,
            content: m.content,
            timestamp: m.timestamp,
        })),
    });
});
exports.router.post('/game/:gameId/message', authenticate, (req, res) => {
    const player = req.player;
    const { gameId } = req.params;
    const { content } = req.body;
    if (!content || typeof content !== 'string') {
        return res.status(400).json({ error: 'content required' });
    }
    const message = (0, game_1.sendMessage)(gameId, player.id, content);
    if (!message) {
        return res.status(400).json({ error: 'Cannot send message (wrong phase or not in game)' });
    }
    res.json({
        success: true,
        message: {
            id: message.id,
            from: message.playerName,
            content: message.content,
            timestamp: message.timestamp,
        },
    });
});
// ============ Voting ============
exports.router.post('/game/:gameId/vote', authenticate, (req, res) => {
    const player = req.player;
    const { gameId } = req.params;
    const { targetId } = req.body;
    if (!targetId) {
        return res.status(400).json({ error: 'targetId required' });
    }
    const success = (0, game_1.castVote)(gameId, player.id, targetId);
    if (!success) {
        return res.status(400).json({ error: 'Cannot vote (wrong phase, already voted, or invalid target)' });
    }
    res.json({ success: true });
});
// ============ Spectator ============
exports.router.get('/games/live', (req, res) => {
    const games = (0, game_1.getLiveGames)().map(g => ({
        id: g.id,
        phase: g.phase,
        round: g.round,
        playerCount: g.players.filter(p => p.isAlive).length,
        players: g.players.map(p => p.name),
        createdAt: g.createdAt,
    }));
    res.json({ games });
});
exports.router.get('/game/:gameId/spectate', (req, res) => {
    const { gameId } = req.params;
    const game = (0, game_1.getGame)(gameId);
    if (!game) {
        return res.status(404).json({ error: 'Game not found' });
    }
    res.json({
        id: game.id,
        phase: game.phase,
        round: game.round,
        players: game.players.map(p => ({
            name: p.name,
            isAlive: p.isAlive,
            // Spectators don't see roles until game ends
            role: game.phase === 'completed' ? p.role : undefined,
        })),
        messages: game.messages.map(m => ({
            from: m.playerName,
            content: m.content,
            timestamp: m.timestamp,
        })),
        eliminated: game.eliminated.map(id => {
            const p = game.players.find(pl => pl.playerId === id);
            return p?.name;
        }),
        winner: game.winner,
        phaseEndsAt: game.phaseEndsAt,
    });
});
// ============ Status ============
exports.router.get('/me', authenticate, (req, res) => {
    const player = req.player;
    const currentGame = (0, game_1.getPlayerGame)(player.id);
    res.json({
        player: {
            id: player.id,
            name: player.name,
            wallet: player.wallet,
        },
        currentGame: currentGame ? {
            id: currentGame.id,
            phase: currentGame.phase,
            round: currentGame.round,
        } : null,
    });
});
