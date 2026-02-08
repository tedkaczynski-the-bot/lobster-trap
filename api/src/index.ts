import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { router } from './routes';
import { initContract } from './contract';

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
