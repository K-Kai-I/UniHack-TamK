---
version: 1
slug: "web-components-deposit-sheet-tsx"
primary_target: "web/components/deposit-sheet.tsx"
related_targets: ["web/app/dev/deposit/page.tsx","web/lib/client/use-deposit.ts"]
---

# Task UI07 — xác nhận gửi cọc

Mode: Operate. Phạm vi deposit-sheet, điểm nối tại room-detail, thông tin bước ký từ hook hiện có; preview không giao dịch. Hướng A và yêu cầu nghiệm thu task07 đã chốt ở ui-redesign-plan.md; đây là mở rộng hệ đang có, code-first, không chọn lại nhận diện.

## Direction contract

World: Căn phòng qua từng mốc; token, font và nền sáng theo DESIGN.md.
First viewport: tên phòng → số cọc thực gửi → phí giữ chỗ đã gồm trong cọc → hạn/điều kiện → xác nhận. Overlay tối đa640px, nội dung cuộn, nút đóng tới được.
Visitor path: xem tiền và hạn → chọn sinh lãi nếu đã có → ký cho phép dùng token → xác nhận giao dịch → chờ kết quả → link Snowtrace và hợp đồng.
Signature interaction: giữ nguyên lựa chọn khi hủy ký/thử lại/resize; kết quả không biến mất khi query đổi phòng thành RESERVED.
Cross-surface: giữ RoomDetail và Drawer primitive; một vùng hành động, tiền onchain, hạn theo config; không sửa spec/API/contract.
Risk: preview không chứng minh ví/chain thật; đọc số dư lỗi phải có thử lại và khóa gửi; quá hạn/khác trạng thái chặn gửi nhưng giữ tiến trình đã gửi. Không có ảnh thực, không thêm ảnh giả.
Seed: none (pinned) — hướng A đã chốt, task07 xác định chính xác bề mặt và yêu cầu.
