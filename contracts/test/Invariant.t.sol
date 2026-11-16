// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC4626} from "@openzeppelin/contracts/interfaces/IERC4626.sol";
import {DepositEscrow} from "../src/DepositEscrow.sol";
import {IDepositEscrow} from "../src/IDepositEscrow.sol";
import {MockUSDC} from "../src/MockUSDC.sol";
import {MockVault} from "../src/MockVault.sol";

/// Người chơi ngẫu nhiên: Foundry gọi các hàm dưới đây theo thứ tự và tham số bất kỳ, hàng nghìn lần.
/// Mỗi hàm đóng vai chủ trọ, người thuê, bồi thẩm hoặc người lạ, kể cả gọi sai lúc (revert thì bỏ qua).
contract Handler is Test {
    DepositEscrow public escrow;
    MockUSDC public usdc;
    MockVault public vault;
    address[3] public landlords = [address(0xA1), address(0xA2), address(0xA3)];
    address[3] public tenants = [address(0xB1), address(0xB2), address(0xB3)];
    address[2] public jurors = [address(0xC1), address(0xC2)];

    constructor(DepositEscrow e, MockUSDC u, MockVault v) {
        escrow = e;
        usdc = u;
        vault = v;
        for (uint256 i = 0; i < 3; i++) {
            usdc.mint(tenants[i], 1e12);
            vm.prank(tenants[i]);
            usdc.approve(address(e), type(uint256).max);
        }
    }

    /// Đếm số deal từng tới mỗi trạng thái, để chắc test không "qua" chỉ vì chưa đi sâu.
    mapping(IDepositEscrow.State => uint256) public reached;
    uint256 public reachedVault;

    function _note(uint256 id) internal {
        if (id == 0) return;
        IDepositEscrow.Deal memory d = escrow.getDeal(id);
        reached[d.state]++;
        if (d.yieldOn) reachedVault++;
    }

    function _id(uint256 seed) internal view returns (uint256) {
        uint256 n = escrow.dealCount();
        return n == 0 ? 0 : bound(seed, 1, n);
    }

    function createDeal(uint256 who, uint256 amount, uint256 fee, bool yieldEnabled) external {
        if (escrow.dealCount() >= 40) return;
        amount = bound(amount, 1, 1e9);
        fee = bound(fee, 0, amount);
        vm.prank(landlords[who % 3]);
        escrow.createDeal(
            amount,
            fee,
            uint64(block.timestamp + 10 minutes),
            uint64(block.timestamp + 2 hours),
            yieldEnabled,
            keccak256("t")
        );
    }

    function deposit(uint256 who, uint256 seed, bool wantYield) external {
        uint256 id = _id(seed); // tính trước vm.prank: prank chỉ áp cho đúng 1 lời gọi kế tiếp
        vm.prank(tenants[who % 3]);
        try escrow.deposit(id, wantYield) {} catch {}
        _note(id);
    }

    function cancel(uint256 seed) external {
        uint256 id = _id(seed);
        vm.prank(escrow.getDeal(id).landlord);
        try escrow.cancelDeal(id) {} catch {}
        _note(id);
    }

    function checkIn(uint256 seed) external {
        uint256 id = _id(seed);
        vm.prank(escrow.getDeal(id).tenant);
        try escrow.submitCheckIn(id, keccak256("in")) {} catch {}
        _note(id);
    }

    function contestCheckIn(uint256 seed) external {
        uint256 id = _id(seed);
        vm.prank(escrow.getDeal(id).landlord);
        try escrow.contestCheckIn(id) {} catch {}
        _note(id);
    }

    function checkOut(uint256 seed, bool byLandlord) external {
        uint256 id = _id(seed);
        IDepositEscrow.Deal memory d = escrow.getDeal(id);
        vm.prank(byLandlord ? d.landlord : d.tenant);
        try escrow.submitCheckOut(id, keccak256("out")) {} catch {}
        _note(id);
    }

    function propose(uint256 seed, uint256 amount) external {
        uint256 id = _id(seed);
        IDepositEscrow.Deal memory d = escrow.getDeal(id);
        vm.prank(d.landlord);
        try escrow.proposeDeduction(id, bound(amount, 0, d.deposit), 0, bytes32(0), "") {} catch {}
        _note(id);
    }

    function accept(uint256 seed) external {
        uint256 id = _id(seed);
        vm.prank(escrow.getDeal(id).tenant);
        try escrow.acceptProposal(id) {} catch {}
        _note(id);
    }

    function dispute(uint256 seed, uint256 counter) external {
        uint256 id = _id(seed);
        IDepositEscrow.Deal memory d = escrow.getDeal(id);
        vm.prank(d.tenant);
        try escrow.disputeProposal(id, bound(counter, 0, d.proposedAmount)) {} catch {}
        _note(id);
    }

    function reportMismatch(uint256 seed) external {
        uint256 id = _id(seed);
        vm.prank(escrow.getDeal(id).tenant);
        try escrow.reportMismatch(id, 1, keccak256("e"), bytes32(0), "") {} catch {}
        _note(id);
    }

    function abandon(uint256 seed, bool contest) external {
        uint256 id = _id(seed);
        IDepositEscrow.Deal memory d = escrow.getDeal(id);
        if (contest) {
            vm.prank(d.tenant);
            try escrow.contestAbandon(id) {} catch {}
            _note(id);
        } else {
            vm.prank(d.landlord);
            try escrow.reportAbandon(id) {} catch {}
            _note(id);
        }
    }

    function vote(uint256 who, uint256 seed, bool forLandlord) external {
        uint256 id = _id(seed);
        vm.prank(jurors[who % 2]);
        try escrow.vote(id, forLandlord ? IDepositEscrow.Side.LANDLORD : IDepositEscrow.Side.TENANT) {} catch {}
        _note(id);
    }

    function poke(uint256 seed) external {
        uint256 id = _id(seed);
        try escrow.poke(id) {} catch {}
        _note(id);
    }

    /// Đẩy một deal đi đúng bước kế tiếp của nó, để các lượt ngẫu nhiên tới được trạng thái sâu
    /// (chia tiền, tranh chấp) thay vì chỉ quanh quẩn ở đầu luồng.
    function advance(uint256 seed, uint256 amount, bool choice) external {
        steps++;
        uint256 id = _id(seed);
        if (id == 0) return;
        IDepositEscrow.Deal memory d = escrow.getDeal(id);
        IDepositEscrow.State s = d.state;
        if (s == IDepositEscrow.State.OPEN) {
            vm.prank(tenants[seed % 3]);
            try escrow.deposit(id, choice) {} catch {}
        } else if (s == IDepositEscrow.State.RESERVED && d.checkInHash == bytes32(0)) {
            vm.prank(d.tenant);
            try escrow.submitCheckIn(id, keccak256("in")) {} catch {}
        } else if (s == IDepositEscrow.State.RESERVED || s == IDepositEscrow.State.ACTIVE) {
            vm.warp(block.timestamp + 121);
            vm.prank(d.tenant);
            try escrow.submitCheckOut(id, keccak256("out")) {} catch {}
        } else if (s == IDepositEscrow.State.CHECKED_OUT) {
            vm.prank(d.landlord);
            try escrow.proposeDeduction(id, bound(amount, 0, d.deposit), 0, bytes32(0), "") {} catch {}
        } else if (s == IDepositEscrow.State.PROPOSED) {
            vm.prank(d.tenant);
            if (choice) {
                try escrow.acceptProposal(id) {} catch {}
            } else {
                try escrow.disputeProposal(id, bound(amount, 0, d.proposedAmount - 1)) {} catch {}
            }
        } else if (s == IDepositEscrow.State.DISPUTED) {
            vm.prank(jurors[seed % 2]);
            try escrow.vote(id, choice ? IDepositEscrow.Side.LANDLORD : IDepositEscrow.Side.TENANT) {} catch {}
        } else {
            vm.warp(block.timestamp + 301);
            try escrow.poke(id) {} catch {}
        }
        _note(id);
    }

    function warp(uint256 secs) external {
        vm.warp(block.timestamp + bound(secs, 1, 150));
    }

    /// Kẻ phá đám in tiền miễn phí rồi "tặng" khoản khổng lồ: 1 lần mỗi lượt, sau khi đã có nhiều thao tác,
    /// để vừa có deal đang nằm trong vault lúc bị tặng, vừa có deal gửi sau đó (phải bị chặn).
    function grief(uint256 amount) external {
        if (griefed || steps < 15) return;
        vault.simulateYield(bound(amount, 1e15, 1e21));
        griefed = true;
    }

    bool public griefed;
    uint256 public steps;

    function yield(uint256 amount) external {
        vault.simulateYield(bound(amount, 0, 1e7));
    }
}

/// Test bất biến: sau MỌI chuỗi thao tác ngẫu nhiên, sổ sách của két vẫn khớp từng đồng.
contract InvariantTest is Test {
    DepositEscrow escrow;
    MockUSDC usdc;
    MockVault vault;
    Handler handler;
    address fee = address(0xFEE);

    function setUp() public {
        usdc = new MockUSDC();
        vault = new MockVault(IERC20(address(usdc)));
        IDepositEscrow.Timeouts memory t = IDepositEscrow.Timeouts(
            3 minutes, 2 minutes, 2 minutes, 2 minutes, 2 minutes, 3 minutes, 3 minutes, 5 minutes
        );
        escrow = new DepositEscrow(IERC20(address(usdc)), address(0xA1), fee, 1000, IERC4626(address(vault)), t);
        // Gửi mồi như script deploy, để các lượt ngẫu nhiên thật sự đi qua vault. Hàm grief của handler thỉnh thoảng
        // "tặng" một khoản khổng lồ vượt quá sức chặn của mồi: lúc đó chính contract phải tự từ chối gửi vào vault.
        usdc.mint(address(this), 1_000e6);
        usdc.approve(address(vault), 1_000e6);
        vault.deposit(1_000e6, address(0xdead));
        handler = new Handler(escrow, usdc, vault);
        escrow.addJuror(handler.jurors(0));
        escrow.addJuror(handler.jurors(1));
        targetContract(address(handler));
    }

    function _holdsMoney(IDepositEscrow.State s) internal pure returns (bool) {
        return s != IDepositEscrow.State.OPEN && s != IDepositEscrow.State.SETTLED && s != IDepositEscrow.State.REFUNDED
            && s != IDepositEscrow.State.CANCELLED;
    }

    /// Bất biến 1: token nằm trong két đúng bằng tổng (cọc + lãi đã chốt) của các deal còn giữ tiền ngoài vault.
    /// Không thừa một đồng (không có tiền kẹt), không thiếu một đồng (không deal nào bị lấy tiền của deal khác).
    function invariant_escrowBalanceMatchesOpenDeals() public view {
        uint256 expected;
        uint256 n = escrow.dealCount();
        for (uint256 id = 1; id <= n; id++) {
            IDepositEscrow.Deal memory d = escrow.getDeal(id);
            if (_holdsMoney(d.state) && !d.yieldOn) expected += d.deposit + d.yieldGross;
        }
        assertEq(usdc.balanceOf(address(escrow)), expected);
    }

    /// Bất biến 2: cổ phần vault két đang giữ đúng bằng tổng cổ phần ghi trong các deal đang gửi vault,
    /// và mỗi deal như vậy rút ra được ít nhất bằng tiền cọc, trừ sai lệch làm tròn của ERC-4626.
    function invariant_vaultSharesMatch() public view {
        uint256 shares;
        uint256 n = escrow.dealCount();
        for (uint256 id = 1; id <= n; id++) {
            IDepositEscrow.Deal memory d = escrow.getDeal(id);
            if (d.yieldOn) {
                assertTrue(_holdsMoney(d.state), "deal da ket thuc ma tien con trong vault");
                shares += d.vaultShares;
                // Sai lệch làm tròn tối đa bằng giá 1 cổ phần (vài phần triệu mUSDC).
                assertGe(vault.previewRedeem(d.vaultShares) + vault.convertToAssets(1) + 1, d.deposit);
            }
        }
        assertEq(vault.balanceOf(address(escrow)), shares);
    }

    /// Bất biến 3: deal đã kết thúc thì không còn hạn chót và không poke được nữa.
    function invariant_finishedDealsAreFinal() public view {
        uint256 n = escrow.dealCount();
        for (uint256 id = 1; id <= n; id++) {
            IDepositEscrow.Deal memory d = escrow.getDeal(id);
            if (d.state != IDepositEscrow.State.OPEN && !_holdsMoney(d.state)) assertFalse(escrow.canPoke(id));
        }
    }

    /// Chạy sau mỗi lượt: in số lần chạm từng trạng thái (xem bằng forge test -vv).
    function afterInvariant() public {
        emit log_named_uint("RESERVED", handler.reached(IDepositEscrow.State.RESERVED));
        emit log_named_uint("ACTIVE", handler.reached(IDepositEscrow.State.ACTIVE));
        emit log_named_uint("DISPUTED", handler.reached(IDepositEscrow.State.DISPUTED));
        emit log_named_uint("SETTLED", handler.reached(IDepositEscrow.State.SETTLED));
        emit log_named_uint("REFUNDED", handler.reached(IDepositEscrow.State.REFUNDED));
        emit log_named_uint("trong vault", handler.reachedVault());
        emit log_named_uint("co pha dam", handler.griefed() ? 1 : 0);
    }
}
