---
version: 1
slug: "web-app-page-tsx"
primary_target: "web/app/page.tsx"
related_targets: ["web/components/landing"]
---

# Landing "/" (chưa đăng nhập)

Mode: Persuade. Người xem: người thuê trước (sinh viên, điện thoại), giám khảo cuộn xuống thấy chiều sâu. Desktop và mobile đầu tư ngang nhau.
Hành động chính: "Bắt đầu với Google" (Privy login). Đã đăng nhập: giữ màn home hiện tại (OnboardingView nhánh authenticated).
Bằng chứng: ví dụ minh họa khớp `shared/samples` (phòng 20m² gần ĐH Bách Khoa, cọc 6.000.000 ₫, p1 tường vết ố → 400.000 ₫, p2 cửa hao mòn 0 ₫, p3 sàn 0 ₫); báo Tuổi Trẻ 28/08/2026 + Thanh Niên 03/06/2022 có link; số liệu Fuji thật ở "Dưới mặt nước". Ảnh phòng là ảnh AI do người dùng tạo → nhãn "Ảnh minh họa"; chưa có ảnh thì khung fallback.
Phần: hero · vấn đề · 7 mốc · so ảnh · nếu ai im lặng · kết cục · dành cho chủ trọ · dưới mặt nước · giới hạn nói thật · hỏi đáp · đội ngũ (ảnh chân dung, chờ ảnh) · lời kết.
Cấm: neon/glow/gradient web3, giọng hô hào, bịa số, thuật ngữ crypto trước "Dưới mặt nước", hứa "không bao giờ mất cọc".
Hạn: 21:00 20/11/2026.
Mở: nháy landing trước khi Privy ready với người đã đăng nhập.

## Direction contract

THESIS: Tiền cọc là một dải mực tím than liền mạch chạy suốt trang; ở mọi điểm cuộn người xem thấy tiền đang ở đâu. Từ chối hero chia đôi + hàng thẻ tính năng.
OWN-WORLD: Hướng A giữ nguyên (nền trắng, mực #30254b, phụ #f2eff8, viền #ded9e8, Be Vietnam Pro 800 cho tiêu đề, JetBrains Mono chỉ ở Dưới mặt nước). Ngữ pháp từ dải lụa nguồn gốc: nét liền = đã xác nhận, nét đứt xám = chờ/im lặng; nút tròn có ngày + nhãn ở mỗi mốc; con dấu tròn mực = con dấu AI; cuối dải tách theo đúng tỉ lệ tiền (xanh #16634a phần người thuê). Phẳng, không bóng.
STORY: Hiểu tiền nằm trong hợp đồng chứ không trong tay ai; tin vì thấy ảnh trước/sau, bảng giá, hạn chót và số liệu chuỗi thật; bấm Bắt đầu với Google.
FIRST VIEWPORT: Desktop 1440: tiêu đề 76px "Luôn biết tiền cọc của bạn đang ở đâu." góc trên trái, phụ đề, nút chính 64px ngay dưới; dải 64px đi vào từ mép trên giữa, gập ở Gửi cọc / Nhận phòng, đoạn đứt "6 tháng ở", tách ở Trả phòng thành 5.600.000 ₫ / 400.000 ₫; nhãn mốc tabular. Mobile 390: dải chạy dọc mép trái, tiêu đề + nút trong tầm ngón cái.
FORM: Dải tiền cọc (challenger exhibition-museum-curation-provenance-ribbon, hợp nhất với hướng A), không thuộc danh sách thứ hạng; seed:41390c9b68a7d8f5. Tương tác chủ đạo: dải tự vẽ theo cuộn (SVG stroke theo scroll); so ảnh kéo thanh trượt đóng con dấu AI; chọn bên im lặng → đoạn dải chuyển nét đứt và đoạn cuối tách lại.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
