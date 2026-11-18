---
version: 1
slug: "web-components-rooms-list-tsx"
primary_target: "web/components/rooms-list.tsx"
related_targets: ["web/components/room-cover.tsx", "web/app/dev/rooms/page.tsx"]
---

# Task UI 05 — Danh sách phòng

Operate. Người thuê nhận ra phòng, so tiền thuê/cọc, ngày dọn vào rồi mở điều khoản. Kế thừa DESIGN.md, task02 và task05 trong kế hoạch hướng A. Không đổi API, quyền, contract, schema hoặc cách quy đổi tiền.

## Direction contract

THESIS: Ảnh, tên phòng và số tiền giúp chọn đúng phòng để xem điều khoản; không đưa giao dịch cọc vào danh sách.

OWN-WORLD: Trắng, mực tím than, vùng phụ tím nhạt, Be Vietnam Pro. Thẻ phẳng; tên và địa chỉ đầy đủ; không ảnh nhà mẫu hoặc nhãn xác minh tự tạo.

STORY: Tải phòng OPEN → xem phòng/tiền/ngày → mở chi tiết. Lỗi đầu có thử lại; lỗi cập nhật giữ dữ liệu cũ và cảnh báo phòng có thể đã có người cọc.

FIRST VIEWPORT: PageShell1200px; tiêu đề và điều hướng/tải lại trên; danh sách1 cột mobile,2 từ640,3 từ1024. Ảnh4:3 chứa trọn ảnh nguồn, thông tin dưới; tiền thuê/cọc có nhãn riêng. Không thanh đáy.

FORM: seed: none (pinned), “task 05 ui của hướng A”; kế hoạch chốt “Lưới responsive; tiêu đề dài/thiếu ảnh/lỗi/trống ổn; ảnh thật không bị cắt mất thông tin chính”. Gỡ stagger/zoom ảnh. Nhãn ảnh thiếu/lỗi hiện rõ; tải lại thử lại ảnh mà giữ focus link.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance. Đối chiếu hệ đã có, giữ tài liệu nếu không đổi quy tắc. Ảnh chẩn đoán trong trang mẫu chỉ kiểm tra tỉ lệ, không phải ảnh phòng thật.
