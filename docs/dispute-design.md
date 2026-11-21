# Thiết kế tranh chấp và lộ trình bồi thẩm

Tài liệu này giải thích vì sao bản MVP dùng danh sách bồi thẩm cố định, bảo đảm nào vẫn đúng khi bồi thẩm do nhóm chỉ định, và hệ thống bồi thẩm sẽ mở dần theo số người dùng ra sao. Luật chi tiết của contract nằm ở [`contract-spec.md`](contract-spec.md) (mục Tranh chấp và bồi thẩm).

## Tóm tắt

- Bồi thẩm là **lớp cuối cùng**, không phải đường chính. Phần lớn hợp đồng kết thúc mà không cần ai phân xử: hai bên đồng ý, hoặc một bên im lặng tới hạn và luật mặc định tự chia tiền.
- Ở MVP, bồi thẩm là **danh sách cố định do nhóm thêm** (`addJuror`, chỉ owner gọi được). Đây là lựa chọn có chủ đích: chọn bồi thẩm bằng thuật toán chỉ có ý nghĩa khi đã có đủ người dùng để chọn.
- Dù bồi thẩm do nhóm chỉ định, **nhóm không lấy được tiền**: contract chỉ chuyển tiền tới người thuê, chủ trọ và phí sàn trên phần lãi.
- Lộ trình có 3 giai đoạn: cố định (MVP) → người dùng uy tín được chọn ngẫu nhiên (thí điểm) → bồi thẩm đặt cọc, có thưởng và phạt (mở rộng).

## Vì sao tranh chấp hiếm khi tới tay bồi thẩm

| Lớp | Cơ chế | Tác dụng |
| --- | --- | --- |
| 1. Luật chốt trước | Bảng giá sửa chữa và điều khoản khóa bằng `termsHash` lúc duyệt hợp đồng | Hai bên cãi về con số, không cãi về luật |
| 2. Bằng chứng không sửa được | Ảnh chụp bằng camera trong app, hash bộ ảnh ghi lên chuỗi | Không ai đổi ảnh sau khi đã nộp |
| 3. AI đề xuất | AI so ảnh, nhân đơn giá, ký con dấu EIP-712 gắn với `dealId` và hash ảnh trên chuỗi | Có một con số trung lập để hai bên tham chiếu |
| 4. Hạn chót | 8 hạn chót, bên im lặng tới hạn thì chịu, ai cũng gọi được `poke` | Không có tranh chấp "treo", tiền không kẹt |
| 5. Bồi thẩm | Chỉ chọn một trong hai con số, bên đủ 2 phiếu (tính cả phiếu AI) thắng | Chỉ dùng khi bốn lớp trên không đủ |

## Giai đoạn 1: bồi thẩm cố định (MVP, hiện tại)

**Cách làm.** Owner thêm ví bồi thẩm lúc deploy (`JUROR_ADDRESSES` trong `contracts/script/Deploy.s.sol`) hoặc gọi `addJuror` / `removeJuror`. Bồi thẩm xem ảnh các vị trí bị tranh chấp và báo cáo AI trong app (màn Bỏ phiếu), rồi gọi `vote(id, side)`.

**Vì sao chưa chọn bằng thuật toán.** Khi chưa có người dùng, tập ứng viên rất nhỏ. Chọn ngẫu nhiên từ một tập nhỏ còn dễ thao túng hơn chỉ định: một chủ trọ chỉ cần tạo vài ví là chiếm được phần lớn tập bồi thẩm (tấn công Sybil). Danh sách cố định ít nhất có người chịu trách nhiệm rõ ràng.

**Bảo đảm vẫn đúng ở giai đoạn này:**
- Tiền chỉ đi tới 2 bên của hợp đồng (và phí sàn trên lãi). Không hàm nào cho owner hay bồi thẩm rút tiền.
- Bồi thẩm không nhập số tiền, chỉ chọn con số của chủ trọ hoặc của người thuê.
- Bên của hợp đồng không được bỏ phiếu cho chính mình (`PartyCannotVote`).
- Phiếu AI là chữ ký kiểm chứng được trên chuỗi, không phải lời nói của nhóm.

**Giới hạn nói thẳng.** Nhóm giữ cả danh sách bồi thẩm lẫn khóa ký con dấu AI, nên ở giai đoạn này nhóm có thể quyết định kết quả một tranh chấp (dù không lấy được tiền). Giai đoạn 2 và 3 tách hai quyền này khỏi nhóm.

## Giai đoạn 2: người dùng uy tín, chọn ngẫu nhiên (thí điểm)

Điều kiện bắt đầu: có đủ người dùng đã hoàn tất hợp đồng để lập tập bồi thẩm (mục tiêu vài trăm người).

- **Ai được làm bồi thẩm:** người dùng đã hoàn tất ít nhất một số hợp đồng mà không thua tranh chấp, đã xác minh tài khoản.
- **Chọn cho từng vụ:** mỗi tranh chấp chọn ngẫu nhiên 3 bồi thẩm, loại người có liên quan tới hai bên.
- **Thưởng:** trích từ phí sàn cho bồi thẩm bỏ phiếu đúng hạn.
- **Khóa AI:** chuyển từ một khóa trên server sang ký nhiều bên (multisig), có thể xoay khóa.

## Giai đoạn 3: bồi thẩm đặt cọc (mở rộng)

- **Đặt cọc để làm bồi thẩm:** muốn được chọn phải khóa một khoản cọc. Bỏ phiếu cùng phía đa số thì được thưởng, lệch phía thì mất một phần cọc. Tạo nhiều ví không còn rẻ.
- **Ngẫu nhiên kiểm chứng được:** chọn bồi thẩm bằng nguồn ngẫu nhiên có thể kiểm chứng trên chuỗi (VRF), để không ai, kể cả nhóm, đoán trước được ai sẽ xử vụ nào.
- **Ngưỡng phiếu:** nâng từ "2 phiếu" lên đa số của 3 hoặc 5 bồi thẩm, AI vẫn là một phiếu.

## Luật khi bồi thẩm vắng mặt

Ở giai đoạn 1, bồi thẩm ít người nên luật "hết hạn mà chưa bên nào đủ 2 phiếu" quyết định nhiều vụ nhất. Nhóm đã rà lại các luật này và sẽ siết trong bản contract tiếp theo:

| Tình huống | Luật hiện tại | Sẽ đổi thành |
| --- | --- | --- |
| Hết hạn, tranh chấp mức trừ, có con dấu AI | Mức trừ = `min(aiAmount, cọc)` | Kẹp giữa hai con số hai bên đưa ra: `min(max(aiAmount, counterAmount), proposedAmount)` |
| Con dấu AI chỉ chủ trọ nộp được (trong `proposeDeduction`) | Chủ trọ có thể không nộp con dấu | Người thuê cũng nộp được con dấu khi kháng nghị (`disputeProposal`) |
| Báo phòng sai mô tả, AI "không rõ", hết hạn mà hòa | Người thuê thắng, hoàn đủ cọc kể cả phí giữ chỗ | Hòa thì giữ luật mặc định của nhánh không đến (mất phí giữ chỗ), hoặc cho người thuê chụp lại |

Ba tình huống này chỉ xảy ra khi bồi thẩm không bỏ phiếu kịp; khi bồi thẩm hoạt động, kết quả do phiếu quyết định.
