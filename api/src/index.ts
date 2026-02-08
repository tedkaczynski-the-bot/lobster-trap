import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { router } from './routes';
import { initContract } from './contract';
import { initDb } from './db';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/trap', router);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'lobster-trap-api' });
});

// Initialize contract connection
const ORACLE_PRIVATE_KEY = process.env.ORACLE_PRIVATE_KEY;
if (!ORACLE_PRIVATE_KEY) {
  console.error('ORACLE_PRIVATE_KEY not set!');
  process.exit(1);
}

initContract(ORACLE_PRIVATE_KEY);

// Initialize database (optional - graceful fallback if not configured)
if (process.env.DATABASE_URL) {
  initDb().catch(err => {
    console.error('Database init failed:', err.message);
    console.log('Continuing with in-memory storage only');
  });
} else {
  console.log('DATABASE_URL not set - using in-memory storage only');
}

// Start server
app.listen(PORT, () => {
  console.log(`Lobster Trap API running on port ${PORT}`);
  console.log(`Endpoints:`);
  console.log(`  POST /api/trap/register`);
  console.log(`  GET  /api/trap/lobbies`);
  console.log(`  POST /api/trap/lobby/create`);
  console.log(`  POST /api/trap/lobby/:gameId/join`);
  console.log(`  GET  /api/trap/game/:gameId`);
  console.log(`  GET  /api/trap/game/:gameId/role`);
  console.log(`  GET  /api/trap/game/:gameId/messages`);
  console.log(`  POST /api/trap/game/:gameId/message`);
  console.log(`  POST /api/trap/game/:gameId/vote`);
  console.log(`  GET  /api/trap/games/live`);
  console.log(`  GET  /api/trap/game/:gameId/spectate`);
});
