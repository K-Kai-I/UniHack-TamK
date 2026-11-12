// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC4626} from "@openzeppelin/contracts/interfaces/IERC4626.sol";
import {DepositEscrow} from "../src/DepositEscrow.sol";
import {IDepositEscrow} from "../src/IDepositEscrow.sol";
import {MockUSDC} from "../src/MockUSDC.sol";

/// forge script script/Deploy.s.sol --rpc-url fuji --broadcast --verify
/// Sau khi chạy: chép 2 địa chỉ in ra vào shared/deployments.json, tăng abiVersion, chạy npm run export-abi.
contract Deploy is Script {
    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address aiSigner = vm.envAddress("AI_SIGNER_ADDRESS");
        address feeRecipient = vm.envAddress("FEE_RECIPIENT_ADDRESS");
        bool demo = vm.envOr("DEMO_TIMEOUTS", true);

        IDepositEscrow.Timeouts memory t = demo
            ? IDepositEscrow.Timeouts(3 minutes, 2 minutes, 2 minutes, 2 minutes, 2 minutes, 3 minutes, 3 minutes, 5 minutes)
            : IDepositEscrow.Timeouts(1 days, 2 days, 24 hours, 2 days, 1 days, 1 days, 1 days, 1 days);

        vm.startBroadcast(pk);
        MockUSDC usdc = new MockUSDC();
        DepositEscrow escrow =
            new DepositEscrow(IERC20(address(usdc)), aiSigner, feeRecipient, 1000, IERC4626(address(0)), t);
        vm.stopBroadcast();

        console.log("MockUSDC     ", address(usdc));
        console.log("DepositEscrow", address(escrow));
    }
}
