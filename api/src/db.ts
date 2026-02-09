import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

export async function initDb() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS players (
        id UUID PRIMARY KEY,
        name VARCHAR(64) NOT NULL,
        wallet VARCHAR(42) NOT NULL UNIQUE,
        api_key VARCHAR(64) NOT NULL UNIQUE,
        verification_code VARCHAR(16),
        tweet_id VARCHAR(32),
        verified BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS games (
        id UUID PRIMARY KEY,
        onchain_game_id VARCHAR(32),
        phase VARCHAR(20) NOT NULL DEFAULT 'lobby',
        round INTEGER DEFAULT 1,
        trap_player_id UUID,
        winner VARCHAR(20),
        phase_ends_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW(),
        completed_at TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS game_players (
        game_id UUID REFERENCES games(id),
        player_id UUID REFERENCES players(id),
        role VARCHAR(20),
        is_alive BOOLEAN DEFAULT TRUE,
        has_voted BOOLEAN DEFAULT FALSE,
        PRIMARY KEY (game_id, player_id)
      );

      CREATE TABLE IF NOT EXISTS messages (
        id UUID PRIMARY KEY,
        game_id UUID REFERENCES games(id),
        player_id UUID REFERENCES players(id),
        player_name VARCHAR(64) NOT NULL,
        content TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS votes (
        id UUID PRIMARY KEY,
        game_id UUID REFERENCES games(id),
        voter_id UUID REFERENCES players(id),
        target_id UUID REFERENCES players(id),
        round INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS claims (
        id UUID PRIMARY KEY,
        game_id UUID REFERENCES games(id),
        player_id UUID REFERENCES players(id),
        claim_token VARCHAR(64) UNIQUE NOT NULL,
        amount_wei VARCHAR(78),
        claimed BOOLEAN DEFAULT FALSE,
        tx_hash VARCHAR(66),
        created_at TIMESTAMP DEFAULT NOW(),
        claimed_at TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_players_wallet ON players(wallet);
      CREATE INDEX IF NOT EXISTS idx_players_api_key ON players(api_key);
      CREATE INDEX IF NOT EXISTS idx_games_phase ON games(phase);
      CREATE INDEX IF NOT EXISTS idx_claims_token ON claims(claim_token);
    `);
    console.log('Database tables initialized');
  } finally {
    client.release();
  }
}

export { pool };

// Player operations
export async function createPlayer(id: string, name: string, wallet: string, apiKey: string, verificationCode: string) {
  const result = await pool.query(
    `INSERT INTO players (id, name, wallet, api_key, verification_code)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (wallet) DO UPDATE SET name = $2, verification_code = $5
     RETURNING *`,
    [id, name, wallet.toLowerCase(), apiKey, verificationCode]
  );
  return result.rows[0];
}

export async function getPlayerByApiKey(apiKey: string) {
  const result = await pool.query('SELECT * FROM players WHERE api_key = $1', [apiKey]);
  return result.rows[0];
}

export async function getPlayerByWallet(wallet: string) {
  const result = await pool.query('SELECT * FROM players WHERE wallet = $1', [wallet.toLowerCase()]);
  return result.rows[0];
}

export async function verifyPlayer(playerId: string, tweetId: string) {
  const result = await pool.query(
    `UPDATE players SET verified = TRUE, tweet_id = $2 WHERE id = $1 RETURNING *`,
    [playerId, tweetId]
  );
  return result.rows[0];
}

// Claim operations
export async function createClaim(id: string, gameId: string, playerId: string, claimToken: string, amountWei: string) {
  const result = await pool.query(
    `INSERT INTO claims (id, game_id, player_id, claim_token, amount_wei)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [id, gameId, playerId, claimToken, amountWei]
  );
  return result.rows[0];
}

export async function getClaimByToken(token: string) {
  const result = await pool.query(
    `SELECT c.*, p.name as player_name, p.wallet 
     FROM claims c 
     JOIN players p ON c.player_id = p.id 
     WHERE c.claim_token = $1`,
    [token]
  );
  return result.rows[0];
}

export async function markClaimComplete(claimId: string, txHash: string) {
  const result = await pool.query(
    `UPDATE claims SET claimed = TRUE, tx_hash = $1, claimed_at = NOW() WHERE id = $2 RETURNING *`,
    [txHash, claimId]
  );
  return result.rows[0];
}

// Game operations
export async function createGame(id: string, onchainGameId: number) {
  const result = await pool.query(
    `INSERT INTO games (id, onchain_game_id, phase, round)
     VALUES ($1, $2, 'lobby', 0)
     RETURNING *`,
    [id, onchainGameId.toString()]
  );
  return result.rows[0];
}

export async function updateGamePhase(gameId: string, phase: string, round: number, phaseEndsAt?: Date) {
  const result = await pool.query(
    `UPDATE games SET phase = $2, round = $3, phase_ends_at = $4 WHERE id = $1 RETURNING *`,
    [gameId, phase, round, phaseEndsAt || null]
  );
  return result.rows[0];
}

export async function setGameTrap(gameId: string, trapPlayerId: string) {
  const result = await pool.query(
    `UPDATE games SET trap_player_id = $2 WHERE id = $1 RETURNING *`,
    [gameId, trapPlayerId]
  );
  return result.rows[0];
}

export async function completeGame(gameId: string, winner: string) {
  const result = await pool.query(
    `UPDATE games SET winner = $2, phase = 'completed', completed_at = NOW() WHERE id = $1 RETURNING *`,
    [gameId, winner]
  );
  return result.rows[0];
}

export async function getGame(gameId: string) {
  const result = await pool.query('SELECT * FROM games WHERE id = $1', [gameId]);
  return result.rows[0];
}

export async function getActiveGames() {
  const result = await pool.query(
    `SELECT * FROM games WHERE phase != 'completed' ORDER BY created_at DESC`
  );
  return result.rows;
}

// Game player operations
export async function addGamePlayer(gameId: string, playerId: string, role?: string) {
  const result = await pool.query(
    `INSERT INTO game_players (game_id, player_id, role, is_alive, has_voted)
     VALUES ($1, $2, $3, TRUE, FALSE)
     ON CONFLICT (game_id, player_id) DO UPDATE SET role = COALESCE($3, game_players.role)
     RETURNING *`,
    [gameId, playerId, role || null]
  );
  return result.rows[0];
}

export async function removeGamePlayer(gameId: string, playerId: string) {
  await pool.query(
    `DELETE FROM game_players WHERE game_id = $1 AND player_id = $2`,
    [gameId, playerId]
  );
}

export async function updateGamePlayer(gameId: string, playerId: string, isAlive: boolean, hasVoted: boolean) {
  const result = await pool.query(
    `UPDATE game_players SET is_alive = $3, has_voted = $4 WHERE game_id = $1 AND player_id = $2 RETURNING *`,
    [gameId, playerId, isAlive, hasVoted]
  );
  return result.rows[0];
}

export async function setPlayerRole(gameId: string, playerId: string, role: string) {
  const result = await pool.query(
    `UPDATE game_players SET role = $3 WHERE game_id = $1 AND player_id = $2 RETURNING *`,
    [gameId, playerId, role]
  );
  return result.rows[0];
}

export async function getGamePlayers(gameId: string) {
  const result = await pool.query(
    `SELECT gp.*, p.name, p.wallet 
     FROM game_players gp 
     JOIN players p ON gp.player_id = p.id 
     WHERE gp.game_id = $1`,
    [gameId]
  );
  return result.rows;
}

// Message operations
export async function saveMessage(id: string, gameId: string, playerId: string, playerName: string, content: string) {
  const result = await pool.query(
    `INSERT INTO messages (id, game_id, player_id, player_name, content)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [id, gameId, playerId, playerName, content]
  );
  return result.rows[0];
}

export async function getMessages(gameId: string, since?: Date) {
  if (since) {
    const result = await pool.query(
      `SELECT * FROM messages WHERE game_id = $1 AND created_at > $2 ORDER BY created_at ASC`,
      [gameId, since]
    );
    return result.rows;
  }
  const result = await pool.query(
    `SELECT * FROM messages WHERE game_id = $1 ORDER BY created_at ASC`,
    [gameId]
  );
  return result.rows;
}

// Vote operations
export async function saveVote(id: string, gameId: string, voterId: string, targetId: string, round: number) {
  const result = await pool.query(
    `INSERT INTO votes (id, game_id, voter_id, target_id, round)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT DO NOTHING
     RETURNING *`,
    [id, gameId, voterId, targetId, round]
  );
  return result.rows[0];
}

export async function getVotes(gameId: string, round: number) {
  const result = await pool.query(
    `SELECT * FROM votes WHERE game_id = $1 AND round = $2`,
    [gameId, round]
  );
  return result.rows;
}
