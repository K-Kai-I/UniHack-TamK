# Hợp đồng contract – Két Cọc Trọ

Một contract `DepositEscrow` giữ mọi hợp đồng cọc; tiền chỉ rời contract về đúng 3 địa chỉ: người thuê, chủ trọ, và ví phí sàn (chỉ phần phí trên lãi). Tài liệu này là căn cứ để viết Solidity và để Frontend gọi hàm. Bản chốt tối 12/11; muốn đổi thì báo cả nhóm, sửa tài liệu trước rồi mới sửa code.

## Kiến trúc

| Contract | Việc | Mức |
| --- | --- | --- |
| `MockUSDC` | ERC-20 + ERC-2612 permit, 6 số lẻ, `faucet()` phát 1.000 mUSDC cho người gọi | P0 |
| `DepositEscrow` | Giữ cọc, máy trạng thái, hạn chót, chia tiền, bồi thẩm, kiểm tra con dấu AI | P0, P1 |
| `MockVault` | ERC-4626 trên `MockUSDC`, có `simulateYield(amount)` để tạo lãi khi demo | P2 |

Công cụ: Solidity 0.8.24, OpenZeppelin v5 (`SafeERC20`, `ReentrancyGuard`, `Ownable`, `EIP712`, `ECDSA`, `ERC20Permit`, `ERC4626`), Foundry để test và deploy. Mạng: Avalanche Fuji C-Chain, chain ID 43113. Không dùng proxy.

Một contract cho mọi hợp đồng (không deploy mỗi phòng một contract): `mapping(uint256 => Deal) deals`, id tăng dần từ 1.

## Constructor và quyền

```
constructor(
  IERC20 token,          // MockUSDC
  address aiSigner,      // ví ký con dấu AI, cố định
  address feeRecipient,  // ví nhận phí sàn
  uint16 feeBps,         // 1000 = 10% trên lãi
  IERC4626 vault,        // address(0) nếu chưa có vault
  Timeouts memory t      // 8 khoảng thời gian, tính bằng giây
)
```

Owner (ví deploy) chỉ làm được hai việc: `addJuror(address)` và `removeJuror(address)`. Owner không đổi được token, người ký AI, phí, hạn chót, và không có hàm rút tiền nào.

## Kiểu dữ liệu

Thứ tự `State` giữ đúng như User flow; trạng thái mới chỉ thêm vào cuối để Frontend không lệch số.

```
enum State {
  OPEN,              // 0  phòng đang trống
  RESERVED,          // 1  đã cọc, chờ ảnh nhận phòng hoặc chờ hết hạn phản đối ảnh
  ACTIVE,            // 2  đang ở
  CHECKED_OUT,       // 3  đã trả phòng, chờ chủ trọ đề xuất
  PROPOSED,          // 4  có đề xuất, chờ người thuê
  DISPUTED,          // 5  chờ bồi thẩm
  SETTLED,           // 6  đã chia tiền
  REFUNDED,          // 7  đã hoàn cọc trước khi ở
  CANCELLED,         // 8  gỡ tin khi chưa ai cọc
  MISMATCH_REPORTED, // 9  người thuê báo phòng sai, chờ chủ trọ
  ABANDON_REPORTED   // 10 chủ trọ báo bỏ ngang, chờ người thuê
}
enum DisputeKind { NONE, DEDUCTION, MISMATCH }
enum Side { NONE, LANDLORD, TENANT }
enum Outcome { NORMAL, NO_SHOW, MISMATCH, ABANDONED, LANDLORD_SILENT }

struct Deal {
  address landlord;
  address tenant;
  uint256 deposit;        // C
  uint256 reserveFee;     // R, R <= C
  uint64  moveInDate;     // giây Unix
  uint64  leaseEnd;
  uint64  deadline;       // hạn của bước đang chờ; 0 = không có hạn
  State   state;
  bool    yieldEnabled;   // chủ trọ cho phép sinh lãi
  bool    yieldOn;        // tiền đang nằm trong vault
  bool    checkInContested;
  bool    hasAiSeal;
  DisputeKind disputeKind;
  uint8   votesLandlord;
  uint8   votesTenant;
  bytes32 termsHash;      // hash file điều khoản
  bytes32 checkInHash;    // hash bộ ảnh nhận phòng
  bytes32 checkOutHash;   // hash bộ ảnh trả phòng
  bytes32 aiReportHash;
  uint256 aiAmount;       // mức trừ AI ký
  uint256 proposedAmount; // D, con số của chủ trọ
  uint256 counterAmount;  // T, con số của người thuê khi kháng nghị
  uint256 vaultShares;
  uint256 yieldGross;     // lãi trước phí, chốt lúc rút khỏi vault
}

mapping(uint256 => mapping(address => bool)) public hasVoted;
mapping(address => bool) public isJuror;
```

## Tham số thời gian

Tám khoảng thời gian nằm trong `Timeouts`, truyền vào constructor. Bản demo deploy với cột Demo.

| Tên | Đếm từ | Thật | Demo | Quá hạn thì `poke` làm gì |
| --- | --- | --- | --- | --- |
| `moveInGrace` | `moveInDate` | 1 ngày | 3 phút | Chưa có ảnh nhận phòng: hoàn cọc trừ phí giữ chỗ. Chưa ai cọc: đóng tin |
| `checkInObjection` | Gửi ảnh nhận phòng | 2 ngày | 2 phút | Sang ACTIVE |
| `mismatchWindow` | Báo phòng sai | 24 giờ | 2 phút | Hoàn đủ cọc |
| `abandonWindow` | Báo bỏ ngang | 2 ngày | 2 phút | Chủ trọ nhận cọc |
| `checkOutGrace` | `leaseEnd` | 1 ngày | 2 phút | Không qua `poke`: chủ trọ được gọi trả phòng thay |
| `proposeWindow` | Trả phòng | 1 ngày | 3 phút | Chia tiền với mức trừ 0 |
| `respondWindow` | Đề xuất | 1 ngày | 3 phút | Chia tiền theo mức chủ trọ đề xuất |
| `juryWindow` | Mở tranh chấp | 1 ngày | 5 phút | Phân xử theo quy tắc hết hạn ở mục Tranh chấp |

## Bảng chuyển trạng thái

| Từ | Sang | Khi |
| --- | --- | --- |
| (chưa có) | OPEN | `createDeal` |
| OPEN | CANCELLED | `cancelDeal`, hoặc `poke` khi quá hạn dọn vào |
| OPEN | RESERVED | `deposit` / `depositWithPermit` |
| RESERVED | RESERVED | `submitCheckIn` (lưu hash, bắt đầu hạn phản đối); `contestCheckIn` (xóa hash, chụp lại) |
| RESERVED | ACTIVE | `poke` khi đã có ảnh và hết hạn phản đối |
| RESERVED | REFUNDED | `poke` khi chưa có ảnh và quá hạn dọn vào (không đến) |
| RESERVED | MISMATCH_REPORTED | `reportMismatch` với con dấu AI "khác rõ" |
| RESERVED | DISPUTED | `reportMismatch` khi AI "không rõ" hoặc không có con dấu |
| MISMATCH_REPORTED | REFUNDED | `poke` khi chủ trọ im lặng |
| MISMATCH_REPORTED | DISPUTED | `contestMismatch` |
| ACTIVE | CHECKED_OUT | `submitCheckOut` |
| ACTIVE | ABANDON_REPORTED | `reportAbandon` |
| ABANDON_REPORTED | ACTIVE | `contestAbandon` |
| ABANDON_REPORTED | SETTLED | `poke` khi người thuê im lặng |
| CHECKED_OUT | PROPOSED | `proposeDeduction` với mức trừ lớn hơn 0 |
| CHECKED_OUT | SETTLED | `proposeDeduction` với mức trừ 0, hoặc `poke` khi chủ trọ im lặng |
| PROPOSED | SETTLED | `acceptProposal`, hoặc `poke` khi người thuê im lặng |
| PROPOSED | DISPUTED | `disputeProposal` |
| DISPUTED | SETTLED hoặc REFUNDED | `vote` khi một bên đủ 2 phiếu, hoặc `poke` khi hết hạn bồi thẩm |

## Hàm

Mọi hàm kiểm tra theo thứ tự: ai gọi, trạng thái, hạn chót, rồi mới đổi trạng thái và cuối cùng chuyển tiền. Sai điều kiện thì revert bằng lỗi ở mục Lỗi.

| Hàm | Ai gọi | Trạng thái cần | Làm gì | Mức |
| --- | --- | --- | --- | --- |
| `createDeal(deposit, reserveFee, moveInDate, leaseEnd, yieldEnabled, termsHash) → id` | Bất kỳ (thành chủ trọ) | — | Kiểm tra `deposit > 0`, `reserveFee <= deposit`, `leaseEnd > moveInDate`, `termsHash != 0`. Tạo deal OPEN | P0 |
| `cancelDeal(id)` | Chủ trọ | OPEN | Sang CANCELLED | P0 |
| `deposit(id, wantYield)` | Bất kỳ, khác chủ trọ | OPEN, chưa quá `moveInDate + moveInGrace` | Kéo C từ người gọi (cần approve trước). Ghi `tenant`. `deadline = moveInDate + moveInGrace`. Nếu `wantYield && yieldEnabled && vault != 0` thì gửi vào vault, trừ khi giá cổ phần vault bất thường (gửi vào nhận 0 cổ phần, hoặc rút ra ngay hụt quá 0,01% C): khi đó cọc nằm trong két, `yieldOn = false`, giao dịch vẫn thành công. Sang RESERVED | P0 |
| `depositWithPermit(id, wantYield, permitDeadline, v, r, s)` | Như trên | Như trên | Gọi `permit` trong `try/catch` rồi chạy như `deposit`. Người thuê chỉ ký 1 giao dịch | P0 |
| `submitCheckIn(id, checkInHash)` | Người thuê | RESERVED, `checkInHash == 0`, chưa quá `deadline` | Lưu hash. `deadline = now + checkInObjection` | P0 |
| `contestCheckIn(id)` | Chủ trọ | RESERVED, đã có `checkInHash`, chưa quá `deadline`, `checkInContested == false` | Xóa `checkInHash`, đặt `checkInContested = true`, `deadline = now + moveInGrace` để người thuê chụp lại | P2 |
| `reportMismatch(id, verdict, evidenceHash, reportHash, aiSig)` | Người thuê | RESERVED, `checkInHash == 0`, chưa quá `deadline` | `aiSig` rỗng thì coi như "không rõ". Verdict 2 (khác rõ): sang MISMATCH_REPORTED, `deadline = now + mismatchWindow`. Verdict 1 (không rõ): mở tranh chấp loại MISMATCH, không có phiếu AI. Verdict 0 (giống): revert | P1 |
| `contestMismatch(id)` | Chủ trọ | MISMATCH_REPORTED, chưa quá `deadline` | Mở tranh chấp loại MISMATCH, phiếu AI tính cho người thuê | P1 |
| `submitCheckOut(id, checkOutHash)` | Người thuê bất cứ lúc nào; hoặc chủ trọ khi `now > leaseEnd + checkOutGrace` | ACTIVE | Lưu hash. Rút gốc và lãi khỏi vault, chốt `yieldGross`. `deadline = now + proposeWindow`. Sang CHECKED_OUT | P0 (chủ trọ trả thay: P1) |
| `reportAbandon(id)` | Chủ trọ | ACTIVE | Sang ABANDON_REPORTED, `deadline = now + abandonWindow` | P1 |
| `contestAbandon(id)` | Người thuê | ABANDON_REPORTED, chưa quá `deadline` | Quay lại ACTIVE, `deadline = 0` | P1 |
| `proposeDeduction(id, amount, aiAmount, reportHash, aiSig)` | Chủ trọ | CHECKED_OUT, chưa quá `deadline` | `amount <= deposit`. Có `aiSig` thì kiểm tra chữ ký, lưu `aiAmount`, `aiReportHash`, `hasAiSeal = true`. `amount == 0`: chia tiền ngay. Ngược lại: lưu `proposedAmount`, `deadline = now + respondWindow`, sang PROPOSED | P0 |
| `acceptProposal(id)` | Người thuê | PROPOSED | Chia tiền với D = `proposedAmount` | P0 |
| `disputeProposal(id, counterAmount)` | Người thuê | PROPOSED, chưa quá `deadline` | `counterAmount < proposedAmount`. Mở tranh chấp loại DEDUCTION | P1 |
| `vote(id, side)` | Bồi thẩm, không phải 2 bên của deal | DISPUTED, chưa quá `deadline`, chưa bỏ phiếu | Cộng phiếu. Bên nào đủ 2 phiếu thì phân xử ngay | P1 |
| `poke(id)` | Bất kỳ | Có hạn đã qua | Xử lý hạn chót theo bảng Tham số thời gian. Không có gì để xử lý thì revert `NothingToPoke` | P0 |
| `canPoke(id) → bool` | view | — | Bot keeper và nút "Xử lý quá hạn" hỏi trước khi gọi | P0 |
| `getDeal(id) → Deal`, `dealCount() → uint256` | view | — | Đọc dữ liệu | P0 |
| `addJuror(a)`, `removeJuror(a)` | Owner | — | Quản lý danh sách bồi thẩm | P1 |

Hai hàm nội bộ duy nhất được chạm vào vault: `_toVault(id)` và `_fromVault(id)`. `_fromVault` gọi nhiều lần vẫn an toàn (đã rút rồi thì không làm gì) và được gọi trước mọi lần chia tiền.

## Chia tiền

Mọi kết thúc đi qua một hàm nội bộ `_payout(id, outcome, D)`. Ký hiệu: C = `deposit`, R = `reserveFee`, G = `yieldGross`, F = `G * feeBps / 10000` (phí sàn), L = G − F. Phần lẻ khi chia đôi L thuộc về người thuê.

| Outcome | Khi nào | Người thuê | Chủ trọ | Trạng thái cuối |
| --- | --- | --- | --- | --- |
| `NORMAL` | Đồng ý, im lặng sau đề xuất, hoặc bồi thẩm chốt mức D | C − D + (L − L/2) | D + L/2 | SETTLED |
| `LANDLORD_SILENT` | Chủ trọ không đề xuất tới hạn (D = 0) | C + (L − L/2) | L/2 | SETTLED |
| `ABANDONED` | Người thuê im lặng sau khi bị báo bỏ ngang | L − L/2 | C + L/2 | SETTLED |
| `NO_SHOW` | Không gửi ảnh nhận phòng tới hạn, hoặc thua tranh chấp phòng sai | C − R + L | R | REFUNDED |
| `MISMATCH` | Phòng sai mô tả và chủ trọ im lặng, hoặc người thuê thắng tranh chấp | C + L | 0 | REFUNDED |

Phí F chuyển cho `feeRecipient` trong cùng giao dịch. Với mọi outcome: người thuê + chủ trọ + F = C + G.

Ví dụ kiểm tra: C = 6.000.000, G = 222.222, phí 10% nên F = 22.222 và L = 200.000, D = 400.000. Người thuê nhận 5.700.000, chủ trọ nhận 500.000.

## Tranh chấp và bồi thẩm

Bồi thẩm chỉ chọn bên, không nhập số tiền. Bên nào đủ 2 phiếu thì thắng ngay; phiếu AI (nếu có con dấu) được cộng sẵn lúc mở tranh chấp.

| Loại | Mở bằng | Phiếu AI về bên nào | Chủ trọ thắng | Người thuê thắng | Hết hạn mà chưa bên nào đủ 2 phiếu |
| --- | --- | --- | --- | --- | --- |
| `DEDUCTION` | `disputeProposal` | Bên có con số gần `aiAmount` hơn; bằng nhau thì về người thuê | `NORMAL` với D = `proposedAmount` | `NORMAL` với D = `counterAmount` | Có con dấu: D = `min(aiAmount, C)`. Không có: D = trung bình của hai con số |
| `MISMATCH` | `contestMismatch`, hoặc `reportMismatch` khi AI không rõ | Người thuê nếu con dấu ghi "khác rõ"; không có phiếu nếu "không rõ" | `NO_SHOW` | `MISMATCH` | Bên nhiều phiếu hơn thắng; bằng nhau thì người thuê thắng |

Khi mở tranh chấp: `disputeKind` được ghi, `deadline = now + juryWindow`, trạng thái sang DISPUTED.

Điểm yếu đã biết, nói thẳng trong pitch: danh sách bồi thẩm do team thêm, nên team vẫn ảnh hưởng được kết quả tranh chấp. Team không lấy được tiền, vì tiền chỉ về 2 bên của hợp đồng.

## Con dấu AI (EIP-712)

Server AI ký dữ liệu có cấu trúc bằng khóa của `aiSigner`; contract dựng lại đúng dữ liệu đó và kiểm tra người ký. Chữ ký gắn với `dealId` và hash bộ ảnh, nên không dùng lại được cho hợp đồng khác hoặc bộ ảnh khác.

```
// Domain
name: "KetCocTro", version: "1", chainId: 43113, verifyingContract: <địa chỉ DepositEscrow>

// Dùng trong proposeDeduction
DamageReport(uint256 dealId,bytes32 checkInHash,bytes32 checkOutHash,uint256 aiAmount,bytes32 reportHash)

// Dùng trong reportMismatch. verdict: 0 = giống, 1 = không rõ, 2 = khác rõ
MismatchReport(uint256 dealId,bytes32 termsHash,bytes32 evidenceHash,uint8 verdict,bytes32 reportHash)
```

`submitCheckIn` và `submitCheckOut` từ chối hash bằng 0 (`EmptyHash`): nếu không, người thuê gửi bộ ảnh rỗng nhiều lần để tự gia hạn. `contestCheckIn` khi chưa có ảnh trả `WrongState`.

Contract lấy `checkInHash`, `checkOutHash`, `termsHash` từ chính deal đang lưu, không nhận từ tham số. Người ký không phải `aiSigner` thì revert `BadSignature`.

## Event

Frontend và backend dựng lịch sử hợp đồng từ event, nên mỗi lần đổi trạng thái phải phát đúng một event nghiệp vụ và một `StateChanged`.

```
event StateChanged(uint256 indexed id, State from, State to, uint64 deadline);
event DealCreated(uint256 indexed id, address indexed landlord, uint256 deposit, uint256 reserveFee,
                  uint64 moveInDate, uint64 leaseEnd, bool yieldEnabled, bytes32 termsHash);
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
```

## Lỗi

```
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
```

## Nút trên app theo trạng thái

Frontend chỉ hiện nút khi contract đang ở đúng trạng thái. Nút "Xử lý quá hạn" hiện cho mọi người khi `canPoke(id)` là true.

| Trạng thái | Người thuê thấy | Chủ trọ thấy |
| --- | --- | --- |
| OPEN | Gửi cọc | Gỡ phòng |
| RESERVED, chưa có ảnh | Gửi ảnh nhận phòng (chụp xong chọn: phòng đúng mô tả → `submitCheckIn`, hoặc không giống → `reportMismatch`) | Đếm ngược hạn dọn vào |
| RESERVED, đã có ảnh | Đếm ngược tới khi bắt đầu ở; hết hạn thì app tự chuyển sang Đang ở (không hiện "Xử lý quá hạn") | Phản đối ảnh (P2) |
| MISMATCH_REPORTED | Đếm ngược | Phản đối |
| ACTIVE | Trả phòng | Báo người thuê bỏ đi; Trả phòng thay (sau hạn) |
| ABANDON_REPORTED | Tôi vẫn đang ở | Đếm ngược |
| CHECKED_OUT | Xem báo cáo AI | Xem báo cáo AI; Đề xuất mức trừ |
| PROPOSED | Đồng ý; Kháng nghị (nhập con số của mình) | Đếm ngược |
| DISPUTED | Xem phiếu | Xem phiếu |
| SETTLED, REFUNDED | Biên nhận, link Snowtrace | Biên nhận, link Snowtrace |

## Bất biến

1. Với mọi deal đã kết thúc: tiền người thuê nhận + tiền chủ trọ nhận + phí = C + G.
2. Số dư token của contract cộng tài sản trong vault luôn lớn hơn hoặc bằng tổng `deposit` của các deal chưa kết thúc.
3. Không có đường nào chuyển token tới địa chỉ khác `tenant`, `landlord`, `feeRecipient`, `vault`.
4. Deal ở SETTLED, REFUNDED, CANCELLED không đổi trạng thái được nữa và không chi tiền lần hai.
5. Một deal đang có tiền luôn có ít nhất một đường thoát chỉ cần thời gian trôi và một lần gọi `poke`, trừ trạng thái ACTIVE (cần người thuê hoặc chủ trọ trả phòng).

## Test bắt buộc

Trạng thái 16/11: 83 test qua (`contracts/test/DepositEscrow.t.sol`, `contracts/test/Vault.t.sol`).


- [x] Luồng chuẩn đủ 7 bước, kiểm tra số dư 2 ví khớp ví dụ ở mục Chia tiền
- [x] Mỗi dòng của bảng Chia tiền có một test riêng, kiểm tra bất biến 1
- [x] Mỗi hàm: người lạ gọi, sai trạng thái, gọi 2 lần, gọi sau hạn
- [x] `poke` trước hạn thì revert; sau hạn thì ai gọi cũng được và tiền về đúng người
- [x] Hai người gửi cọc cùng một phòng: người sau revert, không mất tiền
- [x] Chủ trọ tự gửi cọc phòng mình: revert
- [x] Chữ ký AI: đúng người ký thì qua; sai người ký, sai `dealId`, sai hash ảnh thì revert
- [x] Bồi thẩm: 2 phiếu thắng ngay; AI + 1 bồi thẩm thắng; 2 bên của deal không được bỏ phiếu; hết hạn đi đúng quy tắc
- [x] Fuzz: `deposit`, `reserveFee`, `amount`, `yieldGross` ngẫu nhiên vẫn giữ bất biến 1
- [x] Có vault (P2): lãi chốt đúng lúc rút, phí đúng 10%

## Checklist an toàn trước khi khóa

- [x] Mọi hàm chuyển tiền có `nonReentrant` và đổi trạng thái trước khi chuyển
- [x] Dùng `SafeERC20` cho mọi lần chuyển token
- [x] Mọi hàm có kiểm tra người gọi và trạng thái ở dòng đầu
- [x] `amount` và `counterAmount` không vượt `deposit`
- [x] Không có hàm nào của owner chạm vào tiền
- [x] Contract đã verify trên Snowtrace; địa chỉ nằm trong `deployments.json` và README
- [ ] Private key ví deploy và ví ký AI không nằm trong repo

## Câu giám khảo có thể hỏi

- Chuyển tiền trước rồi mới đổi trạng thái thì kẻ tấn công làm gì?
- Bot keeper ngừng chạy thì tiền có kẹt không? (Không: ai cũng gọi được `poke`.)
- Contract biết con dấu là của server AI bằng cách nào? Server AI bị chiếm thì mất gì? (Mất tối đa một phiếu trong tranh chấp; không rút được tiền.)
- Vì sao gửi stablecoin thường cần 2 bước, và permit gộp được phần nào?
