---
version: 1
slug: "web-components-listing-wizard-tsx"
primary_target: "web/components/listing-wizard.tsx"
related_targets: ["web/components/listing-steps.tsx","web/components/listing-fields.tsx","web/app/dev/listing/page.tsx"]
---

# Task 08 — Đăng phòng

Operate; người chủ trọ hoàn thành sáu bước hiện có, chụp ảnh phòng và ảnh ví dụ, xem lại rồi ký. Giữ API, số tiền và quyền hiện có. Không lưu draft qua reload; giữ draft/ảnh trong phiên khi đổi viewport và qua lại bước.

## Direction contract

THESIS: Chuẩn bị căn phòng và các góc chụp để dùng lại ở mốc nhận/trả; sáu bước có tên, lỗi tại nơi nhập và đường quay lại rõ.
OWN-WORLD: Hướng A, nền trắng, chữ tím than, Be Vietnam Pro, viền phẳng và vùng tóm tắt tím nhạt; ảnh thật hiển thị đủ khung.
STORY: Điền thông tin → tiền và ngày → vị trí chụp và bảng giá → xem lại, ký. Phí giữ chỗ nằm trong cọc.
FIRST VIEWPORT: Mobile có bước hiện tại, mô tả ngắn, trường nhập và một vùng nút đáy; desktop form tối đa640px cạnh tóm tắt320px trong shell1200px. Một cây DOM giữ draft khi resize. Lỗi đưa focus tới trường cần sửa; đổi bước đưa focus tới tiêu đề.
FORM: seed: none (pinned), “task 08 ui của hướng A”; sáu bước và bố cục form đã chốt tại DESIGN.md và kế hoạch UI. Tương tác chủ đạo: xem lại → sửa đúng bước, dữ liệu vẫn còn. Không chuyển động trang trí; cuộn tuân thủ reduced motion.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
