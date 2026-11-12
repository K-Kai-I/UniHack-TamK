// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC4626} from "@openzeppelin/contracts/interfaces/IERC4626.sol";
import {DepositEscrow} from "../src/DepositEscrow.sol";
import {IDepositEscrow} from "../src/IDepositEscrow.sol";
import {MockUSDC} from "../src/MockUSDC.sol";

/// Test mẫu cho phần đã viết. Mỗi hàm mới cần thêm: người lạ gọi, sai trạng thái,
/// gọi 2 lần, gọi sau hạn (xem AGENTS.md và docs/contract-spec.md > Test bắt buộc).
contract DepositEscrowTest is Test {
    DepositEscrow escrow;
    MockUSDC usdc;

    address landlord = makeAddr("landlord");
    address tenant = makeAddr("tenant");
    address stranger = makeAddr("stranger");
    address fee = makeAddr("fee");
    uint256 aiKey = 0xA11CE;
    address aiSigner;

    uint256 constant C = 240e6; // 240 mUSDC
    uint256 constant R = 20e6;
    bytes32 constant TERMS = keccak256("terms");

    function setUp() public {
        aiSigner = vm.addr(aiKey);
        usdc = new MockUSDC();
        IDepositEscrow.Timeouts memory t = IDepositEscrow.Timeouts({
            moveInGrace: 3 minutes,
            checkInObjection: 2 minutes,
            mismatchWindow: 2 minutes,
            abandonWindow: 2 minutes,
            checkOutGrace: 2 minutes,
            proposeWindow: 3 minutes,
            respondWindow: 3 minutes,
            juryWindow: 5 minutes
        });
        escrow = new DepositEscrow(IERC20(address(usdc)), aiSigner, fee, 1000, IERC4626(address(0)), t);
        usdc.mint(tenant, 1_000e6);
    }

    function _create() internal returns (uint256 id) {
        vm.prank(landlord);
        id = escrow.createDeal(C, R, uint64(block.timestamp + 1 days), uint64(block.timestamp + 180 days), false, TERMS);
    }

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
        escrow.createDeal(C, C + 1, uint64(block.timestamp + 1 days), uint64(block.timestamp + 2 days), false, TERMS);
    }

    function test_createDeal_revertsWhenDatesWrong() public {
        vm.prank(landlord);
        vm.expectRevert(IDepositEscrow.InvalidDates.selector);
        escrow.createDeal(C, R, uint64(block.timestamp + 2 days), uint64(block.timestamp + 1 days), false, TERMS);
    }

    function test_cancelDeal_byLandlord() public {
        uint256 id = _create();
        vm.prank(landlord);
        escrow.cancelDeal(id);
        assertEq(uint8(escrow.getDeal(id).state), uint8(IDepositEscrow.State.CANCELLED));
    }

    function test_cancelDeal_revertsForStranger() public {
        uint256 id = _create();
        vm.prank(stranger);
        vm.expectRevert(IDepositEscrow.NotLandlord.selector);
        escrow.cancelDeal(id);
    }

    function test_cancelDeal_revertsTwice() public {
        uint256 id = _create();
        vm.startPrank(landlord);
        escrow.cancelDeal(id);
        vm.expectRevert(
            abi.encodeWithSelector(
                IDepositEscrow.WrongState.selector, IDepositEscrow.State.OPEN, IDepositEscrow.State.CANCELLED
            )
        );
        escrow.cancelDeal(id);
        vm.stopPrank();
    }

    function test_addJuror_onlyOwner() public {
        vm.prank(stranger);
        vm.expectRevert();
        escrow.addJuror(stranger);
        escrow.addJuror(stranger);
        assertTrue(escrow.isJuror(stranger));
    }

    // TODO: deposit, depositWithPermit, submitCheckIn, poke (không đến), submitCheckOut,
    // proposeDeduction (có và không có con dấu), acceptProposal, các dòng của bảng Chia tiền,
    // bất biến "người thuê + chủ trọ + phí = C + G".
}
