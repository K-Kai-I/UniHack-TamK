// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title IDepositEscrow
/// @notice Giao diện của két cọc. Đây là "hợp đồng" giữa Contract và Frontend:
///         tên hàm, tham số, event, lỗi và thứ tự enum phải khớp docs/contract-spec.md.
///         Muốn đổi thì sửa docs/contract-spec.md trước và báo cả nhóm.
interface IDepositEscrow {
    // ---------------------------------------------------------------- kiểu dữ liệu

    /// Thứ tự cố định. Trạng thái mới chỉ được thêm vào cuối.
    enum State {
        OPEN, //              0 phòng đang trống
        RESERVED, //          1 đã cọc, chờ ảnh nhận phòng hoặc chờ hết hạn phản đối ảnh
        ACTIVE, //            2 đang ở
        CHECKED_OUT, //       3 đã trả phòng, chờ chủ trọ đề xuất
        PROPOSED, //          4 có đề xuất, chờ người thuê
        DISPUTED, //          5 chờ bồi thẩm
        SETTLED, //           6 đã chia tiền
        REFUNDED, //          7 đã hoàn cọc trước khi ở
        CANCELLED, //         8 gỡ tin khi chưa ai cọc
        MISMATCH_REPORTED, // 9 người thuê báo phòng sai, chờ chủ trọ
        ABANDON_REPORTED //  10 chủ trọ báo bỏ ngang, chờ người thuê
    }

    enum DisputeKind {
        NONE,
        DEDUCTION,
        MISMATCH
    }

    enum Side {
        NONE,
        LANDLORD,
        TENANT
    }

    enum Outcome {
        NORMAL,
        NO_SHOW,
        MISMATCH,
        ABANDONED,
        LANDLORD_SILENT
    }

    /// 8 khoảng thời gian, tính bằng giây. Cố định trong constructor.
    struct Timeouts {
        uint64 moveInGrace;
        uint64 checkInObjection;
        uint64 mismatchWindow;
        uint64 abandonWindow;
        uint64 checkOutGrace;
        uint64 proposeWindow;
        uint64 respondWindow;
        uint64 juryWindow;
    }

    struct Deal {
        address landlord;
        address tenant;
        uint256 deposit; //        C
        uint256 reserveFee; //     R, R <= C
        uint64 moveInDate; //      giây Unix
        uint64 leaseEnd;
        uint64 deadline; //        hạn của bước đang chờ; 0 = không có hạn
        State state;
        bool yieldEnabled; //      chủ trọ cho phép sinh lãi
        bool yieldOn; //           tiền đang nằm trong vault
        bool checkInContested;
        bool hasAiSeal;
        DisputeKind disputeKind;
        uint8 votesLandlord;
        uint8 votesTenant;
        bytes32 termsHash; //      hash file điều khoản
        bytes32 checkInHash; //    hash bộ ảnh nhận phòng
        bytes32 checkOutHash; //   hash bộ ảnh trả phòng
        bytes32 aiReportHash;
        uint256 aiAmount; //       mức trừ AI ký
        uint256 proposedAmount; // D, con số của chủ trọ
        uint256 counterAmount; //  T, con số của người thuê khi kháng nghị
        uint256 vaultShares;
        uint256 yieldGross; //     lãi trước phí, chốt lúc rút khỏi vault
    }

    // ---------------------------------------------------------------- event

    event StateChanged(uint256 indexed id, State from, State to, uint64 deadline);
    event DealCreated(
        uint256 indexed id,
        address indexed landlord,
        uint256 deposit,
        uint256 reserveFee,
        uint64 moveInDate,
        uint64 leaseEnd,
        bool yieldEnabled,
        bytes32 termsHash
    );
    event DealCancelled(uint256 indexed id);
    event Deposited(uint256 indexed id, address indexed tenant, uint256 amount, bool yieldOn);
    event CheckInSubmitted(uint256 indexed id, bytes32 checkInHash);
    event CheckInContested(uint256 indexed id);
    event MismatchReported(uint256 indexed id, uint8 verdict, bytes32 evidenceHash, bytes32 reportHash);
    event AbandonReported(uint256 indexed id);
    event AbandonContested(uint256 indexed id);
    event CheckedOut(uint256 indexed id, address indexed by, bytes32 checkOutHash, uint256 yieldGross);
    event Proposed(uint256 indexed id, uint256 amount, uint256 aiAmount, bytes32 reportHash, bool hasAiSeal);
    event DisputeOpened(uint256 indexed id, DisputeKind kind, uint256 counterAmount);
    event Voted(uint256 indexed id, address indexed juror, Side side);
    event Paid(uint256 indexed id, Outcome outcome, uint256 toTenant, uint256 toLandlord, uint256 fee);
    event JurorSet(address indexed juror, bool active);

    // ---------------------------------------------------------------- lỗi

    error NotLandlord();
    error NotTenant();
    error NotJuror();
    error PartyCannotVote();
    error LandlordCannotRent();
    error WrongState(State expected, State actual);
    error DeadlinePassed();
    error DeadlineNotReached();
    error InvalidAmount();
    error InvalidDates();
    error CheckInAlreadySubmitted();
    error AlreadyContested();
    error AlreadyVoted();
    error BadSignature();
    error BadVerdict();
    error NothingToPoke();

    // ---------------------------------------------------------------- hàm

    function createDeal(
        uint256 deposit,
        uint256 reserveFee,
        uint64 moveInDate,
        uint64 leaseEnd,
        bool yieldEnabled,
        bytes32 termsHash
    ) external returns (uint256 id);

    function cancelDeal(uint256 id) external;

    function deposit(uint256 id, bool wantYield) external;

    function depositWithPermit(uint256 id, bool wantYield, uint256 permitDeadline, uint8 v, bytes32 r, bytes32 s)
        external;

    function submitCheckIn(uint256 id, bytes32 checkInHash) external;

    function contestCheckIn(uint256 id) external;

    function reportMismatch(uint256 id, uint8 verdict, bytes32 evidenceHash, bytes32 reportHash, bytes calldata aiSig)
        external;

    function contestMismatch(uint256 id) external;

    function submitCheckOut(uint256 id, bytes32 checkOutHash) external;

    function reportAbandon(uint256 id) external;

    function contestAbandon(uint256 id) external;

    function proposeDeduction(uint256 id, uint256 amount, uint256 aiAmount, bytes32 reportHash, bytes calldata aiSig)
        external;

    function acceptProposal(uint256 id) external;

    function disputeProposal(uint256 id, uint256 counterAmount) external;

    function vote(uint256 id, Side side) external;

    function poke(uint256 id) external;

    function canPoke(uint256 id) external view returns (bool);

    function getDeal(uint256 id) external view returns (Deal memory);

    function dealCount() external view returns (uint256);

    function addJuror(address juror) external;

    function removeJuror(address juror) external;
}
