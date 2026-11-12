// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC4626} from "@openzeppelin/contracts/interfaces/IERC4626.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

import {IDepositEscrow} from "./IDepositEscrow.sol";

/// @title DepositEscrow
/// @notice Két giữ tiền cọc thuê trọ. Đặc tả: docs/contract-spec.md.
/// @dev KHUNG BAN ĐẦU. Đã chạy thật: constructor, createDeal, cancelDeal, getDeal, dealCount,
///      addJuror, removeJuror, kiểm tra con dấu AI. Các hàm còn lại revert NotImplemented()
///      và có TODO trỏ tới đúng mục trong spec. Xóa lỗi NotImplemented khi viết xong hết.
contract DepositEscrow is IDepositEscrow, EIP712, ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    /// Chỉ dùng trong giai đoạn khung; không thuộc spec.
    error NotImplemented();

    // ------------------------------------------------------------ hằng số con dấu AI (EIP-712)

    bytes32 public constant DAMAGE_REPORT_TYPEHASH = keccak256(
        "DamageReport(uint256 dealId,bytes32 checkInHash,bytes32 checkOutHash,uint256 aiAmount,bytes32 reportHash)"
    );
    bytes32 public constant MISMATCH_REPORT_TYPEHASH = keccak256(
        "MismatchReport(uint256 dealId,bytes32 termsHash,bytes32 evidenceHash,uint8 verdict,bytes32 reportHash)"
    );

    // ------------------------------------------------------------ cấu hình cố định

    IERC20 public immutable token;
    address public immutable aiSigner;
    address public immutable feeRecipient;
    uint16 public immutable feeBps;
    IERC4626 public immutable vault;

    uint64 public immutable moveInGrace;
    uint64 public immutable checkInObjection;
    uint64 public immutable mismatchWindow;
    uint64 public immutable abandonWindow;
    uint64 public immutable checkOutGrace;
    uint64 public immutable proposeWindow;
    uint64 public immutable respondWindow;
    uint64 public immutable juryWindow;

    // ------------------------------------------------------------ trạng thái

    mapping(uint256 => Deal) internal deals;
    uint256 internal _dealCount;

    mapping(uint256 => mapping(address => bool)) public hasVoted;
    mapping(address => bool) public isJuror;

    constructor(
        IERC20 token_,
        address aiSigner_,
        address feeRecipient_,
        uint16 feeBps_,
        IERC4626 vault_,
        Timeouts memory t
    ) EIP712("KetCocTro", "1") Ownable(msg.sender) {
        token = token_;
        aiSigner = aiSigner_;
        feeRecipient = feeRecipient_;
        feeBps = feeBps_;
        vault = vault_;
        moveInGrace = t.moveInGrace;
        checkInObjection = t.checkInObjection;
        mismatchWindow = t.mismatchWindow;
        abandonWindow = t.abandonWindow;
        checkOutGrace = t.checkOutGrace;
        proposeWindow = t.proposeWindow;
        respondWindow = t.respondWindow;
        juryWindow = t.juryWindow;
    }

    // ------------------------------------------------------------ đăng phòng (P0)

    function createDeal(
        uint256 amount,
        uint256 reserveFee,
        uint64 moveInDate,
        uint64 leaseEnd,
        bool yieldEnabled,
        bytes32 termsHash
    ) external returns (uint256 id) {
        if (amount == 0 || reserveFee > amount || termsHash == bytes32(0)) revert InvalidAmount();
        if (leaseEnd <= moveInDate) revert InvalidDates();

        id = ++_dealCount;
        Deal storage d = deals[id];
        d.landlord = msg.sender;
        d.deposit = amount;
        d.reserveFee = reserveFee;
        d.moveInDate = moveInDate;
        d.leaseEnd = leaseEnd;
        d.yieldEnabled = yieldEnabled;
        d.termsHash = termsHash;
        d.state = State.OPEN;
        // Hạn đóng tin khi chưa ai cọc (poke -> CANCELLED).
        d.deadline = moveInDate + moveInGrace;

        emit DealCreated(id, msg.sender, amount, reserveFee, moveInDate, leaseEnd, yieldEnabled, termsHash);
        emit StateChanged(id, State.OPEN, State.OPEN, d.deadline);
    }

    function cancelDeal(uint256 id) external {
        Deal storage d = deals[id];
        if (msg.sender != d.landlord) revert NotLandlord();
        _requireState(d, State.OPEN);

        _setState(id, d, State.CANCELLED, 0);
        emit DealCancelled(id);
    }

    // ------------------------------------------------------------ gửi cọc (P0)

    function deposit(uint256, bool) external pure {
        // TODO(spec): docs/contract-spec.md > Hàm > deposit
        revert NotImplemented();
    }

    function depositWithPermit(uint256, bool, uint256, uint8, bytes32, bytes32) external pure {
        // TODO(spec): gọi permit trong try/catch rồi chạy như deposit
        revert NotImplemented();
    }

    // ------------------------------------------------------------ nhận phòng

    function submitCheckIn(uint256, bytes32) external pure {
        // TODO(spec, P0): docs/contract-spec.md > Hàm > submitCheckIn
        revert NotImplemented();
    }

    function contestCheckIn(uint256) external pure {
        // TODO(spec, P2): chủ trọ phản đối 1 lần
        revert NotImplemented();
    }

    function reportMismatch(uint256, uint8, bytes32, bytes32, bytes calldata) external pure {
        // TODO(spec, P1): dùng _verifyMismatchSeal; verdict 2 -> MISMATCH_REPORTED, 1 -> DISPUTED, 0 -> BadVerdict
        revert NotImplemented();
    }

    function contestMismatch(uint256) external pure {
        // TODO(spec, P1)
        revert NotImplemented();
    }

    // ------------------------------------------------------------ đang ở, trả phòng

    function submitCheckOut(uint256, bytes32) external pure {
        // TODO(spec, P0): người thuê bất cứ lúc nào; chủ trọ khi now > leaseEnd + checkOutGrace (P1)
        revert NotImplemented();
    }

    function reportAbandon(uint256) external pure {
        // TODO(spec, P1)
        revert NotImplemented();
    }

    function contestAbandon(uint256) external pure {
        // TODO(spec, P1): quay lại ACTIVE, deadline = 0
        revert NotImplemented();
    }

    // ------------------------------------------------------------ đề xuất, tranh chấp

    function proposeDeduction(uint256, uint256, uint256, bytes32, bytes calldata) external pure {
        // TODO(spec, P0): dùng _verifyDamageSeal khi aiSig không rỗng
        revert NotImplemented();
    }

    function acceptProposal(uint256) external pure {
        // TODO(spec, P0): _payout(id, Outcome.NORMAL, proposedAmount)
        revert NotImplemented();
    }

    function disputeProposal(uint256, uint256) external pure {
        // TODO(spec, P1): counterAmount < proposedAmount; phiếu AI về con số gần aiAmount hơn
        revert NotImplemented();
    }

    function vote(uint256, Side) external pure {
        // TODO(spec, P1): bồi thẩm, không phải 2 bên; đủ 2 phiếu thì phân xử ngay
        revert NotImplemented();
    }

    // ------------------------------------------------------------ hạn chót

    function poke(uint256) external pure {
        // TODO(spec, P0): xử lý theo bảng "Tham số thời gian"; không có gì thì NothingToPoke
        revert NotImplemented();
    }

    function canPoke(uint256) external pure returns (bool) {
        // TODO(spec, P0): trả true khi poke(id) sẽ làm được việc
        return false;
    }

    // ------------------------------------------------------------ đọc dữ liệu

    function getDeal(uint256 id) external view returns (Deal memory) {
        return deals[id];
    }

    function dealCount() external view returns (uint256) {
        return _dealCount;
    }

    // ------------------------------------------------------------ bồi thẩm

    function addJuror(address juror) external onlyOwner {
        isJuror[juror] = true;
        emit JurorSet(juror, true);
    }

    function removeJuror(address juror) external onlyOwner {
        isJuror[juror] = false;
        emit JurorSet(juror, false);
    }

    // ------------------------------------------------------------ nội bộ

    function _requireState(Deal storage d, State expected) internal view {
        if (d.state != expected) revert WrongState(expected, d.state);
    }

    function _setState(uint256 id, Deal storage d, State to, uint64 deadline) internal {
        State from = d.state;
        d.state = to;
        d.deadline = deadline;
        emit StateChanged(id, from, to, deadline);
    }

    /// Kiểm tra con dấu AI cho báo cáo hư hỏng. Hash ảnh lấy từ deal đang lưu, không nhận từ tham số.
    function _verifyDamageSeal(uint256 id, Deal storage d, uint256 aiAmount, bytes32 reportHash, bytes calldata sig)
        internal
        view
    {
        bytes32 structHash = keccak256(
            abi.encode(DAMAGE_REPORT_TYPEHASH, id, d.checkInHash, d.checkOutHash, aiAmount, reportHash)
        );
        if (ECDSA.recover(_hashTypedDataV4(structHash), sig) != aiSigner) revert BadSignature();
    }

    /// Kiểm tra con dấu AI cho báo cáo phòng sai mô tả.
    function _verifyMismatchSeal(
        uint256 id,
        Deal storage d,
        bytes32 evidenceHash,
        uint8 verdict,
        bytes32 reportHash,
        bytes calldata sig
    ) internal view {
        bytes32 structHash = keccak256(
            abi.encode(MISMATCH_REPORT_TYPEHASH, id, d.termsHash, evidenceHash, verdict, reportHash)
        );
        if (ECDSA.recover(_hashTypedDataV4(structHash), sig) != aiSigner) revert BadSignature();
    }

    // TODO(spec): _payout(id, outcome, D), _toVault(id), _fromVault(id) theo mục "Chia tiền".
    // Nhớ: đổi state trước, chuyển tiền sau; dùng token.safeTransfer; người thuê + chủ trọ + phí = C + G.

    /// Domain separator cho server ký con dấu và cho test.
    function domainSeparator() external view returns (bytes32) {
        return _domainSeparatorV4();
    }
}
