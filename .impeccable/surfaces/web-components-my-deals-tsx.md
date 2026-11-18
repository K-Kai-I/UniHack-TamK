---
version: 1
slug: "web-components-my-deals-tsx"
primary_target: "web/components/my-deals.tsx"
related_targets: ["web/app/dev/my-deals/page.tsx"]
---

# Task UI 04 — Hợp đồng của tôi

Operate. Phạm vi my-deals.tsx và trang mẫu /dev/my-deals; kế thừa task02, DESIGN.md và yêu cầu task04 hướng A. Không đổi API, quyền, contract hay dữ liệu tiền.

## Direction contract

THESIS: Nhận ra phòng và việc cần xem tiếp, cả hai vai trên cùng tài khoản. Không suy việc nhận phòng từ state RESERVED thiếu checkInHash.

OWN-WORLD: Trắng, mực tím than, vùng phụ tím nhạt, Be Vietnam Pro; nhãn trạng thái có chữ. Ảnh phòng đúng nguồn hoặc fallback trung thực, không ảnh giả.

STORY: Đăng nhập → hợp đồng cần phản hồi trước → hợp đồng đang diễn ra → đã kết thúc. Mỗi dòng cho biết phòng, vai, cọc trong điều khoản, hạn và lối xem chi tiết. Hết hạn chưa đồng nghĩa đã xử lý.

FIRST VIEWPORT: Khung1200px; tiêu đề và lối xem phòng/đăng phòng; desktop dòng gồm phòng, tiền cọc, việc/hạn. Mobile thẻ một cột, tên và vai trước tiền/hạn. Không thanh hành động cố định hoặc số liệu tổng hợp.

FORM: seed: none (pinned), “Task04 Hợp đồng của tôi”, “hướng A”, card mobile và dòng desktop đã chốt trong kế hoạch. Giữ thứ tự ưu tiên hiện có; không thêm bộ lọc.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance. Đối chiếu DESIGN.md/sidecar và giữ nguyên nếu không đổi quy tắc. Bằng chứng mock không thay auth/chain thật.
