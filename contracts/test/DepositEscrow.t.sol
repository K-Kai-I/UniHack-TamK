// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC4626} from "@openzeppelin/contracts/interfaces/IERC4626.sol";
import {DepositEscrow} from "../src/DepositEscrow.sol";
import {IDepositEscrow} from "../src/IDepositEscrow.sol";
import {MockUSDC} from "../src/MockUSDC.sol";

/// Test P0 + P1 theo docs/contract-spec.md > Test bắt buộc.
/// Mỗi hàm có: đường đúng, người lạ gọi, sai trạng thái, gọi 2 lần hoặc sau hạn.
contract DepositEscrowTest is Test {
    DepositEscrow escrow;
    MockUSDC usdc;

    address landlord = makeAddr("landlord");
    uint256 tenantKey = 0x7E4A;
    address tenant;
    address stranger = makeAddr("stranger");
    address fee = makeAddr("fee");
    uint256 aiKey = 0xA11CE;
    address aiSigner;

    uint256 constant C = 240e6; // 240 mUSDC (hiển thị 6.000.000đ)
    uint256 constant R = 20e6;
    bytes32 constant TERMS = keccak256("terms");
    bytes32 constant CHECKIN = keccak256("checkin-photoset");
    bytes32 constant CHECKOUT = keccak256("checkout-photoset");
    bytes32 constant REPORT = keccak256("damage-report");

    uint64 constant MOVE_IN_GRACE = 3 minutes;
    uint64 constant OBJECTION = 2 minutes;
    uint64 constant CHECKOUT_GRACE = 2 minutes;
    uint64 constant PROPOSE = 3 minutes;
    uint64 constant RESPOND = 3 minutes;

    uint64 moveIn;
    uint64 leaseEnd;

    function setUp() public {
        vm.warp(1_800_000_000);
        tenant = vm.addr(tenantKey);
        aiSigner = vm.addr(aiKey);
        usdc = new MockUSDC();
        IDepositEscrow.Timeouts memory t = IDepositEscrow.Timeouts({
            moveInGrace: MOVE_IN_GRACE,
            checkInObjection: OBJECTION,
            mismatchWindow: 2 minutes,
            abandonWindow: 2 minutes,
            checkOutGrace: CHECKOUT_GRACE,
            proposeWindow: PROPOSE,
            respondWindow: RESPOND,
            juryWindow: 5 minutes
        });
        escrow = new DepositEscrow(IERC20(address(usdc)), aiSigner, fee, 1000, IERC4626(address(0)), t);
        moveIn = uint64(block.timestamp + 1 days);
        leaseEnd = uint64(block.timestamp + 180 days);
        usdc.mint(tenant, 1_000e6);
        usdc.mint(stranger, 1_000e6);
    }

    // ------------------------------------------------------------ trợ giúp

    function _create() internal returns (uint256 id) {
        vm.prank(landlord);
        id = escrow.createDeal(C, R, moveIn, leaseEnd, false, TERMS);
    }

    function _deposited() internal returns (uint256 id) {
        id = _create();
        vm.startPrank(tenant);
        usdc.approve(address(escrow), C);
        escrow.deposit(id, false);
        vm.stopPrank();
    }

    function _checkedIn() internal returns (uint256 id) {
        id = _deposited();
        vm.prank(tenant);
        escrow.submitCheckIn(id, CHECKIN);
    }

    function _active() internal returns (uint256 id) {
        id = _checkedIn();
        vm.warp(block.timestamp + OBJECTION + 1);
        escrow.poke(id);
    }

    function _checkedOut() internal returns (uint256 id) {
        id = _active();
        vm.prank(tenant);
        escrow.submitCheckOut(id, CHECKOUT);
    }

    function _state(uint256 id) internal view returns (IDepositEscrow.State) {
        return escrow.getDeal(id).state;
    }

    function _seal(uint256 id, uint256 aiAmount, bytes32 checkIn, bytes32 checkOut, bytes32 report, uint256 key)
        internal
        view
        returns (bytes memory)
    {
        bytes32 structHash =
            keccak256(abi.encode(escrow.DAMAGE_REPORT_TYPEHASH(), id, checkIn, checkOut, aiAmount, report));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", escrow.domainSeparator(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, digest);
        return abi.encodePacked(r, s, v);
    }

    function _wrongState(IDepositEscrow.State expected, IDepositEscrow.State actual)
        internal
        pure
        returns (bytes memory)
    {
        return abi.encodeWithSelector(IDepositEscrow.WrongState.selector, expected, actual);
    }

    // ------------------------------------------------------------ createDeal, cancelDeal

    function test_createDeal_storesTerms() public {
        uint256 id = _create();
        IDepositEscrow.Deal memory d = escrow.getDeal(id);
        assertEq(id, 1);
        assertEq(d.landlord, landlord);
        assertEq(d.deposit, C);
        assertEq(d.reserveFee, R);
        assertEq(d.termsHash, TERMS);
        assertEq(uint8(d.state), uint8(IDepositEscrow.State.OPEN));
        assertEq(escrow.dealCount(), 1);
    }

    function test_createDeal_revertsWhenReserveFeeAboveDeposit() public {
        vm.prank(landlord);
        vm.expectRevert(IDepositEscrow.InvalidAmount.selector);
        escrow.createDeal(C, C + 1, moveIn, leaseEnd, false, TERMS);
    }

    function test_createDeal_revertsWhenDatesWrong() public {
        vm.prank(landlord);
        vm.expectRevert(IDepositEscrow.InvalidDates.selector);
        escrow.createDeal(C, R, leaseEnd, moveIn, false, TERMS);
    }

    function test_cancelDeal_byLandlord() public {
        uint256 id = _create();
        vm.prank(landlord);
        escrow.cancelDeal(id);
        assertEq(uint8(_state(id)), uint8(IDepositEscrow.State.CANCELLED));
    }

    function test_cancelDeal_revertsForStranger() public {
        uint256 id = _create();
        vm.prank(stranger);
        vm.expectRevert(IDepositEscrow.NotLandlord.selector);
        escrow.cancelDeal(id);
    }

    function test_cancelDeal_revertsAfterDeposit() public {
        uint256 id = _deposited();
        vm.prank(landlord);
        vm.expectRevert(_wrongState(IDepositEscrow.State.OPEN, IDepositEscrow.State.RESERVED));
        escrow.cancelDeal(id);
    }

    // ------------------------------------------------------------ deposit

    function test_deposit_locksMoney() public {
        uint256 id = _deposited();
        IDepositEscrow.Deal memory d = escrow.getDeal(id);
        assertEq(d.tenant, tenant);
        assertEq(uint8(d.state), uint8(IDepositEscrow.State.RESERVED));
        assertEq(d.deadline, moveIn + MOVE_IN_GRACE);
        assertEq(usdc.balanceOf(address(escrow)), C);
        assertEq(usdc.balanceOf(tenant), 1_000e6 - C);
    }

    function test_deposit_revertsForLandlord() public {
        uint256 id = _create();
        usdc.mint(landlord, C);
        vm.startPrank(landlord);
        usdc.approve(address(escrow), C);
        vm.expectRevert(IDepositEscrow.LandlordCannotRent.selector);
        escrow.deposit(id, false);
        vm.stopPrank();
    }

    function test_deposit_secondTenantReverts() public {
        uint256 id = _deposited();
        vm.startPrank(stranger);
        usdc.approve(address(escrow), C);
        vm.expectRevert(_wrongState(IDepositEscrow.State.OPEN, IDepositEscrow.State.RESERVED));
        escrow.deposit(id, false);
        vm.stopPrank();
        assertEq(usdc.balanceOf(stranger), 1_000e6, "nguoi sau khong mat tien");
    }

    function test_deposit_revertsAfterMoveInDeadline() public {
        uint256 id = _create();
        vm.warp(moveIn + MOVE_IN_GRACE + 1);
        vm.startPrank(tenant);
        usdc.approve(address(escrow), C);
        vm.expectRevert(IDepositEscrow.DeadlinePassed.selector);
        escrow.deposit(id, false);
        vm.stopPrank();
    }

    function test_deposit_revertsWithoutApprove() public {
        uint256 id = _create();
        vm.prank(tenant);
        vm.expectRevert();
        escrow.deposit(id, false);
    }

    function test_depositWithPermit_oneTransaction() public {
        uint256 id = _create();
        uint256 permitDeadline = block.timestamp + 1 hours;
        bytes32 permitHash = keccak256(
            abi.encode(
                keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)"),
                tenant,
                address(escrow),
                C,
                usdc.nonces(tenant),
                permitDeadline
            )
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", usdc.DOMAIN_SEPARATOR(), permitHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(tenantKey, digest);

        vm.prank(tenant);
        escrow.depositWithPermit(id, false, permitDeadline, v, r, s);
        assertEq(uint8(_state(id)), uint8(IDepositEscrow.State.RESERVED));
        assertEq(usdc.balanceOf(address(escrow)), C);
    }

    // ------------------------------------------------------------ submitCheckIn

    function test_submitCheckIn_setsObjectionDeadline() public {
        uint256 id = _checkedIn();
        IDepositEscrow.Deal memory d = escrow.getDeal(id);
        assertEq(d.checkInHash, CHECKIN);
        assertEq(uint8(d.state), uint8(IDepositEscrow.State.RESERVED));
        assertEq(d.deadline, block.timestamp + OBJECTION);
    }

    function test_submitCheckIn_revertsForStranger() public {
        uint256 id = _deposited();
        vm.prank(stranger);
        vm.expectRevert(IDepositEscrow.NotTenant.selector);
        escrow.submitCheckIn(id, CHECKIN);
    }

    function test_submitCheckIn_revertsTwice() public {
        uint256 id = _checkedIn();
        vm.prank(tenant);
        vm.expectRevert(IDepositEscrow.CheckInAlreadySubmitted.selector);
        escrow.submitCheckIn(id, CHECKIN);
    }

    function test_submitCheckIn_revertsAfterDeadline() public {
        uint256 id = _deposited();
        vm.warp(moveIn + MOVE_IN_GRACE + 1);
        vm.prank(tenant);
        vm.expectRevert(IDepositEscrow.DeadlinePassed.selector);
        escrow.submitCheckIn(id, CHECKIN);
    }

    // ------------------------------------------------------------ poke: 4 hạn chót P0 + đóng tin

    function test_poke_revertsBeforeDeadline() public {
        uint256 id = _checkedIn();
        assertFalse(escrow.canPoke(id));
        vm.expectRevert(IDepositEscrow.NothingToPoke.selector);
        escrow.poke(id);
    }

    function test_poke_closesListingNobodyRented() public {
        uint256 id = _create();
        vm.warp(moveIn + MOVE_IN_GRACE + 1);
        assertTrue(escrow.canPoke(id));
        vm.prank(stranger);
        escrow.poke(id);
        assertEq(uint8(_state(id)), uint8(IDepositEscrow.State.CANCELLED));
    }

    function test_poke_noShow_refundsMinusReserveFee() public {
        uint256 id = _deposited();
        vm.warp(moveIn + MOVE_IN_GRACE + 1);
        vm.prank(stranger); // ai gọi cũng được, tiền vẫn về đúng người
        escrow.poke(id);
        assertEq(uint8(_state(id)), uint8(IDepositEscrow.State.REFUNDED));
        assertEq(usdc.balanceOf(tenant), 1_000e6 - R);
        assertEq(usdc.balanceOf(landlord), R);
        assertEq(usdc.balanceOf(stranger), 1_000e6);
        assertEq(usdc.balanceOf(address(escrow)), 0);
    }

    function test_poke_activatesAfterObjectionWindow() public {
        uint256 id = _active();
        IDepositEscrow.Deal memory d = escrow.getDeal(id);
        assertEq(uint8(d.state), uint8(IDepositEscrow.State.ACTIVE));
        assertEq(d.deadline, 0);
        assertFalse(escrow.canPoke(id), "ACTIVE khong co han");
    }

    function test_poke_landlordSilent_tenantGetsAll() public {
        uint256 id = _checkedOut();
        vm.warp(block.timestamp + PROPOSE + 1);
        escrow.poke(id);
        assertEq(uint8(_state(id)), uint8(IDepositEscrow.State.SETTLED));
        assertEq(usdc.balanceOf(tenant), 1_000e6);
        assertEq(usdc.balanceOf(landlord), 0);
    }

    function test_poke_tenantSilent_paysProposedAmount() public {
        uint256 id = _checkedOut();
        vm.prank(landlord);
        escrow.proposeDeduction(id, 16e6, 0, bytes32(0), "");
        vm.warp(block.timestamp + RESPOND + 1);
        escrow.poke(id);
        assertEq(uint8(_state(id)), uint8(IDepositEscrow.State.SETTLED));
        assertEq(usdc.balanceOf(tenant), 1_000e6 - 16e6);
        assertEq(usdc.balanceOf(landlord), 16e6);
    }

    function test_poke_revertsOnFinishedDeal() public {
        uint256 id = _deposited();
        vm.warp(moveIn + MOVE_IN_GRACE + 1);
        escrow.poke(id);
        vm.expectRevert(IDepositEscrow.NothingToPoke.selector);
        escrow.poke(id);
    }

    // ------------------------------------------------------------ submitCheckOut

    function test_submitCheckOut_byTenant() public {
        uint256 id = _checkedOut();
        IDepositEscrow.Deal memory d = escrow.getDeal(id);
        assertEq(uint8(d.state), uint8(IDepositEscrow.State.CHECKED_OUT));
        assertEq(d.checkOutHash, CHECKOUT);
        assertEq(d.deadline, block.timestamp + PROPOSE);
    }

    function test_submitCheckOut_activatesAutomatically() public {
        uint256 id = _checkedIn();
        vm.warp(block.timestamp + OBJECTION + 1); // không ai poke
        vm.prank(tenant);
        escrow.submitCheckOut(id, CHECKOUT);
        assertEq(uint8(_state(id)), uint8(IDepositEscrow.State.CHECKED_OUT));
    }

    function test_submitCheckOut_revertsDuringObjectionWindow() public {
        uint256 id = _checkedIn();
        vm.prank(tenant);
        vm.expectRevert(_wrongState(IDepositEscrow.State.ACTIVE, IDepositEscrow.State.RESERVED));
        escrow.submitCheckOut(id, CHECKOUT);
    }

    function test_submitCheckOut_revertsForStranger() public {
        uint256 id = _active();
        vm.prank(stranger);
        vm.expectRevert(IDepositEscrow.NotTenant.selector);
        escrow.submitCheckOut(id, CHECKOUT);
    }

    function test_submitCheckOut_landlordOnlyAfterGrace() public {
        uint256 id = _active();
        vm.prank(landlord);
        vm.expectRevert(IDepositEscrow.DeadlineNotReached.selector);
        escrow.submitCheckOut(id, CHECKOUT);

        vm.warp(leaseEnd + CHECKOUT_GRACE + 1);
        vm.prank(landlord);
        escrow.submitCheckOut(id, CHECKOUT);
        assertEq(uint8(_state(id)), uint8(IDepositEscrow.State.CHECKED_OUT));
    }

    function test_submitCheckOut_revertsTwice() public {
        uint256 id = _checkedOut();
        vm.prank(tenant);
        vm.expectRevert(_wrongState(IDepositEscrow.State.ACTIVE, IDepositEscrow.State.CHECKED_OUT));
        escrow.submitCheckOut(id, CHECKOUT);
    }

    // ------------------------------------------------------------ proposeDeduction, acceptProposal

    function test_propose_withAiSeal_andAccept() public {
        uint256 id = _checkedOut();
        bytes memory sig = _seal(id, 16e6, CHECKIN, CHECKOUT, REPORT, aiKey);
        vm.prank(landlord);
        escrow.proposeDeduction(id, 16e6, 16e6, REPORT, sig);

        IDepositEscrow.Deal memory d = escrow.getDeal(id);
        assertEq(uint8(d.state), uint8(IDepositEscrow.State.PROPOSED));
        assertTrue(d.hasAiSeal);
        assertEq(d.aiAmount, 16e6);
        assertEq(d.aiReportHash, REPORT);

        vm.prank(tenant);
        escrow.acceptProposal(id);
        assertEq(uint8(_state(id)), uint8(IDepositEscrow.State.SETTLED));
        assertEq(usdc.balanceOf(tenant), 1_000e6 - 16e6);
        assertEq(usdc.balanceOf(landlord), 16e6);
        assertEq(usdc.balanceOf(address(escrow)), 0);
    }

    function test_propose_revertsWithWrongSigner() public {
        uint256 id = _checkedOut();
        bytes memory sig = _seal(id, 16e6, CHECKIN, CHECKOUT, REPORT, 0xBAD);
        vm.prank(landlord);
        vm.expectRevert(IDepositEscrow.BadSignature.selector);
        escrow.proposeDeduction(id, 16e6, 16e6, REPORT, sig);
    }

    function test_propose_revertsWhenSealForOtherPhotos() public {
        uint256 id = _checkedOut();
        bytes memory sig = _seal(id, 16e6, CHECKIN, keccak256("other photos"), REPORT, aiKey);
        vm.prank(landlord);
        vm.expectRevert(IDepositEscrow.BadSignature.selector);
        escrow.proposeDeduction(id, 16e6, 16e6, REPORT, sig);
    }

    function test_propose_revertsWhenSealForOtherDeal() public {
        uint256 id = _checkedOut();
        bytes memory sig = _seal(id + 1, 16e6, CHECKIN, CHECKOUT, REPORT, aiKey);
        vm.prank(landlord);
        vm.expectRevert(IDepositEscrow.BadSignature.selector);
        escrow.proposeDeduction(id, 16e6, 16e6, REPORT, sig);
    }

    function test_propose_revertsWhenAiAmountChanged() public {
        uint256 id = _checkedOut();
        bytes memory sig = _seal(id, 16e6, CHECKIN, CHECKOUT, REPORT, aiKey);
        vm.prank(landlord);
        vm.expectRevert(IDepositEscrow.BadSignature.selector);
        escrow.proposeDeduction(id, 16e6, 1e6, REPORT, sig);
    }

    function test_propose_revertsAboveDeposit() public {
        uint256 id = _checkedOut();
        vm.prank(landlord);
        vm.expectRevert(IDepositEscrow.InvalidAmount.selector);
        escrow.proposeDeduction(id, C + 1, 0, bytes32(0), "");
    }

    function test_propose_revertsForStranger() public {
        uint256 id = _checkedOut();
        vm.prank(stranger);
        vm.expectRevert(IDepositEscrow.NotLandlord.selector);
        escrow.proposeDeduction(id, 1e6, 0, bytes32(0), "");
    }

    function test_propose_revertsAfterDeadline() public {
        uint256 id = _checkedOut();
        vm.warp(block.timestamp + PROPOSE + 1);
        vm.prank(landlord);
        vm.expectRevert(IDepositEscrow.DeadlinePassed.selector);
        escrow.proposeDeduction(id, 1e6, 0, bytes32(0), "");
    }

    function test_propose_zeroSettlesImmediately() public {
        uint256 id = _checkedOut();
        vm.prank(landlord);
        escrow.proposeDeduction(id, 0, 0, bytes32(0), "");
        assertEq(uint8(_state(id)), uint8(IDepositEscrow.State.SETTLED));
        assertEq(usdc.balanceOf(tenant), 1_000e6);
    }

    function test_accept_revertsForStranger() public {
        uint256 id = _checkedOut();
        vm.prank(landlord);
        escrow.proposeDeduction(id, 1e6, 0, bytes32(0), "");
        vm.prank(stranger);
        vm.expectRevert(IDepositEscrow.NotTenant.selector);
        escrow.acceptProposal(id);
    }

    function test_accept_revertsTwice() public {
        uint256 id = _checkedOut();
        vm.prank(landlord);
        escrow.proposeDeduction(id, 1e6, 0, bytes32(0), "");
        vm.startPrank(tenant);
        escrow.acceptProposal(id);
        vm.expectRevert(_wrongState(IDepositEscrow.State.PROPOSED, IDepositEscrow.State.SETTLED));
        escrow.acceptProposal(id);
        vm.stopPrank();
    }

    // ------------------------------------------------------------ bất biến tổng tiền

    /// Với mọi C, R, D: tiền về 2 ví cộng lại đúng bằng C và két không còn đồng nào.
    function testFuzz_normalPayout_sumsToDeposit(uint256 c, uint256 r, uint256 dAmt) public {
        c = bound(c, 1, 1_000_000e6);
        r = bound(r, 0, c);
        dAmt = bound(dAmt, 1, c);
        usdc.mint(tenant, c);
        uint256 tenantBefore = usdc.balanceOf(tenant);

        vm.prank(landlord);
        uint256 id = escrow.createDeal(c, r, moveIn, leaseEnd, false, TERMS);
        vm.startPrank(tenant);
        usdc.approve(address(escrow), c);
        escrow.deposit(id, false);
        escrow.submitCheckIn(id, CHECKIN);
        vm.stopPrank();
        vm.warp(block.timestamp + OBJECTION + 1);
        vm.prank(tenant);
        escrow.submitCheckOut(id, CHECKOUT);
        vm.prank(landlord);
        escrow.proposeDeduction(id, dAmt, 0, bytes32(0), "");
        vm.prank(tenant);
        escrow.acceptProposal(id);

        assertEq(usdc.balanceOf(landlord), dAmt);
        assertEq(usdc.balanceOf(tenant), tenantBefore - dAmt);
        assertEq(usdc.balanceOf(address(escrow)), 0);
    }

    function testFuzz_noShow_sumsToDeposit(uint256 c, uint256 r) public {
        c = bound(c, 1, 1_000_000e6);
        r = bound(r, 0, c);
        usdc.mint(tenant, c);
        uint256 tenantBefore = usdc.balanceOf(tenant);

        vm.prank(landlord);
        uint256 id = escrow.createDeal(c, r, moveIn, leaseEnd, false, TERMS);
        vm.startPrank(tenant);
        usdc.approve(address(escrow), c);
        escrow.deposit(id, false);
        vm.stopPrank();
        vm.warp(moveIn + MOVE_IN_GRACE + 1);
        escrow.poke(id);

        assertEq(usdc.balanceOf(landlord), r);
        assertEq(usdc.balanceOf(tenant), tenantBefore - r);
        assertEq(usdc.balanceOf(address(escrow)), 0);
    }

    /// Két giữ nhiều hợp đồng cùng lúc: kết thúc một hợp đồng không chạm tiền của hợp đồng khác.
    function test_manyDeals_balanceEqualsOpenDeposits() public {
        uint256 a = _deposited();
        vm.prank(landlord);
        uint256 b = escrow.createDeal(100e6, 0, moveIn, leaseEnd, false, TERMS);
        vm.startPrank(stranger);
        usdc.approve(address(escrow), 100e6);
        escrow.deposit(b, false);
        vm.stopPrank();
        assertEq(usdc.balanceOf(address(escrow)), C + 100e6);

        vm.warp(moveIn + MOVE_IN_GRACE + 1);
        escrow.poke(a); // a không đến
        assertEq(usdc.balanceOf(address(escrow)), 100e6, "chi con tien cua b");
        escrow.poke(b);
        assertEq(usdc.balanceOf(address(escrow)), 0);
    }

    // ------------------------------------------------------------ bồi thẩm (owner)

    function test_addJuror_onlyOwner() public {
        vm.prank(stranger);
        vm.expectRevert();
        escrow.addJuror(stranger);
        escrow.addJuror(stranger);
        assertTrue(escrow.isJuror(stranger));
    }

    // ================================================================ P1

    address juror1 = makeAddr("juror1");
    address juror2 = makeAddr("juror2");
    address juror3 = makeAddr("juror3");
    bytes32 constant EVIDENCE = keccak256("mismatch-photos");
    bytes32 constant MREPORT = keccak256("mismatch-report");
    uint64 constant MISMATCH_W = 2 minutes;
    uint64 constant ABANDON_W = 2 minutes;
    uint64 constant JURY_W = 5 minutes;

    function _jurors() internal {
        escrow.addJuror(juror1);
        escrow.addJuror(juror2);
        escrow.addJuror(juror3);
    }

    function _mSeal(uint256 id, uint8 verdict, uint256 key) internal view returns (bytes memory) {
        bytes32 structHash =
            keccak256(abi.encode(escrow.MISMATCH_REPORT_TYPEHASH(), id, TERMS, EVIDENCE, verdict, MREPORT));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", escrow.domainSeparator(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, digest);
        return abi.encodePacked(r, s, v);
    }

    /// Đề xuất D (có con dấu AI với aiAmount nếu withSeal), trạng thái PROPOSED.
    function _proposed(uint256 D, uint256 aiAmount, bool withSeal) internal returns (uint256 id) {
        id = _checkedOut();
        bytes memory sig = withSeal ? _seal(id, aiAmount, CHECKIN, CHECKOUT, REPORT, aiKey) : bytes("");
        vm.prank(landlord);
        escrow.proposeDeduction(id, D, withSeal ? aiAmount : 0, withSeal ? REPORT : bytes32(0), sig);
    }

    function _assertBalances(uint256 tenantGot, uint256 landlordGot) internal view {
        assertEq(usdc.balanceOf(tenant), 1_000e6 - C + tenantGot, "tenant");
        assertEq(usdc.balanceOf(landlord), landlordGot, "landlord");
        assertEq(usdc.balanceOf(address(escrow)), 0, "escrow empty");
        assertEq(tenantGot + landlordGot, C, "sum = C");
    }

    // ------------------------------------------------------------ contestCheckIn (P2)

    function test_contestCheckIn_clearsPhotosOnce() public {
        uint256 id = _checkedIn();
        vm.prank(landlord);
        escrow.contestCheckIn(id);
        IDepositEscrow.Deal memory d = escrow.getDeal(id);
        assertEq(d.checkInHash, bytes32(0));
        assertTrue(d.checkInContested);
        assertEq(d.deadline, block.timestamp + MOVE_IN_GRACE);

        vm.prank(tenant);
        escrow.submitCheckIn(id, CHECKIN); // chụp lại
        vm.prank(landlord);
        vm.expectRevert(IDepositEscrow.AlreadyContested.selector);
        escrow.contestCheckIn(id);
    }

    function test_contestCheckIn_noRetake_isNoShow() public {
        uint256 id = _checkedIn();
        vm.prank(landlord);
        escrow.contestCheckIn(id);
        vm.warp(block.timestamp + MOVE_IN_GRACE + 1);
        escrow.poke(id);
        assertEq(uint8(_state(id)), uint8(IDepositEscrow.State.REFUNDED));
        _assertBalances(C - R, R);
    }

    function test_contestCheckIn_revertsForStranger_andAfterDeadline() public {
        uint256 id = _checkedIn();
        vm.prank(stranger);
        vm.expectRevert(IDepositEscrow.NotLandlord.selector);
        escrow.contestCheckIn(id);
        vm.warp(block.timestamp + OBJECTION + 1);
        vm.prank(landlord);
        vm.expectRevert(IDepositEscrow.DeadlinePassed.selector);
        escrow.contestCheckIn(id);
    }

    // ------------------------------------------------------------ phòng sai mô tả (C)

    function test_reportMismatch_clear_thenLandlordSilent_fullRefund() public {
        uint256 id = _deposited();
        bytes memory sig2 = _mSeal(id, 2, aiKey);
        vm.prank(tenant);
        escrow.reportMismatch(id, 2, EVIDENCE, MREPORT, sig2);
        assertEq(uint8(_state(id)), uint8(IDepositEscrow.State.MISMATCH_REPORTED));
        assertEq(escrow.getDeal(id).deadline, block.timestamp + MISMATCH_W);

        vm.warp(block.timestamp + MISMATCH_W + 1);
        vm.prank(stranger);
        escrow.poke(id);
        assertEq(uint8(_state(id)), uint8(IDepositEscrow.State.REFUNDED));
        _assertBalances(C, 0);
    }

    function test_reportMismatch_unclear_opensDisputeWithoutAiVote() public {
        uint256 id = _deposited();
        bytes memory sig1 = _mSeal(id, 1, aiKey);
        vm.prank(tenant);
        escrow.reportMismatch(id, 1, EVIDENCE, MREPORT, sig1);
        IDepositEscrow.Deal memory d = escrow.getDeal(id);
        assertEq(uint8(d.state), uint8(IDepositEscrow.State.DISPUTED));
        assertEq(uint8(d.disputeKind), uint8(IDepositEscrow.DisputeKind.MISMATCH));
        assertEq(d.votesLandlord + d.votesTenant, 0);
    }

    function test_reportMismatch_noSeal_treatedAsUnclear() public {
        uint256 id = _deposited();
        vm.prank(tenant);
        escrow.reportMismatch(id, 2, EVIDENCE, MREPORT, "");
        assertEq(uint8(_state(id)), uint8(IDepositEscrow.State.DISPUTED));
        assertFalse(escrow.getDeal(id).hasAiSeal);
    }

    function test_reportMismatch_revertsOnSameVerdict_wrongSigner_stranger_afterCheckIn() public {
        uint256 id = _deposited();
        bytes memory sig0 = _mSeal(id, 0, aiKey);
        bytes memory sig1 = _mSeal(id, 1, aiKey);
        bytes memory sig2bad = _mSeal(id, 2, 0xBAD);
        bytes memory sig2 = _mSeal(id, 2, aiKey);
        vm.startPrank(tenant);
        vm.expectRevert(IDepositEscrow.BadVerdict.selector);
        escrow.reportMismatch(id, 0, EVIDENCE, MREPORT, sig0);
        vm.expectRevert(IDepositEscrow.BadSignature.selector);
        escrow.reportMismatch(id, 2, EVIDENCE, MREPORT, sig2bad);
        vm.expectRevert(IDepositEscrow.BadSignature.selector);
        escrow.reportMismatch(id, 2, EVIDENCE, MREPORT, sig1); // sửa verdict sau khi ký
        vm.stopPrank();

        vm.prank(stranger);
        vm.expectRevert(IDepositEscrow.NotTenant.selector);
        escrow.reportMismatch(id, 2, EVIDENCE, MREPORT, sig2);

        vm.startPrank(tenant);
        escrow.submitCheckIn(id, CHECKIN);
        vm.expectRevert(IDepositEscrow.CheckInAlreadySubmitted.selector);
        escrow.reportMismatch(id, 2, EVIDENCE, MREPORT, sig2);
        vm.stopPrank();
    }

    function test_contestMismatch_aiPlusOneJuror_tenantWins() public {
        _jurors();
        uint256 id = _deposited();
        bytes memory sig2 = _mSeal(id, 2, aiKey);
        vm.prank(tenant);
        escrow.reportMismatch(id, 2, EVIDENCE, MREPORT, sig2);
        vm.prank(landlord);
        escrow.contestMismatch(id);
        assertEq(escrow.getDeal(id).votesTenant, 1, "phieu AI");

        vm.prank(juror1);
        escrow.vote(id, IDepositEscrow.Side.TENANT);
        assertEq(uint8(_state(id)), uint8(IDepositEscrow.State.REFUNDED));
        _assertBalances(C, 0);
    }

    function test_contestMismatch_twoJurors_landlordWins_isNoShow() public {
        _jurors();
        uint256 id = _deposited();
        bytes memory sig2 = _mSeal(id, 2, aiKey);
        vm.prank(tenant);
        escrow.reportMismatch(id, 2, EVIDENCE, MREPORT, sig2);
        vm.prank(landlord);
        escrow.contestMismatch(id);
        vm.prank(juror1);
        escrow.vote(id, IDepositEscrow.Side.LANDLORD);
        vm.prank(juror2);
        escrow.vote(id, IDepositEscrow.Side.LANDLORD);
        _assertBalances(C - R, R);
    }

    function test_contestMismatch_revertsForStranger_andAfterDeadline() public {
        uint256 id = _deposited();
        bytes memory sig2 = _mSeal(id, 2, aiKey);
        vm.prank(tenant);
        escrow.reportMismatch(id, 2, EVIDENCE, MREPORT, sig2);
        vm.prank(stranger);
        vm.expectRevert(IDepositEscrow.NotLandlord.selector);
        escrow.contestMismatch(id);
        vm.warp(block.timestamp + MISMATCH_W + 1);
        vm.prank(landlord);
        vm.expectRevert(IDepositEscrow.DeadlinePassed.selector);
        escrow.contestMismatch(id);
    }

    function test_mismatchDispute_expiredTie_tenantWins() public {
        uint256 id = _deposited();
        vm.prank(tenant);
        escrow.reportMismatch(id, 1, EVIDENCE, MREPORT, "");
        vm.warp(block.timestamp + JURY_W + 1);
        escrow.poke(id);
        _assertBalances(C, 0);
    }

    // ------------------------------------------------------------ bỏ ngang (E1)

    function test_reportAbandon_tenantSilent_landlordGetsDeposit() public {
        uint256 id = _active();
        vm.prank(landlord);
        escrow.reportAbandon(id);
        assertEq(uint8(_state(id)), uint8(IDepositEscrow.State.ABANDON_REPORTED));
        vm.expectRevert(IDepositEscrow.NothingToPoke.selector);
        escrow.poke(id);
        vm.warp(block.timestamp + ABANDON_W + 1);
        escrow.poke(id);
        assertEq(uint8(_state(id)), uint8(IDepositEscrow.State.SETTLED));
        _assertBalances(0, C);
    }

    function test_contestAbandon_backToActive() public {
        uint256 id = _active();
        vm.prank(landlord);
        escrow.reportAbandon(id);
        vm.prank(tenant);
        escrow.contestAbandon(id);
        assertEq(uint8(_state(id)), uint8(IDepositEscrow.State.ACTIVE));
        assertEq(escrow.getDeal(id).deadline, 0);
        assertFalse(escrow.canPoke(id));
        vm.prank(tenant);
        escrow.submitCheckOut(id, CHECKOUT); // vẫn trả phòng bình thường được
    }

    function test_reportAbandon_activatesAutomatically() public {
        uint256 id = _checkedIn();
        vm.warp(block.timestamp + OBJECTION + 1);
        vm.prank(landlord);
        escrow.reportAbandon(id);
        assertEq(uint8(_state(id)), uint8(IDepositEscrow.State.ABANDON_REPORTED));
    }

    function test_abandon_reverts_wrongCaller_wrongState_afterDeadline() public {
        uint256 id = _active();
        vm.prank(tenant);
        vm.expectRevert(IDepositEscrow.NotLandlord.selector);
        escrow.reportAbandon(id);
        vm.prank(tenant);
        vm.expectRevert(_wrongState(IDepositEscrow.State.ABANDON_REPORTED, IDepositEscrow.State.ACTIVE));
        escrow.contestAbandon(id);
        vm.prank(landlord);
        escrow.reportAbandon(id);
        vm.prank(landlord);
        vm.expectRevert(IDepositEscrow.NotTenant.selector);
        escrow.contestAbandon(id);
        vm.warp(block.timestamp + ABANDON_W + 1);
        vm.prank(tenant);
        vm.expectRevert(IDepositEscrow.DeadlinePassed.selector);
        escrow.contestAbandon(id);
    }

    // ------------------------------------------------------------ kháng nghị mức trừ (G)

    function test_dispute_aiVoteToCloserSide_tenant() public {
        // chủ trọ 100, người thuê 40, AI 50 -> người thuê gần hơn
        uint256 id = _proposed(100e6, 50e6, true);
        vm.prank(tenant);
        escrow.disputeProposal(id, 40e6);
        IDepositEscrow.Deal memory d = escrow.getDeal(id);
        assertEq(uint8(d.state), uint8(IDepositEscrow.State.DISPUTED));
        assertEq(uint8(d.disputeKind), uint8(IDepositEscrow.DisputeKind.DEDUCTION));
        assertEq(d.counterAmount, 40e6);
        assertEq(d.votesTenant, 1);
        assertEq(d.votesLandlord, 0);
        assertEq(d.deadline, block.timestamp + JURY_W);
    }

    function test_dispute_aiVoteToCloserSide_landlord() public {
        uint256 id = _proposed(100e6, 90e6, true);
        vm.prank(tenant);
        escrow.disputeProposal(id, 10e6);
        assertEq(escrow.getDeal(id).votesLandlord, 1);
    }

    function test_dispute_aiTie_goesToTenant() public {
        uint256 id = _proposed(100e6, 70e6, true);
        vm.prank(tenant);
        escrow.disputeProposal(id, 40e6);
        assertEq(escrow.getDeal(id).votesTenant, 1);
    }

    function test_dispute_aiPlusJuror_landlordWins_paysProposed() public {
        _jurors();
        uint256 id = _proposed(100e6, 90e6, true);
        vm.prank(tenant);
        escrow.disputeProposal(id, 10e6);
        vm.prank(juror1);
        escrow.vote(id, IDepositEscrow.Side.LANDLORD);
        assertEq(uint8(_state(id)), uint8(IDepositEscrow.State.SETTLED));
        _assertBalances(C - 100e6, 100e6);
    }

    function test_dispute_twoJurorsOverruleAi_paysCounter() public {
        _jurors();
        uint256 id = _proposed(100e6, 90e6, true); // AI về chủ trọ
        vm.prank(tenant);
        escrow.disputeProposal(id, 10e6);
        vm.prank(juror1);
        escrow.vote(id, IDepositEscrow.Side.TENANT);
        assertEq(uint8(_state(id)), uint8(IDepositEscrow.State.DISPUTED), "1-1 chua xong");
        vm.prank(juror2);
        escrow.vote(id, IDepositEscrow.Side.TENANT);
        _assertBalances(C - 10e6, 10e6);
    }

    function test_dispute_expired_withSeal_paysAiAmount() public {
        uint256 id = _proposed(100e6, 60e6, true);
        vm.prank(tenant);
        escrow.disputeProposal(id, 10e6);
        vm.warp(block.timestamp + JURY_W + 1);
        escrow.poke(id);
        _assertBalances(C - 60e6, 60e6);
    }

    function test_dispute_expired_noSeal_paysAverage() public {
        uint256 id = _proposed(100e6, 0, false);
        vm.prank(tenant);
        escrow.disputeProposal(id, 30e6);
        assertEq(escrow.getDeal(id).votesLandlord + escrow.getDeal(id).votesTenant, 0, "khong co phieu AI");
        vm.warp(block.timestamp + JURY_W + 1);
        escrow.poke(id);
        _assertBalances(C - 65e6, 65e6);
    }

    function test_dispute_reverts_counterNotLower_stranger_afterDeadline() public {
        uint256 id = _proposed(100e6, 0, false);
        vm.prank(tenant);
        vm.expectRevert(IDepositEscrow.InvalidAmount.selector);
        escrow.disputeProposal(id, 100e6);
        vm.prank(stranger);
        vm.expectRevert(IDepositEscrow.NotTenant.selector);
        escrow.disputeProposal(id, 10e6);
        vm.warp(block.timestamp + RESPOND + 1);
        vm.prank(tenant);
        vm.expectRevert(IDepositEscrow.DeadlinePassed.selector);
        escrow.disputeProposal(id, 10e6);
    }

    // ------------------------------------------------------------ vote

    function test_vote_reverts_notJuror_party_twice_none_afterDeadline() public {
        _jurors();
        escrow.addJuror(tenant); // bồi thẩm nhưng là bên của deal
        uint256 id = _proposed(100e6, 0, false);
        vm.prank(tenant);
        escrow.disputeProposal(id, 10e6);

        vm.prank(stranger);
        vm.expectRevert(IDepositEscrow.NotJuror.selector);
        escrow.vote(id, IDepositEscrow.Side.TENANT);

        vm.prank(tenant);
        vm.expectRevert(IDepositEscrow.PartyCannotVote.selector);
        escrow.vote(id, IDepositEscrow.Side.TENANT);

        vm.prank(juror1);
        vm.expectRevert(IDepositEscrow.BadVerdict.selector);
        escrow.vote(id, IDepositEscrow.Side.NONE);

        vm.startPrank(juror1);
        escrow.vote(id, IDepositEscrow.Side.TENANT);
        vm.expectRevert(IDepositEscrow.AlreadyVoted.selector);
        escrow.vote(id, IDepositEscrow.Side.TENANT);
        vm.stopPrank();

        vm.warp(block.timestamp + JURY_W + 1);
        vm.prank(juror2);
        vm.expectRevert(IDepositEscrow.DeadlinePassed.selector);
        escrow.vote(id, IDepositEscrow.Side.TENANT);
    }

    function test_vote_revertsWhenNotDisputed() public {
        _jurors();
        uint256 id = _proposed(100e6, 0, false);
        vm.prank(juror1);
        vm.expectRevert(_wrongState(IDepositEscrow.State.DISPUTED, IDepositEscrow.State.PROPOSED));
        escrow.vote(id, IDepositEscrow.Side.TENANT);
    }

    function test_removedJuror_cannotVote() public {
        _jurors();
        escrow.removeJuror(juror1);
        uint256 id = _proposed(100e6, 0, false);
        vm.prank(tenant);
        escrow.disputeProposal(id, 10e6);
        vm.prank(juror1);
        vm.expectRevert(IDepositEscrow.NotJuror.selector);
        escrow.vote(id, IDepositEscrow.Side.TENANT);
    }

    /// Kết thúc xong thì không poke, không vote được nữa (bất biến 4).
    function test_finishedDispute_isFinal() public {
        _jurors();
        uint256 id = _proposed(100e6, 90e6, true);
        vm.prank(tenant);
        escrow.disputeProposal(id, 10e6);
        vm.prank(juror1);
        escrow.vote(id, IDepositEscrow.Side.LANDLORD);
        vm.warp(block.timestamp + 1 days);
        vm.expectRevert(IDepositEscrow.NothingToPoke.selector);
        escrow.poke(id);
        vm.prank(juror2);
        vm.expectRevert(_wrongState(IDepositEscrow.State.DISPUTED, IDepositEscrow.State.SETTLED));
        escrow.vote(id, IDepositEscrow.Side.LANDLORD);
    }

    /// Fuzz tranh chấp hết hạn: tổng tiền chi ra luôn bằng C.
    function testFuzz_disputeExpired_sumsToDeposit(uint256 dAmt, uint256 counter, uint256 ai, bool withSeal) public {
        dAmt = bound(dAmt, 2, C);
        counter = bound(counter, 0, dAmt - 1);
        ai = bound(ai, 0, 10 * C); // AI có thể ký số lớn hơn cọc
        uint256 id = _proposed(dAmt, ai, withSeal);
        vm.prank(tenant);
        escrow.disputeProposal(id, counter);
        vm.warp(block.timestamp + JURY_W + 1);
        escrow.poke(id);
        assertEq(usdc.balanceOf(address(escrow)), 0);
        assertEq(usdc.balanceOf(tenant) + usdc.balanceOf(landlord), 1_000e6);
    }
}
