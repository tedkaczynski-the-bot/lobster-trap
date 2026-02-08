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
