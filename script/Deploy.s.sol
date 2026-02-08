// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../contracts/LobsterTrap.sol";

contract DeployLobsterTrap is Script {
    // Base Mainnet addresses
    address constant CLAWMEGLE_TOKEN = 0x94fa5D6774eaC21a391Aced58086CCE241d3507c;
    
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address oracle = vm.envAddress("ORACLE_ADDRESS");
        
        vm.startBroadcast(deployerPrivateKey);
        
        LobsterTrap lobsterTrap = new LobsterTrap(
            CLAWMEGLE_TOKEN,
            oracle
        );
        
        console.log("LobsterTrap deployed to:", address(lobsterTrap));
        console.log("CLAWMEGLE token:", CLAWMEGLE_TOKEN);
        console.log("Oracle:", oracle);
        console.log("Burn address:", 0x000000000000000000000000000000000000dEaD);
        
        vm.stopBroadcast();
    }
}
