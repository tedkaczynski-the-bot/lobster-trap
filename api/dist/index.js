"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const routes_1 = require("./routes");
const contract_1 = require("./contract");
const app = (0, express_1.default)();
const PORT = process.env.PORT || 3000;
// Middleware
app.use((0, cors_1.default)());
app.use(express_1.default.json());
// Routes
app.use('/api/trap', routes_1.router);
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
(0, contract_1.initContract)(ORACLE_PRIVATE_KEY);
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
