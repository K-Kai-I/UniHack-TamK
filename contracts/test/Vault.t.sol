// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC4626} from "@openzeppelin/contracts/interfaces/IERC4626.sol";
import {DepositEscrow} from "../src/DepositEscrow.sol";
import {IDepositEscrow} from "../src/IDepositEscrow.sol";
import {MockUSDC} from "../src/MockUSDC.sol";
import {MockVault} from "../src/MockVault.sol";

/// Test vault (P2): lãi chốt đúng lúc rút, phí sàn đúng 10%, phần còn lại chia đôi (lẻ về người thuê).
contract VaultTest is Test {
    DepositEscrow escrow;
    MockUSDC usdc;
    MockVault vault;

    address landlord = makeAddr("landlord");
    address tenant = makeAddr("tenant");
    address tenant2 = makeAddr("tenant2");
    address fee = makeAddr("fee");

    uint256 constant C = 240e6;
    uint256 constant R = 20e6;
    bytes32 constant TERMS = keccak256("terms");
    bytes32 constant CHECKIN = keccak256("checkin");
    bytes32 constant CHECKOUT = keccak256("checkout");
    uint256 constant AI_KEY = 0xA11CE;

    function setUp() public {
        usdc = new MockUSDC();
        vault = new MockVault(IERC20(address(usdc)));
        IDepositEscrow.Timeouts memory t = IDepositEscrow.Timeouts(
            3 minutes, 2 minutes, 2 minutes, 2 minutes, 2 minutes, 3 minutes, 3 minutes, 5 minutes
        );
        escrow = new DepositEscrow(IERC20(address(usdc)), vm.addr(AI_KEY), fee, 1000, IERC4626(address(vault)), t);
        usdc.mint(tenant, 1_000e6);
        usdc.mint(tenant2, 1_000e6);
    }

    function _deal(bool yieldEnabled) internal returns (uint256 id) {
        vm.prank(landlord);
        id = escrow.createDeal(
            C, R, uint64(block.timestamp + 1 days), uint64(block.timestamp + 180 days), yieldEnabled, TERMS
        );
    }

    function _deposit(address who, uint256 id, bool wantYield) internal {
        vm.startPrank(who);
        usdc.approve(address(escrow), C);
        escrow.deposit(id, wantYield);
        vm.stopPrank();
    }

    function _toCheckedOut(address who, uint256 id) internal {
        vm.prank(who);
        escrow.submitCheckIn(id, CHECKIN);
        vm.warp(block.timestamp + 2 minutes + 1);
        vm.prank(who);
        escrow.submitCheckOut(id, CHECKOUT);
    }

    function test_vault_depositGoesToVault() public {
        uint256 id = _deal(true);
        _deposit(tenant, id, true);
        IDepositEscrow.Deal memory d = escrow.getDeal(id);
        assertTrue(d.yieldOn);
        assertGt(d.vaultShares, 0);
        assertEq(usdc.balanceOf(address(escrow)), 0, "tien nam trong vault");
        assertEq(vault.totalAssets(), C);
    }

    function test_vault_skippedWhenLandlordDisallows_orTenantDeclines() public {
        uint256 a = _deal(false);
        _deposit(tenant, a, true);
        assertFalse(escrow.getDeal(a).yieldOn);
        uint256 b = _deal(true);
        _deposit(tenant2, b, false);
        assertFalse(escrow.getDeal(b).yieldOn);
        assertEq(usdc.balanceOf(address(escrow)), 2 * C);
    }

    /// Lãi 10 mUSDC: phí 1 (10%), còn 9 chia đôi 4,5 / 4,5. Không trừ hư hỏng.
    function test_vault_yieldSplit_feeTenPercent() public {
        uint256 id = _deal(true);
        _deposit(tenant, id, true);
        vault.simulateYield(10e6);
        _toCheckedOut(tenant, id);

        uint256 G = escrow.getDeal(id).yieldGross;
        assertApproxEqAbs(G, 10e6, 2, "lai chot luc tra phong");
        assertFalse(escrow.getDeal(id).yieldOn);

        vm.prank(landlord);
        escrow.proposeDeduction(id, 0, 0, bytes32(0), "");
        uint256 F = G * 1000 / 10000;
        uint256 L = G - F;
        assertEq(usdc.balanceOf(fee), F, "phi dung 10%");
        assertEq(usdc.balanceOf(landlord), L / 2);
        assertEq(usdc.balanceOf(tenant), 1_000e6 - C + C + (L - L / 2), "le ve nguoi thue");
        assertEq(usdc.balanceOf(address(escrow)), 0);
    }

    /// Lãi sinh ra SAU lúc trả phòng không tính cho deal này (đã rút khỏi vault).
    function test_vault_yieldLockedAtCheckout() public {
        uint256 id = _deal(true);
        _deposit(tenant, id, true);
        vault.simulateYield(4e6);
        _toCheckedOut(tenant, id);
        uint256 G = escrow.getDeal(id).yieldGross;
        vault.simulateYield(100e6);
        vm.prank(landlord);
        escrow.proposeDeduction(id, 0, 0, bytes32(0), "");
        assertEq(usdc.balanceOf(tenant) + usdc.balanceOf(landlord) + usdc.balanceOf(fee), 1_000e6 + G);
    }

    /// Không đến (NO_SHOW) khi tiền đang ở vault: rút trước rồi chia, người thuê nhận C − R + L.
    function test_vault_noShow_withdrawsFirst() public {
        uint256 id = _deal(true);
        _deposit(tenant, id, true);
        vault.simulateYield(2e6);
        vm.warp(block.timestamp + 1 days + 3 minutes + 1);
        escrow.poke(id);
        uint256 G = escrow.getDeal(id).yieldGross;
        uint256 L = G - G * 1000 / 10000;
        assertEq(usdc.balanceOf(landlord), R);
        assertEq(usdc.balanceOf(tenant), 1_000e6 - C + C - R + L);
        assertEq(usdc.balanceOf(address(escrow)), 0);
    }

    /// Hai deal cùng vault: lãi chia theo cổ phần, rút deal này không đụng tiền deal kia.
    function test_vault_twoDeals_shareYieldAndStayIsolated() public {
        uint256 a = _deal(true);
        uint256 b = _deal(true);
        _deposit(tenant, a, true);
        _deposit(tenant2, b, true);
        vault.simulateYield(20e6);
        _toCheckedOut(tenant, a);
        assertApproxEqAbs(escrow.getDeal(a).yieldGross, 10e6, 2);
        vm.prank(landlord);
        escrow.proposeDeduction(a, 0, 0, bytes32(0), "");
        // deal b vẫn còn nguyên cổ phần, đủ gốc
        assertGe(vault.previewRedeem(escrow.getDeal(b).vaultShares), C);
    }

    /// Fuzz: lãi bất kỳ và mức trừ bất kỳ, tổng chi ra luôn = C + G và két về 0.
    function testFuzz_vault_sumsToDepositPlusYield(uint256 yieldAmt, uint256 D) public {
        yieldAmt = bound(yieldAmt, 0, 1_000e6);
        D = bound(D, 0, C);
        uint256 id = _deal(true);
        _deposit(tenant, id, true);
        if (yieldAmt > 0) vault.simulateYield(yieldAmt);
        _toCheckedOut(tenant, id);
        uint256 G = escrow.getDeal(id).yieldGross;
        vm.prank(landlord);
        escrow.proposeDeduction(id, D, 0, bytes32(0), "");
        if (D > 0) {
            vm.prank(tenant);
            escrow.acceptProposal(id);
        }
        assertEq(usdc.balanceOf(address(escrow)), 0);
        assertEq(usdc.balanceOf(tenant) + usdc.balanceOf(landlord) + usdc.balanceOf(fee), 1_000e6 + G);
    }

    /// Luồng chuẩn đủ 7 bước, số tiền đúng ví dụ ở mục "Chia tiền" của contract-spec:
    /// C = 6.000.000, G = 222.222, F = 22.222, L = 200.000, D = 400.000
    /// → người thuê 5.700.000, chủ trọ 500.000.
    function test_fullFlow_sevenSteps_matchesSpecExample() public {
        uint256 c = 6_000_000;
        // 1. Đăng phòng
        vm.prank(landlord);
        uint256 id = escrow.createDeal(
            c, 500_000, uint64(block.timestamp + 1 days), uint64(block.timestamp + 30 days), true, TERMS
        );
        uint256 tenantStart = usdc.balanceOf(tenant);
        // 2. Gửi cọc, có sinh lãi
        vm.startPrank(tenant);
        usdc.approve(address(escrow), c);
        escrow.deposit(id, true);
        // 3. Ảnh nhận phòng
        escrow.submitCheckIn(id, CHECKIN);
        vm.stopPrank();
        // 4. Hết hạn phản đối, ai cũng poke được: sang Đang ở
        vm.warp(block.timestamp + 2 minutes + 1);
        escrow.poke(id);
        assertEq(uint8(escrow.getDeal(id).state), uint8(IDepositEscrow.State.ACTIVE));
        // Vault sinh lãi trong lúc ở (222.223 vào két → deal rút về đúng 222.222 sau làm tròn ERC-4626)
        vault.simulateYield(222_223);
        // 5. Trả phòng: lãi được chốt
        vm.prank(tenant);
        escrow.submitCheckOut(id, CHECKOUT);
        assertEq(escrow.getDeal(id).yieldGross, 222_222);
        // 6. Đề xuất trừ 400.000, kèm con dấu AI
        bytes32 structHash = keccak256(
            abi.encode(escrow.DAMAGE_REPORT_TYPEHASH(), id, CHECKIN, CHECKOUT, uint256(400_000), bytes32("r"))
        );
        (uint8 v, bytes32 r, bytes32 s2) =
            vm.sign(AI_KEY, keccak256(abi.encodePacked("\x19\x01", escrow.domainSeparator(), structHash)));
        vm.prank(landlord);
        escrow.proposeDeduction(id, 400_000, 400_000, bytes32("r"), abi.encodePacked(r, s2, v));
        // 7. Người thuê đồng ý: chia tiền
        vm.prank(tenant);
        escrow.acceptProposal(id);

        assertEq(usdc.balanceOf(tenant) - (tenantStart - c), 5_700_000, "nguoi thue");
        assertEq(usdc.balanceOf(landlord), 500_000, "chu tro");
        assertEq(usdc.balanceOf(fee), 22_222, "phi san");
        assertEq(uint8(escrow.getDeal(id).state), uint8(IDepositEscrow.State.SETTLED));
    }

    // ------------------------------------------------------------ vault rỗng bị "tặng" tiền (rà soát 16/11)

    /// Lỗi lạm phát cổ phần: vault rỗng bị chuyển thẳng 500 mUSDC vào trước. Nếu vẫn gửi, người thuê nhận 0
    /// cổ phần và mất cọc. Contract phát hiện giá cổ phần bất thường nên KHÔNG gửi vào vault: cọc nằm trong két,
    /// người thuê chỉ mất phần lãi, không mất gốc.
    function test_vault_inflatedShares_depositStaysInEscrow() public {
        vault.simulateYield(500e6); // "tặng" 500 mUSDC vào vault rỗng
        uint256 id = _deal(true);
        _deposit(tenant, id, true);
        IDepositEscrow.Deal memory d = escrow.getDeal(id);
        assertFalse(d.yieldOn, "khong gui vao vault");
        assertEq(d.vaultShares, 0);
        assertEq(usdc.balanceOf(address(escrow)), C, "coc nam yen trong ket");

        _toCheckedOut(tenant, id);
        vm.prank(landlord);
        escrow.proposeDeduction(id, 0, 0, bytes32(0), "");
        assertEq(usdc.balanceOf(tenant), 1_000e6, "nhan lai du coc");
    }

    /// Kẻ phá đám in tiền miễn phí và "tặng" thật nhiều (1.000 tỉ mUSDC) dù vault đã có mồi:
    /// mồi không còn đủ, nhưng contract vẫn chặn nên người thuê không mất gốc.
    function test_vault_hugeGriefing_evenWithSeed_depositStaysInEscrow() public {
        usdc.mint(address(this), 1_000e6);
        usdc.approve(address(vault), 1_000e6);
        vault.deposit(1_000e6, address(0xdead));
        vault.simulateYield(1_000_000_000_000e6);
        uint256 id = _deal(true);
        _deposit(tenant, id, true);
        assertFalse(escrow.getDeal(id).yieldOn);
        assertEq(usdc.balanceOf(address(escrow)), C);
    }

    /// Lớp bảo vệ thứ hai (script deploy làm sẵn): gửi mồi 1.000 mUSDC cho địa chỉ chết ngay khi tạo vault.
    /// Có mồi thì cú "tặng" 500 mUSDC chỉ còn là lãi chia đều: người thuê vẫn được gửi vào vault và rút đủ.
    function test_vault_emptyVaultDonation_blockedBySeedDeposit() public {
        usdc.mint(address(this), 1_000e6);
        usdc.approve(address(vault), 1_000e6);
        vault.deposit(1_000e6, address(0xdead));

        vault.simulateYield(500e6);
        uint256 id = _deal(true);
        _deposit(tenant, id, true);
        uint256 redeemable = vault.previewRedeem(escrow.getDeal(id).vaultShares);
        assertTrue(escrow.getDeal(id).yieldOn, "co moi: van duoc gui vao vault");
        assertApproxEqAbs(redeemable, C, 2, "co moi: rut lai du tien coc");
    }
}
