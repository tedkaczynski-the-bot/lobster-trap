export type GamePhase = 'lobby' | 'discussion' | 'voting' | 'reveal' | 'completed';
export type PlayerRole = 'trap' | 'survivor';

export interface Player {
  id: string;
  name: string;
  wallet: string;
  apiKey: string;
  createdAt: Date;
}

export interface GamePlayer {
  playerId: string;
  name: string;
  wallet: string;
  role?: PlayerRole;
  isAlive: boolean;
  hasVoted: boolean;
}

export interface Message {
  id: string;
  gameId: string;
  playerId: string;
  playerName: string;
  content: string;
  timestamp: Date;
}

export interface Vote {
  voterId: string;
  targetId: string;
}

export interface Game {
  id: string;
  onchainGameId?: number;
  phase: GamePhase;
  round: number;
  players: GamePlayer[];
  messages: Message[];
  votes: Vote[];
  eliminated: string[]; // player IDs
  trapId?: string;
  winner?: 'trap' | 'survivors';
  createdAt: Date;
  phaseEndsAt?: Date;
}

export interface GameState {
  games: Map<string, Game>;
  players: Map<string, Player>;
  apiKeyToPlayer: Map<string, string>;
}
