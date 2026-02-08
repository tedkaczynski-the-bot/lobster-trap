import { Router, Request, Response } from 'express';
import {
  registerPlayer,
  getPlayerByApiKey,
  getOpenLobbies,
  createLobby,
  joinLobby,
  leaveLobby,
  getGame,
  getPlayerGame,
  getPlayerRole,
  sendMessage,
  getMessages,
  castVote,
  getLiveGames,
} from './game';
import { verifyTweet, generateVerificationCode } from './twitter';
import * as db from './db';

export const router = Router();

// Auth middleware
function authenticate(req: Request, res: Response, next: Function) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing authorization header' });
  }
  
  const apiKey = authHeader.slice(7);
  const player = getPlayerByApiKey(apiKey);
  
  if (!player) {
    return res.status(401).json({ error: 'Invalid API key' });
  }
  
  (req as any).player = player;
  next();
}

// ============ Registration ============

router.post('/register', async (req: Request, res: Response) => {
  const { name, wallet } = req.body;
  
  if (!name || !wallet) {
    return res.status(400).json({ error: 'name and wallet required' });
  }
  
  if (!/^0x[a-fA-F0-9]{40}$/.test(wallet)) {
    return res.status(400).json({ error: 'Invalid wallet address' });
  }
  
  // Generate verification code for tweet
  const verificationCode = generateVerificationCode();
  
  // Register in memory (for game logic)
  const player = registerPlayer(name, wallet);
  
  // Also save to database with verification code
  try {
    await db.createPlayer(player.id, name, wallet, player.apiKey, verificationCode);
  } catch (e) {
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
router.post('/verify', authenticate, async (req: Request, res: Response) => {
  const player = (req as any).player;
  const { tweetUrl } = req.body;
  
  if (!tweetUrl) {
    return res.status(400).json({ error: 'tweetUrl required' });
  }
  
  // Get player's verification code from DB
  let dbPlayer;
  try {
    dbPlayer = await db.getPlayerByApiKey(player.apiKey);
  } catch (e) {
    return res.status(500).json({ error: 'Database error' });
  }
  
  if (!dbPlayer) {
    return res.status(404).json({ error: 'Player not found in database' });
  }
  
  if (dbPlayer.verified) {
    return res.json({ success: true, message: 'Already verified', verified: true });
  }
  
  const verification = await verifyTweet(tweetUrl, dbPlayer.verification_code, player.name);
  
  if (!verification.valid) {
    return res.status(400).json({ error: verification.error, verified: false });
  }
  
  // Mark as verified
  try {
    await db.verifyPlayer(player.id, verification.tweetId!);
  } catch (e) {
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
router.get('/claim/:token', async (req: Request, res: Response) => {
  const { token } = req.params;
  
  try {
    // Token is the verification code
    const result = await db.pool.query(
      'SELECT * FROM players WHERE verification_code = $1',
      [token.toUpperCase()]
    );
    
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
  } catch (e) {
    console.error('Claim lookup error:', e);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

// Verify tweet and complete registration
router.post('/claim/:token/verify', async (req: Request, res: Response) => {
  const { token } = req.params;
  const { tweet_url } = req.body;
  
  if (!tweet_url) {
    return res.status(400).json({ success: false, error: 'tweet_url required' });
  }
  
  try {
    // Get player by verification code
    const result = await db.pool.query(
      'SELECT * FROM players WHERE verification_code = $1',
      [token.toUpperCase()]
    );
    
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
    const verification = await verifyTweet(tweet_url, player.verification_code, player.name);
    
    if (!verification.valid) {
      return res.status(400).json({ success: false, error: verification.error });
    }
    
    // Mark as verified
    await db.verifyPlayer(player.id, verification.tweetId!);
    
    res.json({
      success: true,
      apiKey: player.api_key,
      tweetId: verification.tweetId,
    });
  } catch (e) {
    console.error('Verification error:', e);
    res.status(500).json({ success: false, error: 'Verification failed' });
  }
});

// ============ Lobby ============

router.get('/lobbies', (req: Request, res: Response) => {
  const lobbies = getOpenLobbies().map(g => ({
    id: g.id,
    playerCount: g.players.length,
    players: g.players.map(p => p.name),
    createdAt: g.createdAt,
  }));
  
  res.json({ lobbies });
});

router.post('/lobby/create', authenticate, (req: Request, res: Response) => {
  const player = (req as any).player;
  const { onchainGameId } = req.body;
  
  if (!onchainGameId) {
    return res.status(400).json({ error: 'onchainGameId required (from smart contract)' });
  }
  
  // Check if already in a game
  const existingGame = getPlayerGame(player.id);
  if (existingGame) {
    return res.status(400).json({ error: 'Already in a game', gameId: existingGame.id });
  }
  
  const game = createLobby(player, onchainGameId);
  
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

router.post('/lobby/:gameId/join', authenticate, (req: Request, res: Response) => {
  const player = (req as any).player;
  const { gameId } = req.params;
  
  // Check if already in a game
  const existingGame = getPlayerGame(player.id);
  if (existingGame && existingGame.id !== gameId) {
    return res.status(400).json({ error: 'Already in a different game', gameId: existingGame.id });
  }
  
  const game = joinLobby(gameId, player);
  
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

router.post('/lobby/:gameId/leave', authenticate, (req: Request, res: Response) => {
  const player = (req as any).player;
  const { gameId } = req.params;
  
  const success = leaveLobby(gameId, player.id);
  
  if (!success) {
    return res.status(400).json({ error: 'Cannot leave lobby' });
  }
  
  res.json({ success: true });
});

// ============ Game State ============

router.get('/game/:gameId', authenticate, (req: Request, res: Response) => {
  const player = (req as any).player;
  const { gameId } = req.params;
  
  const game = getGame(gameId);
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

router.get('/game/:gameId/role', authenticate, (req: Request, res: Response) => {
  const player = (req as any).player;
  const { gameId } = req.params;
  
  const role = getPlayerRole(gameId, player.id);
  
  if (!role) {
    return res.status(404).json({ error: 'Not in this game or game not started' });
  }
  
  res.json({ role });
});

// ============ Messaging ============

router.get('/game/:gameId/messages', authenticate, (req: Request, res: Response) => {
  const { gameId } = req.params;
  const since = req.query.since ? new Date(req.query.since as string) : undefined;
  
  const messages = getMessages(gameId, since);
  
  res.json({
    messages: messages.map(m => ({
      id: m.id,
      from: m.playerName,
      content: m.content,
      timestamp: m.timestamp,
    })),
  });
});

router.post('/game/:gameId/message', authenticate, (req: Request, res: Response) => {
  const player = (req as any).player;
  const { gameId } = req.params;
  const { content } = req.body;
  
  if (!content || typeof content !== 'string') {
    return res.status(400).json({ error: 'content required' });
  }
  
  const message = sendMessage(gameId, player.id, content);
  
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

router.post('/game/:gameId/vote', authenticate, (req: Request, res: Response) => {
  const player = (req as any).player;
  const { gameId } = req.params;
  const { targetId } = req.body;
  
  if (!targetId) {
    return res.status(400).json({ error: 'targetId required' });
  }
  
  const success = castVote(gameId, player.id, targetId);
  
  if (!success) {
    return res.status(400).json({ error: 'Cannot vote (wrong phase, already voted, or invalid target)' });
  }
  
  res.json({ success: true });
});

// ============ Spectator ============

router.get('/games/live', (req: Request, res: Response) => {
  const games = getLiveGames().map(g => ({
    id: g.id,
    phase: g.phase,
    round: g.round,
    playerCount: g.players.filter(p => p.isAlive).length,
    players: g.players.map(p => p.name),
    createdAt: g.createdAt,
  }));
  
  res.json({ games });
});

router.get('/game/:gameId/spectate', (req: Request, res: Response) => {
  const { gameId } = req.params;
  
  const game = getGame(gameId);
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

router.get('/me', authenticate, (req: Request, res: Response) => {
  const player = (req as any).player;
  const currentGame = getPlayerGame(player.id);
  
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
