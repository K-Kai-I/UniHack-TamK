// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC4626} from "@openzeppelin/contracts/interfaces/IERC4626.sol";
import {DepositEscrow} from "../src/DepositEscrow.sol";
import {IDepositEscrow} from "../src/IDepositEscrow.sol";
import {MockUSDC} from "../src/MockUSDC.sol";
import {MockVault} from "../src/MockVault.sol";

/// forge script script/Deploy.s.sol --rpc-url fuji --broadcast --verify
/// Sau khi chạy: chép 2 địa chỉ in ra vào shared/deployments.json, tăng abiVersion, chạy npm run export-abi.
contract Deploy is Script {
    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address aiSigner = vm.envAddress("AI_SIGNER_ADDRESS");
        address feeRecipient = vm.envAddress("FEE_RECIPIENT_ADDRESS");
        bool demo = vm.envOr("DEMO_TIMEOUTS", true);
        // Vault sinh lãi (P2). USE_VAULT=false trong contracts/.env để deploy không có vault.
        bool useVault = vm.envOr("USE_VAULT", true);
        // Ví bồi thẩm, cách nhau bằng dấu phẩy (contracts/.env: JUROR_ADDRESSES=0x...,0x...). Không có thì bỏ qua.
        address[] memory jurors = vm.envOr("JUROR_ADDRESSES", ",", new address[](0));

        IDepositEscrow.Timeouts memory t = demo
            ? IDepositEscrow.Timeouts(
                3 minutes, 2 minutes, 2 minutes, 2 minutes, 2 minutes, 3 minutes, 3 minutes, 5 minutes
            )
            : IDepositEscrow.Timeouts(1 days, 2 days, 24 hours, 2 days, 1 days, 1 days, 1 days, 1 days);

        vm.startBroadcast(pk);
        MockUSDC usdc = new MockUSDC();
        IERC4626 vault = useVault ? IERC4626(address(new MockVault(IERC20(address(usdc))))) : IERC4626(address(0));
        DepositEscrow escrow = new DepositEscrow(IERC20(address(usdc)), aiSigner, feeRecipient, 1000, vault, t);
        for (uint256 i = 0; i < jurors.length; i++) {
            escrow.addJuror(jurors[i]);
        }
        vm.stopBroadcast();

        console.log("MockUSDC     ", address(usdc));
        console.log("DepositEscrow", address(escrow));
        console.log("MockVault    ", address(vault));
        for (uint256 i = 0; i < jurors.length; i++) {
            console.log("Juror        ", jurors[i]);
        }
    }
}
