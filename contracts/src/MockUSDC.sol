// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";

/// @title MockUSDC
/// @notice Stablecoin test cho Fuji: 6 số lẻ, có permit (ERC-2612), ai cũng tự phát tiền được.
contract MockUSDC is ERC20, ERC20Permit {
    uint256 public constant FAUCET_AMOUNT = 1_000 * 1e6; // 1.000 mUSDC

    constructor() ERC20("Mock USDC", "mUSDC") ERC20Permit("Mock USDC") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    /// Phát 1.000 mUSDC cho người gọi.
    function faucet() external {
        _mint(msg.sender, FAUCET_AMOUNT);
    }

    /// Phát tiền cho địa chỉ bất kỳ (server faucet dùng).
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
