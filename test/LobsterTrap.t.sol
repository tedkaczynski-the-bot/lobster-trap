// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../contracts/LobsterTrap.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

// Mock CLAWMEGLE token for testing
contract MockCLAWMEGLE is ERC20 {
    constructor() ERC20("CLAWMEGLE", "CLAWMEGLE") {
        _mint(msg.sender, 1_000_000 * 10**18);
    }
    
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract LobsterTrapTest is Test {
    LobsterTrap public game;
    MockCLAWMEGLE public token;
    
    address public owner = address(this);
    address public oracle = address(0x1);
    address public player1 = address(0x10);
    address public player2 = address(0x20);
    address public player3 = address(0x30);
    address public player4 = address(0x40);
    address public player5 = address(0x50);
    
    address constant BURN_ADDRESS = 0x000000000000000000000000000000000000dEaD;
    uint256 constant STAKE = 100 * 10**18;
    
    function setUp() public {
        token = new MockCLAWMEGLE();
        game = new LobsterTrap(address(token), oracle);
        
        // Fund players
        token.mint(player1, 1000 * 10**18);
        token.mint(player2, 1000 * 10**18);
        token.mint(player3, 1000 * 10**18);
        token.mint(player4, 1000 * 10**18);
        token.mint(player5, 1000 * 10**18);
        
        // Approve game contract
        vm.prank(player1);
        token.approve(address(game), type(uint256).max);
        vm.prank(player2);
        token.approve(address(game), type(uint256).max);
        vm.prank(player3);
        token.approve(address(game), type(uint256).max);
        vm.prank(player4);
        token.approve(address(game), type(uint256).max);
        vm.prank(player5);
        token.approve(address(game), type(uint256).max);
    }
    
    // ============ Game Creation Tests ============
    
    function test_CreateGame() public {
        vm.prank(player1);
        uint256 gameId = game.createGame();
        
        assertEq(gameId, 1);
        
        (address[5] memory players, uint8 playerCount, LobsterTrap.GameState state, , uint256 totalPot) = game.getGame(gameId);
        
        assertEq(players[0], player1);
        assertEq(playerCount, 1);
        assertEq(uint8(state), uint8(LobsterTrap.GameState.Lobby));
        assertEq(totalPot, STAKE);
        
        // Check token transferred
        assertEq(token.balanceOf(address(game)), STAKE);
    }
    
    function test_CreateGame_TransfersTokens() public {
        uint256 balanceBefore = token.balanceOf(player1);
        
        vm.prank(player1);
        game.createGame();
        
        assertEq(token.balanceOf(player1), balanceBefore - STAKE);
    }
    
    function test_CreateGame_CantCreateWhileInGame() public {
        vm.prank(player1);
        game.createGame();
        
        vm.prank(player1);
        vm.expectRevert(LobsterTrap.AlreadyInGame.selector);
        game.createGame();
    }
    
    // ============ Join Game Tests ============
    
    function test_JoinGame() public {
        vm.prank(player1);
        uint256 gameId = game.createGame();
        
        vm.prank(player2);
        game.joinGame(gameId);
        
        (, uint8 playerCount, , , uint256 totalPot) = game.getGame(gameId);
        assertEq(playerCount, 2);
        assertEq(totalPot, STAKE * 2);
    }
    
    function test_JoinGame_AutoStartsWhenFull() public {
        vm.prank(player1);
        uint256 gameId = game.createGame();
        
        vm.prank(player2);
        game.joinGame(gameId);
        
        vm.prank(player3);
        game.joinGame(gameId);
        
        vm.prank(player4);
        game.joinGame(gameId);
        
        vm.prank(player5);
        game.joinGame(gameId);
        
        (, uint8 playerCount, LobsterTrap.GameState state, , uint256 totalPot) = game.getGame(gameId);
        
        assertEq(playerCount, 5);
        assertEq(uint8(state), uint8(LobsterTrap.GameState.Active));
        assertEq(totalPot, STAKE * 5);
    }
    
    function test_JoinGame_CantJoinFullGame() public {
        vm.prank(player1);
        uint256 gameId = game.createGame();
        
        vm.prank(player2);
        game.joinGame(gameId);
        vm.prank(player3);
        game.joinGame(gameId);
        vm.prank(player4);
        game.joinGame(gameId);
        vm.prank(player5);
        game.joinGame(gameId);
        
        // Game is now Active (auto-started), not Lobby
        address player6 = address(0x60);
        token.mint(player6, 1000 * 10**18);
        vm.prank(player6);
        token.approve(address(game), type(uint256).max);
        
        vm.prank(player6);
        vm.expectRevert(LobsterTrap.GameNotInLobby.selector);
        game.joinGame(gameId);
    }
    
    function test_JoinGame_CantJoinWhileInGame() public {
        vm.prank(player1);
        uint256 gameId = game.createGame();
        
        vm.prank(player1);
        vm.expectRevert(LobsterTrap.AlreadyInGame.selector);
        game.joinGame(gameId);
    }
    
    // ============ Leave Lobby Tests ============
    
    function test_LeaveLobby() public {
        vm.prank(player1);
        uint256 gameId = game.createGame();
        
        uint256 balanceBefore = token.balanceOf(player1);
        
        vm.prank(player1);
        game.leaveLobby(gameId);
        
        assertEq(token.balanceOf(player1), balanceBefore + STAKE);
        
        (, uint8 playerCount, LobsterTrap.GameState state, , ) = game.getGame(gameId);
        assertEq(playerCount, 0);
        assertEq(uint8(state), uint8(LobsterTrap.GameState.Cancelled));
    }
    
    function test_LeaveLobby_MiddlePlayer() public {
        vm.prank(player1);
        uint256 gameId = game.createGame();
        
        vm.prank(player2);
        game.joinGame(gameId);
        
        vm.prank(player3);
        game.joinGame(gameId);
        
        // Player 2 leaves
        vm.prank(player2);
        game.leaveLobby(gameId);
        
        (address[5] memory players, uint8 playerCount, , , ) = game.getGame(gameId);
        assertEq(playerCount, 2);
        assertEq(players[0], player1);
        assertEq(players[1], player3); // Player 3 shifted to index 1
    }
    
    function test_LeaveLobby_CantLeaveActiveGame() public {
        _fillGame();
        
        vm.prank(player1);
        vm.expectRevert(LobsterTrap.GameNotInLobby.selector);
        game.leaveLobby(1);
    }
    
    // ============ Cancel Expired Lobby Tests ============
    
    function test_CancelExpiredLobby() public {
        vm.prank(player1);
        uint256 gameId = game.createGame();
        
        vm.prank(player2);
        game.joinGame(gameId);
        
        // Fast forward past timeout
        vm.warp(block.timestamp + 11 minutes);
        
        uint256 balance1Before = token.balanceOf(player1);
        uint256 balance2Before = token.balanceOf(player2);
        
        game.cancelExpiredLobby(gameId);
        
        assertEq(token.balanceOf(player1), balance1Before + STAKE);
        assertEq(token.balanceOf(player2), balance2Before + STAKE);
        
        (, , LobsterTrap.GameState state, , ) = game.getGame(gameId);
        assertEq(uint8(state), uint8(LobsterTrap.GameState.Cancelled));
    }
    
    function test_CancelExpiredLobby_CantCancelBeforeTimeout() public {
        vm.prank(player1);
        uint256 gameId = game.createGame();
        
        vm.expectRevert(LobsterTrap.LobbyNotExpired.selector);
        game.cancelExpiredLobby(gameId);
    }
    
    // ============ Complete Game Tests ============
    
    function test_CompleteGame_TrapWins() public {
        uint256 gameId = _fillGame();
        
        // Trap wins - gets everything minus fee
        address[] memory winners = new address[](1);
        winners[0] = player1;
        
        uint256 burnBefore = token.balanceOf(BURN_ADDRESS);
        uint256 player1Before = token.balanceOf(player1);
        
        vm.prank(oracle);
        game.completeGame(gameId, winners);
        
        // 500 total pot, 5% = 25 burned, 475 to winner
        assertEq(token.balanceOf(BURN_ADDRESS), burnBefore + 25 * 10**18);
        assertEq(token.balanceOf(player1), player1Before + 475 * 10**18);
        
        (, , LobsterTrap.GameState state, , ) = game.getGame(gameId);
        assertEq(uint8(state), uint8(LobsterTrap.GameState.Completed));
    }
    
    function test_CompleteGame_SurvivorsWin() public {
        uint256 gameId = _fillGame();
        
        // 3 survivors split the pot
        address[] memory winners = new address[](3);
        winners[0] = player2;
        winners[1] = player3;
        winners[2] = player4;
        
        uint256 burnBefore = token.balanceOf(BURN_ADDRESS);
        uint256 player2Before = token.balanceOf(player2);
        uint256 player3Before = token.balanceOf(player3);
        uint256 player4Before = token.balanceOf(player4);
        
        vm.prank(oracle);
        game.completeGame(gameId, winners);
        
        // 500 total, 25 burned, 475 / 3 = 158.33... each
        uint256 prizePool = 475 * 10**18;
        uint256 prizePerWinner = prizePool / 3;
        
        assertEq(token.balanceOf(player2), player2Before + prizePerWinner);
        assertEq(token.balanceOf(player3), player3Before + prizePerWinner);
        assertEq(token.balanceOf(player4), player4Before + prizePerWinner);
        
        // Dust also burned
        uint256 expectedBurn = 25 * 10**18 + (475 * 10**18 - prizePerWinner * 3);
        assertEq(token.balanceOf(BURN_ADDRESS), burnBefore + expectedBurn);
    }
    
    function test_CompleteGame_OnlyOracle() public {
        uint256 gameId = _fillGame();
        
        address[] memory winners = new address[](1);
        winners[0] = player1;
        
        vm.prank(player1);
        vm.expectRevert(LobsterTrap.NotOracle.selector);
        game.completeGame(gameId, winners);
    }
    
    function test_CompleteGame_CantCompleteNonActiveGame() public {
        vm.prank(player1);
        uint256 gameId = game.createGame();
        
        address[] memory winners = new address[](1);
        winners[0] = player1;
        
        vm.prank(oracle);
        vm.expectRevert(LobsterTrap.GameNotActive.selector);
        game.completeGame(gameId, winners);
    }
    
    function test_CompleteGame_InvalidWinners() public {
        uint256 gameId = _fillGame();
        
        // Non-player as winner
        address[] memory winners = new address[](1);
        winners[0] = address(0x999);
        
        vm.prank(oracle);
        vm.expectRevert(LobsterTrap.InvalidWinners.selector);
        game.completeGame(gameId, winners);
    }
    
    function test_CompleteGame_EmptyWinners() public {
        uint256 gameId = _fillGame();
        
        address[] memory winners = new address[](0);
        
        vm.prank(oracle);
        vm.expectRevert(LobsterTrap.InvalidWinners.selector);
        game.completeGame(gameId, winners);
    }
    
    function test_CompleteGame_ClearsPlayerActiveGame() public {
        uint256 gameId = _fillGame();
        
        (bool inGame, ) = game.isPlayerInGame(player1);
        assertTrue(inGame);
        
        address[] memory winners = new address[](1);
        winners[0] = player1;
        
        vm.prank(oracle);
        game.completeGame(gameId, winners);
        
        (inGame, ) = game.isPlayerInGame(player1);
        assertFalse(inGame);
    }
    
    // ============ Admin Tests ============
    
    function test_SetOracle() public {
        address newOracle = address(0x999);
        game.setOracle(newOracle);
        assertEq(game.oracle(), newOracle);
    }
    
    function test_SetOracle_OnlyOwner() public {
        vm.prank(player1);
        vm.expectRevert();
        game.setOracle(address(0x999));
    }
    
    function test_SetOracle_CantSetZero() public {
        vm.expectRevert(LobsterTrap.ZeroAddress.selector);
        game.setOracle(address(0));
    }
    
    // ============ View Functions Tests ============
    
    function test_GetOpenLobbies() public {
        vm.prank(player1);
        game.createGame();
        
        vm.prank(player2);
        game.createGame();
        
        uint256[] memory lobbies = game.getOpenLobbies(10);
        assertEq(lobbies.length, 2);
        assertEq(lobbies[0], 2); // Newest first
        assertEq(lobbies[1], 1);
    }
    
    function test_GetOpenLobbies_ExcludesFull() public {
        _fillGame(); // Game 1 - full/active
        
        vm.prank(player1); // Now player1 is free again after game completes... wait no
        // Actually player1 is still in game1. Let's use a new player
        address player6 = address(0x60);
        token.mint(player6, 1000 * 10**18);
        vm.prank(player6);
        token.approve(address(game), type(uint256).max);
        
        vm.prank(player6);
        game.createGame(); // Game 2 - lobby
        
        uint256[] memory lobbies = game.getOpenLobbies(10);
        assertEq(lobbies.length, 1);
        assertEq(lobbies[0], 2);
    }
    
    function test_IsPlayerInGame() public {
        (bool inGame, uint256 gameId) = game.isPlayerInGame(player1);
        assertFalse(inGame);
        assertEq(gameId, 0);
        
        vm.prank(player1);
        uint256 createdGameId = game.createGame();
        
        (inGame, gameId) = game.isPlayerInGame(player1);
        assertTrue(inGame);
        assertEq(gameId, createdGameId);
    }
    
    // ============ Helpers ============
    
    function _fillGame() internal returns (uint256) {
        vm.prank(player1);
        uint256 gameId = game.createGame();
        
        vm.prank(player2);
        game.joinGame(gameId);
        
        vm.prank(player3);
        game.joinGame(gameId);
        
        vm.prank(player4);
        game.joinGame(gameId);
        
        vm.prank(player5);
        game.joinGame(gameId);
        
        return gameId;
    }
}
