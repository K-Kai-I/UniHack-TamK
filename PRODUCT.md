# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

Mobile-first web app (Next.js). Người dùng mở trên điện thoại khi đang đứng trong phòng trọ; desktop là phụ.

## Users

- **Người thuê (ưu tiên số một).** Thường là sinh viên hoặc người đi làm trẻ thuê trọ ở Việt Nam. Đây là bên yếu thế: tiền cọc vài triệu đồng nằm trong tay chủ trọ, và không đáng để ra tòa. Họ gửi cọc, chụp ảnh lúc nhận phòng và lúc trả phòng, rồi đồng ý hoặc kháng nghị mức trừ. Lúc dùng app họ cầm điện thoại đứng trong phòng, một tay, có khi đèn yếu, có khi chủ trọ đứng cạnh.
- **Chủ trọ (thứ hai).** Đăng phòng kèm điều khoản và bảng giá sửa chữa, đề xuất mức trừ sau khi người thuê trả phòng.
- **Bồi thẩm.** Người do nhóm thêm vào danh sách, bỏ phiếu chọn một trong hai con số khi có tranh chấp.
- **Giám khảo Team1 Vietnam UniHack.** Xem demo trước hạn khóa sản phẩm 23:59 ngày 18/11/2026. Demo phải chạy trọn vẹn, nhưng màn hình được thiết kế cho người thuê, không thiết kế cho sân khấu.

Khi nhu cầu của các bên xung đột, người thuê thắng.

Người dùng **không biết gì về crypto**. Họ đăng nhập bằng Google qua Privy, ví được tạo ngầm.

## Product Purpose

Két Cọc Trọ giữ tiền cọc thuê trọ trong smart contract trên Avalanche Fuji, nên không ai, kể cả nhóm phát triển, giữ hay rút được tiền cọc ra ngoài người thuê và chủ trọ. AI so ảnh trước và sau, tính mức trừ theo bảng giá đã khóa trong hợp đồng và ký một con dấu. Mọi bước có hạn chót, và bên nào im lặng tới hạn thì bên đó chịu, nên tiền không bao giờ kẹt.

Thành công là khi người thuê nhận lại tiền cọc đúng hạn, với mức trừ mà cả hai bên thấy có căn cứ, mà không phải cãi nhau.

## Positioning

Tiền nằm trong contract chứ không nằm trong tay chủ trọ. Bằng chứng là ảnh chụp bằng camera trong app, có hash ghi trên chuỗi. Mức trừ đi theo bảng giá có sẵn từ lúc đăng phòng. AI chỉ là một phiếu và không bao giờ chạm vào tiền. Hạn chót có thật nên im lặng cũng có hệ quả. Một app quản lý trọ hay ví điện tử thông thường không nói được câu "không ai rút được tiền cọc của bạn".

## Operating Context

- Luồng chuẩn: Đăng phòng → Người thuê gửi yêu cầu (chọn ngày) → Chủ trọ duyệt và ký → Gửi cọc → Nhận phòng → Đang ở → Trả phòng → Đề xuất mức trừ → Chia tiền. Có các nhánh A–H (`docs/user-flow.md`).
- Người thuê xác nhận 3 lần (gửi cọc, ảnh nhận phòng, ảnh trả phòng); chủ trọ xác nhận 2 lần (duyệt yêu cầu thuê, đề xuất). Đăng phòng không cần ký.
- Ảnh chỉ chụp bằng camera trong app, không được chọn ảnh từ thư viện.
- Khi demo, hạn chót tính bằng phút; ngoài đời tính bằng ngày.
- Giao dịch chốt trong 1–2 giây trên Avalanche, nên người thuê đứng trong phòng là thấy cọc đã khóa.

## Capabilities and Constraints

- Nguồn sự thật: `docs/contract-spec.md`, `docs/api-contract.md`, `docs/data-contract.md`; kiểu dùng chung ở `web/lib/types.ts`. Luật cho AI viết code ở `AGENTS.md`.
- Trạng thái hợp đồng đọc từ contract. Nút hành động chỉ hiện khi contract đang ở đúng trạng thái.
- Mỗi giao dịch hiện 3 trạng thái: đang chờ ký/xác nhận, xong (kèm link Snowtrace), lỗi (kèm lý do dễ hiểu). Xong bước chính thì có màn thành công rồi tự về hợp đồng.
- Việc đang chờ người dùng hiện chấm đỏ ở Home và dòng đỏ "Đến lượt bạn: …" (chưa có thông báo đẩy).
- Tiền hiển thị bằng VND, quy đổi qua `vndPerToken`. Trên chuỗi là stablecoin test có 6 số lẻ.
- AI có thể trả `UNCLEAR`, và server AI có thể sập (nhánh H). UI phải chạy được khi không có phiếu AI.
- Phạm vi MVP và danh sách "Không làm" ở `AGENTS.md`: không thanh toán tiền thuê/điện nước, không tìm kiếm nâng cao, không tiền thật.

## Brand Commitments

- Tên: **Két Cọc Trọ**.
- UI tiếng Việt, câu ngắn.
- **Giọng văn trung lập như trọng tài.** Ngắn, rõ, không đứng về phía nào. Nói đúng sự thật: còn bao lâu, ai phải làm gì, im lặng thì chuyện gì xảy ra. Không hô hào, không đùa khi đang nói về tiền.
- **Không dùng thuật ngữ crypto trên màn chính.** Nói "tiền cọc", "đã khóa", "VND", "xác nhận". Ví, token, hash, địa chỉ, link Snowtrace chỉ xuất hiện ở biên nhận hoặc phần chi tiết cho người muốn kiểm chứng.

## Evidence on Hand

- Dữ liệu mẫu: `shared/samples/*.json`. App chạy thật trên Fuji với API và database thật (unihack-tamk.vercel.app); dữ liệu giả chỉ còn ở các trang `/dev` và khi bật `NEXT_PUBLIC_MOCK_API`.
- Chưa có logo, ảnh thật, người dùng thật, lời chứng thực hay số liệu. Đừng bịa ra.
- Giới hạn đã biết phải nói thật (README): bồi thẩm do nhóm thêm; ảnh vẫn có thể bị dàn dựng; MVP chỉ dùng token test trên Fuji.

## Product Principles

1. **Người thuê luôn biết tiền của mình đang ở đâu.** Mỗi màn trả lời được: tiền đang nằm đâu, bao nhiêu, bao giờ về.
2. **Hạn chót là trung tâm.** Ai phải làm gì, trước lúc nào, im lặng thì sao: luôn hiện rõ, không giấu.
3. **Trung lập và có căn cứ.** Mức trừ luôn kèm ảnh, hạng mục bảng giá và nguồn (AI, chủ trọ, bồi thẩm). App không phán xét ai.
4. **Blockchain ở dưới mặt nước.** Bằng chứng kiểm chứng được nhưng không bắt ai phải hiểu nó.
5. **Ít thao tác nhất.** Mỗi bước một hành động chính, làm được bằng một tay khi đang đứng.

## Accessibility & Inclusion

- Dùng ngoài trời và trong phòng thiếu sáng, bằng một tay: chữ đọc được, vùng chạm lớn, độ tương phản cao.
- Dấu tiếng Việt phải hiển thị đúng. Font hiện tại là Be Vietnam Pro, có subset `vietnamese`.
- Chưa chốt chuẩn WCAG cụ thể (để ngỏ).
