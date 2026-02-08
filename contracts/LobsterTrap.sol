// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title LobsterTrap
 * @notice Social deduction game for AI agents on Clawmegle
 * @dev 5 players stake CLAWMEGLE, one is "The Trap", survivors vote to eliminate
 */
contract LobsterTrap is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ============ Constants ============
    
    uint256 public constant PLAYERS_PER_GAME = 5;
    uint256 public constant STAKE_AMOUNT = 100 * 10**18; // 100 CLAWMEGLE
    uint256 public constant FEE_BPS = 500; // 5% burn fee
    uint256 public constant LOBBY_TIMEOUT = 10 minutes;
    address public constant BURN_ADDRESS = 0x000000000000000000000000000000000000dEaD;

    // ============ State ============
    
    IERC20 public immutable clawmegle;
    address public oracle; // Backend server that reports game results
    
    enum GameState { Lobby, Active, Completed, Cancelled }
    
    struct Game {
        address[5] players;
        uint8 playerCount;
        GameState state;
        uint256 createdAt;
        uint256 totalPot;
    }
    
    mapping(uint256 => Game) public games;
    uint256 public gameCount;
    
    // Track active game per player (0 = not in game)
    mapping(address => uint256) public playerActiveGame;
    
    // ============ Events ============
    
    event GameCreated(uint256 indexed gameId, address indexed creator);
    event PlayerJoined(uint256 indexed gameId, address indexed player, uint8 playerCount);
    event GameStarted(uint256 indexed gameId, address[5] players);
    event GameCompleted(uint256 indexed gameId, address[] winners, uint256 prizePerWinner);
    event GameCancelled(uint256 indexed gameId);
    event PlayerRefunded(uint256 indexed gameId, address indexed player, uint256 amount);
    event OracleUpdated(address indexed oldOracle, address indexed newOracle);
    event TokensBurned(uint256 indexed gameId, uint256 amount);

    // ============ Errors ============
    
    error AlreadyInGame();
    error GameNotInLobby();
    error GameNotActive();
    error GameFull();
    error NotOracle();
    error InvalidWinners();
    error LobbyNotExpired();
    error NotInThisGame();
    error ZeroAddress();

    // ============ Modifiers ============
    
    modifier onlyOracle() {
        if (msg.sender != oracle) revert NotOracle();
        _;
    }

    // ============ Constructor ============
    
    constructor(
        address _clawmegle,
        address _oracle
    ) Ownable(msg.sender) {
        if (_clawmegle == address(0) || _oracle == address(0)) {
            revert ZeroAddress();
        }
        clawmegle = IERC20(_clawmegle);
        oracle = _oracle;
    }

    // ============ Player Functions ============
    
    /**
     * @notice Create a new game lobby and join it
     * @dev Creates game, transfers stake, adds creator as first player
     */
    function createGame() external nonReentrant returns (uint256 gameId) {
        if (playerActiveGame[msg.sender] != 0) revert AlreadyInGame();
        
        gameId = ++gameCount;
        Game storage game = games[gameId];
        
        game.players[0] = msg.sender;
        game.playerCount = 1;
        game.state = GameState.Lobby;
        game.createdAt = block.timestamp;
        game.totalPot = STAKE_AMOUNT;
        
        playerActiveGame[msg.sender] = gameId;
        
        clawmegle.safeTransferFrom(msg.sender, address(this), STAKE_AMOUNT);
        
        emit GameCreated(gameId, msg.sender);
        emit PlayerJoined(gameId, msg.sender, 1);
        
        return gameId;
    }
    
    /**
     * @notice Join an existing game lobby
     * @param gameId The game to join
     */
    function joinGame(uint256 gameId) external nonReentrant {
        if (playerActiveGame[msg.sender] != 0) revert AlreadyInGame();
        
        Game storage game = games[gameId];
        if (game.state != GameState.Lobby) revert GameNotInLobby();
        if (game.playerCount >= PLAYERS_PER_GAME) revert GameFull();
        
        uint8 newCount = game.playerCount + 1;
        game.players[game.playerCount] = msg.sender;
        game.playerCount = newCount;
        game.totalPot += STAKE_AMOUNT;
        
        playerActiveGame[msg.sender] = gameId;
        
        clawmegle.safeTransferFrom(msg.sender, address(this), STAKE_AMOUNT);
        
        emit PlayerJoined(gameId, msg.sender, newCount);
        
        // Auto-start when full
        if (newCount == PLAYERS_PER_GAME) {
            game.state = GameState.Active;
            emit GameStarted(gameId, game.players);
        }
    }
    
    /**
     * @notice Leave a lobby before game starts (get refund)
     * @param gameId The game to leave
     */
    function leaveLobby(uint256 gameId) external nonReentrant {
        Game storage game = games[gameId];
        if (game.state != GameState.Lobby) revert GameNotInLobby();
        if (playerActiveGame[msg.sender] != gameId) revert NotInThisGame();
        
        // Find and remove player
        bool found = false;
        for (uint8 i = 0; i < game.playerCount; i++) {
            if (game.players[i] == msg.sender) {
                // Shift remaining players
                for (uint8 j = i; j < game.playerCount - 1; j++) {
                    game.players[j] = game.players[j + 1];
                }
                game.players[game.playerCount - 1] = address(0);
                game.playerCount--;
                found = true;
                break;
            }
        }
        
        if (!found) revert NotInThisGame();
        
        game.totalPot -= STAKE_AMOUNT;
        playerActiveGame[msg.sender] = 0;
        
        clawmegle.safeTransfer(msg.sender, STAKE_AMOUNT);
        
        emit PlayerRefunded(gameId, msg.sender, STAKE_AMOUNT);
        
        // Cancel game if empty
        if (game.playerCount == 0) {
            game.state = GameState.Cancelled;
            emit GameCancelled(gameId);
        }
    }
    
    /**
     * @notice Cancel expired lobby and refund all players
     * @param gameId The game to cancel
     */
    function cancelExpiredLobby(uint256 gameId) external nonReentrant {
        Game storage game = games[gameId];
        if (game.state != GameState.Lobby) revert GameNotInLobby();
        if (block.timestamp < game.createdAt + LOBBY_TIMEOUT) revert LobbyNotExpired();
        
        game.state = GameState.Cancelled;
        
        // Refund all players
        for (uint8 i = 0; i < game.playerCount; i++) {
            address player = game.players[i];
            if (player != address(0)) {
                playerActiveGame[player] = 0;
                clawmegle.safeTransfer(player, STAKE_AMOUNT);
                emit PlayerRefunded(gameId, player, STAKE_AMOUNT);
            }
        }
        
        emit GameCancelled(gameId);
    }

    // ============ Oracle Functions ============
    
    /**
     * @notice Complete game and distribute prizes
     * @param gameId The game to complete
     * @param winners Array of winning addresses (survivors or trap)
     */
    function completeGame(
        uint256 gameId,
        address[] calldata winners
    ) external onlyOracle nonReentrant {
        Game storage game = games[gameId];
        if (game.state != GameState.Active) revert GameNotActive();
        if (winners.length == 0 || winners.length > PLAYERS_PER_GAME) revert InvalidWinners();
        
        // Verify all winners are players in this game
        for (uint256 i = 0; i < winners.length; i++) {
            bool isPlayer = false;
            for (uint8 j = 0; j < PLAYERS_PER_GAME; j++) {
                if (game.players[j] == winners[i]) {
                    isPlayer = true;
                    break;
                }
            }
            if (!isPlayer) revert InvalidWinners();
        }
        
        game.state = GameState.Completed;
        
        // Clear active game for all players
        for (uint8 i = 0; i < PLAYERS_PER_GAME; i++) {
            playerActiveGame[game.players[i]] = 0;
        }
        
        // Calculate payouts
        uint256 fee = (game.totalPot * FEE_BPS) / 10000;
        uint256 prize = game.totalPot - fee;
        uint256 prizePerWinner = prize / winners.length;
        
        // Burn the fee (deflationary)
        clawmegle.safeTransfer(BURN_ADDRESS, fee);
        emit TokensBurned(gameId, fee);
        
        // Distribute to winners
        for (uint256 i = 0; i < winners.length; i++) {
            clawmegle.safeTransfer(winners[i], prizePerWinner);
        }
        
        // Handle dust (remainder from division) - burn it too
        uint256 dust = prize - (prizePerWinner * winners.length);
        if (dust > 0) {
            clawmegle.safeTransfer(BURN_ADDRESS, dust);
        }
        
        emit GameCompleted(gameId, winners, prizePerWinner);
    }

    // ============ Admin Functions ============
    
    function setOracle(address _oracle) external onlyOwner {
        if (_oracle == address(0)) revert ZeroAddress();
        emit OracleUpdated(oracle, _oracle);
        oracle = _oracle;
    }

    // ============ View Functions ============
    
    function getGame(uint256 gameId) external view returns (
        address[5] memory players,
        uint8 playerCount,
        GameState state,
        uint256 createdAt,
        uint256 totalPot
    ) {
        Game storage game = games[gameId];
        return (
            game.players,
            game.playerCount,
            game.state,
            game.createdAt,
            game.totalPot
        );
    }
    
    function getOpenLobbies(uint256 limit) external view returns (uint256[] memory) {
        uint256[] memory lobbies = new uint256[](limit);
        uint256 count = 0;
        
        // Search from newest to oldest
        for (uint256 i = gameCount; i > 0 && count < limit; i--) {
            if (games[i].state == GameState.Lobby && games[i].playerCount < PLAYERS_PER_GAME) {
                lobbies[count++] = i;
            }
        }
        
        // Resize array
        assembly {
            mstore(lobbies, count)
        }
        
        return lobbies;
    }
    
    function isPlayerInGame(address player) external view returns (bool, uint256) {
        uint256 gameId = playerActiveGame[player];
        return (gameId != 0, gameId);
    }
}
