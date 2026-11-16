// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC4626} from "@openzeppelin/contracts/interfaces/IERC4626.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

import {IDepositEscrow} from "./IDepositEscrow.sol";

/// @title DepositEscrow
/// @notice Két giữ tiền cọc thuê trọ. Đặc tả: docs/contract-spec.md.
/// @dev Đủ P0 + P1 + phản đối ảnh nhận phòng (P2). Vault (P2) đi qua _toVault/_fromVault (có chặn lạm phát cổ phần),
///      bật khi deploy với địa chỉ vault khác 0.
contract DepositEscrow is IDepositEscrow, EIP712, ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

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

    function deposit(uint256 id, bool wantYield) external nonReentrant {
        _deposit(id, wantYield);
    }

    /// Gửi cọc bằng 1 giao dịch: chữ ký permit (ERC-2612) thay cho bước approve riêng.
    /// permit nằm trong try/catch: nếu ai đó đã "dùng trước" chữ ký permit (front-run),
    /// allowance vẫn đã được cấp nên transferFrom trong _deposit vẫn chạy được.
    function depositWithPermit(uint256 id, bool wantYield, uint256 permitDeadline, uint8 v, bytes32 r, bytes32 s)
        external
        nonReentrant
    {
        try IERC20Permit(address(token))
            .permit(msg.sender, address(this), deals[id].deposit, permitDeadline, v, r, s) {}
            catch {}
        _deposit(id, wantYield);
    }

    function _deposit(uint256 id, bool wantYield) internal {
        Deal storage d = deals[id];
        _requireState(d, State.OPEN);
        if (msg.sender == d.landlord) revert LandlordCannotRent();
        if (block.timestamp > d.deadline) revert DeadlinePassed();

        // Đổi trạng thái trước, chuyển tiền sau.
        d.tenant = msg.sender;
        bool useVault = wantYield && d.yieldEnabled && address(vault) != address(0);
        _setState(id, d, State.RESERVED, d.moveInDate + moveInGrace);

        token.safeTransferFrom(msg.sender, address(this), d.deposit);
        if (useVault) _toVault(d);

        emit Deposited(id, msg.sender, d.deposit, d.yieldOn);
    }

    // ------------------------------------------------------------ nhận phòng

    function submitCheckIn(uint256 id, bytes32 checkInHash) external {
        Deal storage d = deals[id];
        if (msg.sender != d.tenant) revert NotTenant();
        _requireState(d, State.RESERVED);
        if (d.checkInHash != bytes32(0)) revert CheckInAlreadySubmitted();
        if (block.timestamp > d.deadline) revert DeadlinePassed();
        if (checkInHash == bytes32(0)) revert EmptyHash();

        d.checkInHash = checkInHash;
        // Vẫn RESERVED; hạn mới là hạn chủ trọ phản đối ảnh. Quá hạn -> poke đưa sang ACTIVE.
        _setState(id, d, State.RESERVED, uint64(block.timestamp) + checkInObjection);
        emit CheckInSubmitted(id, checkInHash);
    }

    /// Chủ trọ phản đối ảnh nhận phòng, chỉ 1 lần. Ảnh bị xóa, người thuê có thêm moveInGrace để chụp lại;
    /// không chụp lại kịp thì poke xử lý như không đến (NO_SHOW).
    function contestCheckIn(uint256 id) external {
        Deal storage d = deals[id];
        if (msg.sender != d.landlord) revert NotLandlord();
        _requireState(d, State.RESERVED);
        if (d.checkInHash == bytes32(0)) revert WrongState(State.RESERVED, d.state);
        if (block.timestamp > d.deadline) revert DeadlinePassed();
        if (d.checkInContested) revert AlreadyContested();

        d.checkInHash = bytes32(0);
        d.checkInContested = true;
        _setState(id, d, State.RESERVED, uint64(block.timestamp) + moveInGrace);
        emit CheckInContested(id);
    }

    /// Người thuê báo phòng không đúng mô tả, trước khi gửi ảnh nhận phòng.
    /// verdict: 0 = giống (revert), 1 = không rõ (mở tranh chấp, không có phiếu AI), 2 = khác rõ.
    /// Không có con dấu AI thì luôn coi là "không rõ".
    function reportMismatch(uint256 id, uint8 verdict, bytes32 evidenceHash, bytes32 reportHash, bytes calldata aiSig)
        external
    {
        Deal storage d = deals[id];
        if (msg.sender != d.tenant) revert NotTenant();
        _requireState(d, State.RESERVED);
        if (d.checkInHash != bytes32(0)) revert CheckInAlreadySubmitted();
        if (block.timestamp > d.deadline) revert DeadlinePassed();

        if (aiSig.length == 0) {
            verdict = 1;
        } else {
            if (verdict == 0 || verdict > 2) revert BadVerdict();
            _verifyMismatchSeal(id, d, evidenceHash, verdict, reportHash, aiSig);
            d.aiReportHash = reportHash;
            d.hasAiSeal = true;
        }
        emit MismatchReported(id, verdict, evidenceHash, reportHash);

        if (verdict == 2) {
            _setState(id, d, State.MISMATCH_REPORTED, uint64(block.timestamp) + mismatchWindow);
        } else {
            _openDispute(id, d, DisputeKind.MISMATCH, Side.NONE, 0);
        }
    }

    /// Chủ trọ phản đối báo cáo phòng sai. Con dấu AI ghi "khác rõ" nên phiếu AI về người thuê.
    function contestMismatch(uint256 id) external {
        Deal storage d = deals[id];
        if (msg.sender != d.landlord) revert NotLandlord();
        _requireState(d, State.MISMATCH_REPORTED);
        if (block.timestamp > d.deadline) revert DeadlinePassed();

        _openDispute(id, d, DisputeKind.MISMATCH, d.hasAiSeal ? Side.TENANT : Side.NONE, 0);
    }

    // ------------------------------------------------------------ đang ở, trả phòng

    /// Người thuê trả phòng bất cứ lúc nào; chủ trọ trả thay khi đã quá leaseEnd + checkOutGrace.
    /// Nếu hợp đồng còn RESERVED nhưng hạn phản đối ảnh đã qua mà chưa ai poke, tự sang ACTIVE trước.
    function submitCheckOut(uint256 id, bytes32 checkOutHash) external nonReentrant {
        Deal storage d = deals[id];
        if (msg.sender != d.tenant) {
            if (msg.sender != d.landlord) revert NotTenant();
            if (block.timestamp <= uint256(d.leaseEnd) + checkOutGrace) revert DeadlineNotReached();
        }
        _activateIfDue(id, d);
        _requireState(d, State.ACTIVE);
        if (checkOutHash == bytes32(0)) revert EmptyHash();

        d.checkOutHash = checkOutHash;
        _fromVault(d);
        _setState(id, d, State.CHECKED_OUT, uint64(block.timestamp) + proposeWindow);
        emit CheckedOut(id, msg.sender, checkOutHash, d.yieldGross);
    }

    /// Chủ trọ báo người thuê đã bỏ đi. Người thuê im lặng tới hạn thì chủ trọ nhận cọc (ABANDONED).
    function reportAbandon(uint256 id) external {
        Deal storage d = deals[id];
        if (msg.sender != d.landlord) revert NotLandlord();
        _activateIfDue(id, d);
        _requireState(d, State.ACTIVE);

        _setState(id, d, State.ABANDON_REPORTED, uint64(block.timestamp) + abandonWindow);
        emit AbandonReported(id);
    }

    /// Người thuê báo "tôi vẫn đang ở": quay lại ACTIVE, không qua bồi thẩm.
    function contestAbandon(uint256 id) external {
        Deal storage d = deals[id];
        if (msg.sender != d.tenant) revert NotTenant();
        _requireState(d, State.ABANDON_REPORTED);
        if (block.timestamp > d.deadline) revert DeadlinePassed();

        _setState(id, d, State.ACTIVE, 0);
        emit AbandonContested(id);
    }

    // ------------------------------------------------------------ đề xuất, tranh chấp

    function proposeDeduction(uint256 id, uint256 amount, uint256 aiAmount, bytes32 reportHash, bytes calldata aiSig)
        external
        nonReentrant
    {
        Deal storage d = deals[id];
        if (msg.sender != d.landlord) revert NotLandlord();
        _requireState(d, State.CHECKED_OUT);
        if (block.timestamp > d.deadline) revert DeadlinePassed();
        if (amount > d.deposit) revert InvalidAmount();

        if (aiSig.length > 0) {
            _verifyDamageSeal(id, d, aiAmount, reportHash, aiSig);
            d.aiAmount = aiAmount;
            d.aiReportHash = reportHash;
            d.hasAiSeal = true;
        }
        emit Proposed(id, amount, d.aiAmount, reportHash, d.hasAiSeal);

        if (amount == 0) {
            _payout(id, d, Outcome.NORMAL, 0);
        } else {
            d.proposedAmount = amount;
            _setState(id, d, State.PROPOSED, uint64(block.timestamp) + respondWindow);
        }
    }

    function acceptProposal(uint256 id) external nonReentrant {
        Deal storage d = deals[id];
        if (msg.sender != d.tenant) revert NotTenant();
        _requireState(d, State.PROPOSED);
        _payout(id, d, Outcome.NORMAL, d.proposedAmount);
    }

    /// Người thuê kháng nghị, kèm con số của mình (nhỏ hơn con số chủ trọ).
    /// Có con dấu AI thì phiếu AI về bên có con số gần aiAmount hơn; bằng nhau thì về người thuê.
    function disputeProposal(uint256 id, uint256 counterAmount) external {
        Deal storage d = deals[id];
        if (msg.sender != d.tenant) revert NotTenant();
        _requireState(d, State.PROPOSED);
        if (block.timestamp > d.deadline) revert DeadlinePassed();
        if (counterAmount >= d.proposedAmount) revert InvalidAmount();

        d.counterAmount = counterAmount;
        Side aiSide = Side.NONE;
        if (d.hasAiSeal) {
            uint256 distLandlord = _dist(d.proposedAmount, d.aiAmount);
            uint256 distTenant = _dist(counterAmount, d.aiAmount);
            aiSide = distLandlord < distTenant ? Side.LANDLORD : Side.TENANT;
        }
        _openDispute(id, d, DisputeKind.DEDUCTION, aiSide, counterAmount);
    }

    /// Bồi thẩm chỉ chọn bên. Bên nào đủ 2 phiếu (tính cả phiếu AI) thì phân xử ngay.
    function vote(uint256 id, Side side) external nonReentrant {
        Deal storage d = deals[id];
        if (!isJuror[msg.sender]) revert NotJuror();
        if (msg.sender == d.tenant || msg.sender == d.landlord) revert PartyCannotVote();
        _requireState(d, State.DISPUTED);
        if (block.timestamp > d.deadline) revert DeadlinePassed();
        if (side == Side.NONE) revert BadVerdict();
        if (hasVoted[id][msg.sender]) revert AlreadyVoted();

        hasVoted[id][msg.sender] = true;
        if (side == Side.LANDLORD) d.votesLandlord++;
        else d.votesTenant++;
        emit Voted(id, msg.sender, side);

        if (d.votesLandlord >= 2) _resolve(id, d, Side.LANDLORD);
        else if (d.votesTenant >= 2) _resolve(id, d, Side.TENANT);
    }

    // ------------------------------------------------------------ hạn chót

    /// Việc poke sẽ làm, tính một chỗ để poke() và canPoke() không bao giờ lệch nhau.
    enum PokeAction {
        NONE,
        CLOSE_LISTING, //   OPEN quá hạn dọn vào, chưa ai cọc -> CANCELLED
        NO_SHOW, //         RESERVED quá hạn, chưa có ảnh nhận phòng -> hoàn cọc trừ phí giữ chỗ
        ACTIVATE, //        RESERVED, có ảnh, hết hạn phản đối -> ACTIVE
        LANDLORD_SILENT, // CHECKED_OUT quá hạn đề xuất -> người thuê nhận đủ cọc
        TENANT_SILENT, //   PROPOSED quá hạn phản hồi -> chia theo mức chủ trọ đề xuất
        MISMATCH_SILENT, // MISMATCH_REPORTED, chủ trọ im lặng -> hoàn đủ cọc
        ABANDON_SILENT, //  ABANDON_REPORTED, người thuê im lặng -> chủ trọ nhận cọc
        JURY_EXPIRED //     DISPUTED hết hạn bồi thẩm -> quy tắc hết hạn ở mục Tranh chấp
    }

    function _pokeAction(Deal storage d) internal view returns (PokeAction) {
        if (d.deadline == 0 || block.timestamp <= d.deadline) return PokeAction.NONE;
        State s = d.state;
        if (s == State.OPEN) return PokeAction.CLOSE_LISTING;
        if (s == State.RESERVED) {
            return d.checkInHash == bytes32(0) ? PokeAction.NO_SHOW : PokeAction.ACTIVATE;
        }
        if (s == State.CHECKED_OUT) return PokeAction.LANDLORD_SILENT;
        if (s == State.PROPOSED) return PokeAction.TENANT_SILENT;
        if (s == State.MISMATCH_REPORTED) return PokeAction.MISMATCH_SILENT;
        if (s == State.ABANDON_REPORTED) return PokeAction.ABANDON_SILENT;
        if (s == State.DISPUTED) return PokeAction.JURY_EXPIRED;
        return PokeAction.NONE;
    }

    /// Ai cũng gọi được. Tiền chỉ đi tới 2 bên của hợp đồng (và phí sàn trên lãi), nên người gọi không lợi gì.
    function poke(uint256 id) external nonReentrant {
        Deal storage d = deals[id];
        PokeAction a = _pokeAction(d);
        if (a == PokeAction.NONE) revert NothingToPoke();

        if (a == PokeAction.CLOSE_LISTING) {
            _setState(id, d, State.CANCELLED, 0);
            emit DealCancelled(id);
        } else if (a == PokeAction.NO_SHOW) {
            _payout(id, d, Outcome.NO_SHOW, 0);
        } else if (a == PokeAction.ACTIVATE) {
            _setState(id, d, State.ACTIVE, 0);
        } else if (a == PokeAction.LANDLORD_SILENT) {
            _payout(id, d, Outcome.LANDLORD_SILENT, 0);
        } else if (a == PokeAction.TENANT_SILENT) {
            _payout(id, d, Outcome.NORMAL, d.proposedAmount);
        } else if (a == PokeAction.MISMATCH_SILENT) {
            _payout(id, d, Outcome.MISMATCH, 0);
        } else if (a == PokeAction.ABANDON_SILENT) {
            _payout(id, d, Outcome.ABANDONED, 0);
        } else {
            _juryExpired(id, d);
        }
    }

    function canPoke(uint256 id) external view returns (bool) {
        return _pokeAction(deals[id]) != PokeAction.NONE;
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
        bytes32 structHash =
            keccak256(abi.encode(DAMAGE_REPORT_TYPEHASH, id, d.checkInHash, d.checkOutHash, aiAmount, reportHash));
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

    /// Mở tranh chấp: ghi loại, cộng sẵn phiếu AI (nếu có), hạn = now + juryWindow.
    function _openDispute(uint256 id, Deal storage d, DisputeKind kind, Side aiSide, uint256 counterAmount) internal {
        d.disputeKind = kind;
        if (aiSide == Side.LANDLORD) d.votesLandlord = 1;
        else if (aiSide == Side.TENANT) d.votesTenant = 1;
        _setState(id, d, State.DISPUTED, uint64(block.timestamp) + juryWindow);
        emit DisputeOpened(id, kind, counterAmount);
    }

    /// Phân xử khi một bên thắng.
    function _resolve(uint256 id, Deal storage d, Side winner) internal {
        if (d.disputeKind == DisputeKind.DEDUCTION) {
            _payout(id, d, Outcome.NORMAL, winner == Side.LANDLORD ? d.proposedAmount : d.counterAmount);
        } else {
            _payout(id, d, winner == Side.LANDLORD ? Outcome.NO_SHOW : Outcome.MISMATCH, 0);
        }
    }

    /// Hết hạn bồi thẩm mà chưa bên nào đủ 2 phiếu.
    /// DEDUCTION: có con dấu thì D = min(aiAmount, C), không có thì D = trung bình hai con số.
    /// MISMATCH: bên nhiều phiếu hơn thắng, bằng nhau thì người thuê thắng.
    function _juryExpired(uint256 id, Deal storage d) internal {
        if (d.disputeKind == DisputeKind.DEDUCTION) {
            uint256 D;
            if (d.hasAiSeal) D = d.aiAmount < d.deposit ? d.aiAmount : d.deposit;
            else D = (d.proposedAmount + d.counterAmount) / 2;
            _payout(id, d, Outcome.NORMAL, D);
        } else {
            _resolve(id, d, d.votesLandlord > d.votesTenant ? Side.LANDLORD : Side.TENANT);
        }
    }

    function _dist(uint256 a, uint256 b) internal pure returns (uint256) {
        return a > b ? a - b : b - a;
    }

    /// Nếu RESERVED, đã có ảnh nhận phòng và hết hạn phản đối thì chuyển sang ACTIVE ngay.
    function _activateIfDue(uint256 id, Deal storage d) internal {
        if (_pokeAction(d) == PokeAction.ACTIVATE) _setState(id, d, State.ACTIVE, 0);
    }

    /// Chia tiền theo docs/contract-spec.md > Chia tiền. Mọi kết thúc có tiền đều đi qua đây.
    /// C = deposit, R = reserveFee, G = yieldGross, F = phí sàn = G * feeBps / 10000, L = G - F.
    /// Phần lẻ khi chia đôi L thuộc về người thuê. Luôn đúng: toTenant + toLandlord + fee = C + G.
    function _payout(uint256 id, Deal storage d, Outcome outcome, uint256 D) internal {
        _fromVault(d);

        uint256 C = d.deposit;
        if (D > C) D = C; // chỉ xảy ra khi vault lỗ làm C giảm sau lúc đề xuất
        uint256 G = d.yieldGross;
        uint256 fee = (G * feeBps) / 10_000;
        uint256 L = G - fee;
        uint256 half = L / 2;

        uint256 toTenant;
        uint256 toLandlord;
        State end = State.SETTLED;

        if (outcome == Outcome.NORMAL || outcome == Outcome.LANDLORD_SILENT) {
            toTenant = C - D + (L - half);
            toLandlord = D + half;
        } else if (outcome == Outcome.ABANDONED) {
            toTenant = L - half;
            toLandlord = C + half;
        } else if (outcome == Outcome.NO_SHOW) {
            toTenant = C - d.reserveFee + L;
            toLandlord = d.reserveFee;
            end = State.REFUNDED;
        } else {
            // MISMATCH
            toTenant = C + L;
            end = State.REFUNDED;
        }

        // Đổi trạng thái trước, chuyển tiền sau (chống reentrancy).
        _setState(id, d, end, 0);
        emit Paid(id, outcome, toTenant, toLandlord, fee);

        if (toTenant > 0) token.safeTransfer(d.tenant, toTenant);
        if (toLandlord > 0) token.safeTransfer(d.landlord, toLandlord);
        if (fee > 0) token.safeTransfer(feeRecipient, fee);
    }

    /// Gửi cọc vào vault (P2). Chỉ được gọi từ _deposit.
    /// Chặn lỗi "lạm phát cổ phần" của ERC-4626: nếu giá một cổ phần đã bị đẩy lên bất thường (vd vault rỗng
    /// bị chuyển thẳng tiền vào), số cổ phần nhận về bị làm tròn xuống và người gửi mất tiền. Khi đó cọc
    /// KHÔNG gửi vào vault mà nằm yên trong két như hợp đồng không sinh lãi: người thuê chỉ mất phần lãi,
    /// không mất gốc. Ngưỡng: phần làm tròn mất tối đa 0,01% số cọc.
    function _toVault(Deal storage d) internal {
        uint256 shares = vault.previewDeposit(d.deposit);
        if (shares == 0 || vault.previewRedeem(shares) * 10_000 < d.deposit * 9_999) return;
        token.forceApprove(address(vault), d.deposit);
        d.vaultShares = vault.deposit(d.deposit, address(this));
        d.yieldOn = true;
    }

    /// Rút gốc và lãi khỏi vault (P2). Gọi nhiều lần vẫn an toàn.
    /// Nếu vault lỗ, C được hạ xuống đúng số rút về, để không bao giờ chi tiền của hợp đồng khác.
    function _fromVault(Deal storage d) internal {
        if (!d.yieldOn) return;
        d.yieldOn = false;
        uint256 shares = d.vaultShares;
        d.vaultShares = 0;
        uint256 assets = vault.redeem(shares, address(this), address(this));
        if (assets >= d.deposit) {
            d.yieldGross = assets - d.deposit;
        } else {
            d.deposit = assets;
            if (d.reserveFee > assets) d.reserveFee = assets;
        }
    }

    /// Domain separator cho server ký con dấu và cho test.
    function domainSeparator() external view returns (bytes32) {
        return _domainSeparatorV4();
    }
}
