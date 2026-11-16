// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {MockUSDC} from "./MockUSDC.sol";

/// @title MockVault
/// @notice Két sinh lãi giả lập cho demo (ERC-4626 trên MockUSDC). Không có chiến lược đầu tư thật:
///         `simulateYield` in thêm mUSDC vào két, làm giá mỗi cổ phần tăng, giống như lãi chảy về.
/// @dev Trên mạng thật, chỗ này là một vault ERC-4626 có thật (vd cho vay stablecoin). Contract
///      DepositEscrow chỉ biết chuẩn ERC-4626 nên đổi vault không phải sửa DepositEscrow.
contract MockVault is ERC4626 {
    constructor(IERC20 asset_) ERC20("Ket Coc Tro Vault Share", "kctVAULT") ERC4626(asset_) {}

    /// Tạo lãi giả: in `amount` mUSDC vào két. Ai gọi cũng được (chỉ để demo trên testnet).
    function simulateYield(uint256 amount) external {
        MockUSDC(address(asset())).mint(address(this), amount);
    }

    function decimals() public view override returns (uint8) {
        return IERC20Metadata(asset()).decimals();
    }
}
