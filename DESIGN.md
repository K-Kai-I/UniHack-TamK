---
name: Két Cọc Trọ
description: Két giữ tiền cọc thuê trọ bằng smart contract, cho người thuê cầm điện thoại đứng trong phòng.
colors:
  vault-navy: "#0b2545"
  vault-navy-foreground: "#ffffff"
  navy-mist: "#e8eef6"
  safe-emerald: "#10b981"
  emerald-wash: "#e7f8f1"
  emerald-ink: "#065f46"
  deadline-amber: "#f59e0b"
  deadline-amber-ink: "#451a03"
  pending-blue: "#3b82f6"
  dispute-red: "#dc2626"
  ledger-paper: "#f7f9fc"
  card-white: "#ffffff"
  slate-ink: "#0f172a"
  slate-muted: "#64748b"
  muted-fill: "#eef2f7"
  hairline: "#e2e8f0"
typography:
  display:
    fontFamily: "Be Vietnam Pro, system-ui, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 800
    lineHeight: 1.2
    fontFeature: "\"tnum\""
  headline:
    fontFamily: "Be Vietnam Pro, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 800
    lineHeight: 1.25
    letterSpacing: "-0.025em"
  title:
    fontFamily: "Be Vietnam Pro, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 700
    lineHeight: 1.55
  body:
    fontFamily: "Be Vietnam Pro, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  body-sm:
    fontFamily: "Be Vietnam Pro, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.43
  label:
    fontFamily: "Be Vietnam Pro, system-ui, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 600
    lineHeight: 1.25
  mono:
    fontFamily: "JetBrains Mono, ui-monospace, monospace"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.43
rounded:
  sm: "8.4px"
  md: "11.2px"
  lg: "14px"
  xl: "19.6px"
  2xl: "25.2px"
  full: "9999px"
spacing:
  1: "4px"
  2: "8px"
  3: "12px"
  4: "16px"
  5: "20px"
  7: "28px"
components:
  button-primary:
    backgroundColor: "{colors.vault-navy}"
    textColor: "{colors.vault-navy-foreground}"
    typography: "{typography.body}"
    rounded: "{rounded.lg}"
    height: "56px"
    width: "100%"
  button-secondary:
    backgroundColor: "{colors.navy-mist}"
    textColor: "{colors.vault-navy}"
    rounded: "{rounded.lg}"
    height: "48px"
  button-outline:
    backgroundColor: "{colors.ledger-paper}"
    textColor: "{colors.slate-ink}"
    rounded: "{rounded.lg}"
    height: "56px"
    padding: "0 24px"
  button-destructive:
    backgroundColor: "#dc26261a"
    textColor: "{colors.dispute-red}"
    rounded: "{rounded.lg}"
    height: "48px"
  card-ledger:
    backgroundColor: "{colors.card-white}"
    textColor: "{colors.slate-ink}"
    rounded: "{rounded.2xl}"
    padding: "12px 16px"
  input:
    backgroundColor: "transparent"
    textColor: "{colors.slate-ink}"
    rounded: "{rounded.lg}"
    height: "48px"
    padding: "4px 10px"
  status-badge:
    rounded: "{rounded.full}"
    typography: "{typography.label}"
    height: "20px"
    padding: "2px 8px"
  wallet-chip:
    backgroundColor: "{colors.card-white}"
    typography: "{typography.mono}"
    rounded: "{rounded.full}"
    padding: "6px 12px"
---

# Design System: Két Cọc Trọ

## Overview

**Creative North Star: "Két sắt công chứng"**

Chắc như một cái két, minh bạch như một bảng niêm yết công khai. Cửa két màu navy đậm làm nút chính, đầu trang và tiêu đề. Màu emerald chỉ xuất hiện khi tiền đang an toàn hoặc đã về đúng chỗ. Mỗi con số được trình bày như một dòng biên bản: nhãn bên trái, giá trị bên phải, số thẳng cột. Giao diện không nghiêng về bên nào. Nó chỉ cho biết tiền đang nằm đâu, ai phải làm gì và còn bao lâu.

Mật độ thấp, một cột, mobile-first. Màn hình được viết cho người đứng trong phòng trọ và bấm bằng một tay. Mỗi màn có một hành động chính, nằm trong thanh đáy dính chân màn và cao 56px. Bề mặt phẳng: tách lớp bằng nền xanh rất nhạt so với thẻ trắng và viền mảnh, không dùng bóng đổ. Chuyển động chỉ để báo trạng thái (đang ký, đang chờ chuỗi). Hiệu ứng lấp lánh chỉ có ở màn chào đầu tiên.

Chỉ có giao diện sáng. Thuật ngữ crypto (hash, địa chỉ ví, Snowtrace) hiện bằng font mono, nhỏ, ở vị trí phụ, cho ai muốn kiểm chứng.

**Key Characteristics:**
- Một cột rộng tối đa 448px, lề 20px, các khối cách nhau 28px.
- Nút chính 56px full width, dính đáy, có lớp nền mờ và khoảng an toàn dưới (safe-area).
- Thẻ kiểu biên bản: nền trắng, viền 1px màu `slate-ink` ở 10% độ đậm, bo 25px, các dòng chia bằng vạch mảnh.
- Tiền hiển thị VND to và đậm; số token nhỏ và mờ ngay bên dưới.
- Màu trạng thái lấy từ một bảng tone duy nhất (`web/lib/client/deal-status.ts`).

## Colors

Navy trầm làm khung, emerald làm tín hiệu "an toàn", ba màu cảnh báo chỉ để báo trạng thái, trên nền giấy xanh rất nhạt.

### Primary
- **Vault Navy** (`vault-navy`): nút chính, tiêu đề trang (h1), tiêu đề đầu trang, đồng hồ đếm ngược khi còn hạn, bước đang làm trên thanh tiến trình. Đây là màu của "cửa két". Cũng là `themeColor` của trình duyệt.
- **Navy Mist** (`navy-mist`): nền nút phụ, vùng hover của nút quay lại, nền khung ảnh giữ chỗ.

### Secondary
- **Safe Emerald** (`safe-emerald`): tiền đã khóa, giao dịch thành công, bước đã xong, vòng focus (`ring`). Chỉ dùng khi tin tốt là sự thật.
- **Emerald Wash** (`emerald-wash`): nền hover và mục đang chọn.
- **Emerald Ink** (`emerald-ink`): chữ trên nền emerald nhạt. Nhãn "thành công" dùng `emerald-700` để đủ tương phản.

### Tertiary (chỉ cho trạng thái)
- **Deadline Amber** (`deadline-amber`): sắp hết hạn, đang chờ một bên phản hồi. Chữ trên nền amber dùng **Deadline Amber Ink** (`deadline-amber-ink`), không dùng amber làm màu chữ.
- **Pending Blue** (`pending-blue`): đang chờ ký, đang chờ chuỗi xác nhận, phòng đang trống.
- **Dispute Red** (`dispute-red`): kháng nghị, báo sai mô tả, báo bỏ ngang, lỗi, hạn đã qua.

### Neutral
- **Ledger Paper** (`ledger-paper`): nền trang.
- **Card White** (`card-white`): thẻ, popover, chip ví.
- **Slate Ink** (`slate-ink`): chữ chính.
- **Slate Muted** (`slate-muted`): nhãn dòng, chú thích, số token phụ.
- **Muted Fill** (`muted-fill`): nền khối thông báo trống/lỗi, nền skeleton, bước chưa tới.
- **Hairline** (`hairline`): viền, vạch chia, viền ô nhập.

### Named Rules
**The Earned Emerald Rule.** Emerald chỉ xuất hiện khi tiền thật sự an toàn hoặc một bước thật sự đã xong. Không dùng emerald cho trang trí hay cho nút kêu gọi hành động.

**The Tone Table Rule.** Màu trạng thái của hợp đồng chỉ lấy từ `TONE_CLASS` (nền ở 10–15%, viền ở 20–30%, chữ đậm cùng hue). Không viết mã màu thẳng trong component. Đổi màu thì sửa `app/globals.css`.

## Typography

**Body Font:** Be Vietnam Pro (với system-ui)
**Label/Mono Font:** JetBrains Mono (với ui-monospace)

**Character:** Một họ sans hình học, sinh ra cho tiếng Việt: dấu không đè lên nhau, nét đậm vẫn rõ dưới nắng. Font mono chỉ dành cho những thứ máy đọc (địa chỉ ví, hash, mã giao dịch), để chúng trông khác hẳn chữ người.

### Hierarchy
- **Display** (800, 30px, 1.2, số thẳng cột): đồng hồ đếm ngược hạn chót, con số lớn nhất trên màn. Hết hạn thì chuyển sang `dispute-red`.
- **Headline** (800, 24px, 1.25, tracking -0.025em, text-balance): tên phòng hoặc tiêu đề màn, màu `vault-navy`.
- **Title** (700, 18px): tiêu đề từng khối ("Tiền cọc trong contract", "Hai bên").
- **Body** (400, 16px, 1.5): nội dung, chữ nút chính (nút chính đặt 16px thay cho 14px mặc định).
- **Body-sm** (400, 14px): nhãn dòng, chú thích, thông báo giao dịch. Đây là cỡ dùng nhiều nhất.
- **Label** (600, 11px): nhãn bước trên thanh tiến trình, nhãn trạng thái.
- **Mono** (400, 12–14px): địa chỉ rút gọn, hash giao dịch, link Snowtrace.

### Named Rules
**The Ledger Number Rule.** Mọi con số thay đổi theo thời gian hoặc xếp thành cột (tiền, đếm ngược) dùng `tabular-nums`. Số VND đậm (600–800) và đặt trước; số token nhỏ, màu `slate-muted`, nằm dưới.

**The Vietnamese Subset Rule.** Mọi font nạp phải có subset `vietnamese`. Nếu một font không có, không dùng font đó.

## Layout

Một cột giữa màn, `max-width: 448px`, lề ngang 20px, trên cả điện thoại lẫn desktop (desktop chỉ là cột hẹp đặt giữa). Các khối dọc cách nhau 28px; trong một khối, tiêu đề cách nội dung 12px. Dòng trong thẻ có padding 12px × 16px.

Đầu trang con: nút quay lại tròn 44px sát lề trái (lùi -8px để icon thẳng lề), tiêu đề ngắn một dòng màu navy, chỗ trống bên phải cho thao tác phụ.

Thanh hành động đáy: `position: fixed`, full width, viền trên mảnh, nền `ledger-paper` ở 80–95% kèm backdrop blur, padding dưới `max(1rem, safe-area-inset-bottom)`. Nội dung trang chừa padding dưới 160px để không bị che.

Thanh tiến trình: lưới 5 cột đều, vạch cao 6px bo tròn, nhãn 11px bên dưới.

### Named Rules
**The One Thumb Rule.** Hành động chính của màn luôn nằm trong thanh đáy, trong tầm ngón cái. Không đặt hành động chính ở đầu trang.

## Elevation & Depth

Phẳng. Độ sâu đến từ nền: thẻ trắng nằm trên nền giấy xanh nhạt, viền là vòng 1px màu chữ ở 10% độ đậm. Bóng đổ chỉ có ở ba chỗ nhỏ: chip ví và thẻ chọn vai ở onboarding (`shadow-sm`), logo ở onboarding (`shadow-md`). Lớp nổi duy nhất là thanh hành động đáy: nền mờ kèm blur, không bóng.

### Named Rules
**The Flat Ledger Rule.** Thẻ và dòng biên bản không có bóng. Muốn tách lớp thì đổi nền (`card-white` / `muted-fill`) hoặc thêm vạch chia, không thêm bóng.

## Shapes

Bo góc to, mềm, hợp ngón tay. Gốc là `--radius: 14px` (0.875rem); các bậc tính theo hệ số. Dùng nhiều nhất là 25px cho thẻ và khối nội dung. Khối trạng thái giao dịch, ảnh nhỏ và skeleton nút dùng 19.6px. Nút và ô nhập dùng 14px. Nút icon, chip ví, nhãn trạng thái và vạch tiến trình bo tròn hẳn.

Ảnh phòng cắt theo khung (`object-cover`). Khi chưa có ảnh, khung giữ chỗ là gradient chéo từ `navy-mist` sang `emerald-wash`, giữa có icon giường nét mảnh (stroke 1.5).

## Components

### Buttons
To, chắc, dễ bấm.
- **Shape:** bo vừa (14px).
- **Primary:** nền `vault-navy`, chữ trắng 16px. Ở màn sản phẩm luôn cao 56px và full width trong thanh đáy. Hover giảm còn 80% độ đậm; khi nhấn dịch xuống 1px.
- **Secondary:** nền `navy-mist`, chữ navy, cao 48px cho hành động phụ.
- **Outline:** viền `hairline` trên nền trang, dùng cho "Quay lại" cạnh nút chính trong wizard (56px, padding ngang 24px).
- **Destructive:** nền đỏ 10%, chữ `dispute-red`. Không bao giờ dùng nền đỏ đặc.
- **Focus:** viền đổi sang emerald, vòng 3px emerald ở 50%. **Disabled:** 50% độ đậm, không bấm được.
- Kích thước mặc định 32px của shadcn chỉ dùng ở trang dev và chỗ phụ (ví dụ "Thử lại").

### Cards / Containers
- **Corner Style:** 25px.
- **Background:** `card-white` trên `ledger-paper`.
- **Shadow Strategy:** không bóng (xem Flat Ledger Rule).
- **Border:** vòng 1px `slate-ink` ở 10%. Các dòng chia bằng `divide-y` màu `hairline`.
- **Internal Padding:** 12px × 16px mỗi dòng; khối thông báo trống/lỗi dùng 48px × 24px trên nền `muted-fill`, chữ căn giữa.

### Inputs / Fields
- **Style:** viền 1px `hairline`, nền trong suốt, bo 14px, chữ 16px trên mobile (để iOS không tự phóng to).
- **Focus:** viền emerald kèm vòng 3px emerald ở 50%.
- **Error / Disabled:** viền và vòng đỏ (`aria-invalid`); disabled ở 50% độ đậm.

### Chips
- **Status badge:** pill 20px, chữ 12px đậm 600, màu theo tone trong Tone Table Rule.
- **Wallet chip:** pill trắng, viền mảnh, `shadow-sm`, địa chỉ rút gọn bằng mono 14px; hover sang `emerald-wash`.

### Navigation
Không có thanh tab hay menu. Điều hướng là nút quay lại 44px ở đầu mỗi trang con và các nút trong thanh đáy. Trang chủ là danh sách.

### Transaction Status (signature)
Khối `role="status"` bo 19.6px, padding 12px, icon 20px bên trái. Có ba trạng thái: đang chờ (nền xanh lam 10%, icon xoay), xong (nền emerald 10%, dấu tick, hash bằng mono và link Snowtrace), lỗi (nền đỏ 10%, kèm lý do). Mỗi giao dịch trong app phải đi qua khối này.

### Deadline Countdown (signature)
Thẻ hạn chót: đồng hồ đếm ngược cỡ Display màu navy (hết hạn thì đỏ), kèm một câu nói rõ hết hạn thì chuyện gì xảy ra với tiền.

### Onboarding Flourish
`ShimmerButton` và `BorderBeam` (viền sáng emerald chạy vòng, chu kỳ 8 giây) **chỉ dùng ở màn chào đầu tiên**.

## Do's and Don'ts

### Do:
- **Do** đặt hành động chính trong thanh đáy dính chân màn, cao 56px, full width, chữ 16px.
- **Do** hiển thị tiền bằng VND đậm với `tabular-nums`, kèm số token nhỏ màu `slate-muted` bên dưới.
- **Do** lấy màu trạng thái từ `TONE_CLASS` và token trong `app/globals.css`.
- **Do** giữ vùng chạm tối thiểu 44px cho mọi nút icon.
- **Do** dùng font mono cho địa chỉ ví, hash và mã giao dịch, và đặt chúng ở vị trí phụ.
- **Do** cho mọi giao dịch đi qua khối Transaction Status với đủ ba trạng thái.

### Don't:
- **Don't** dùng ShimmerButton, BorderBeam hay hiệu ứng lấp lánh ngoài màn chào đầu tiên. Không lấp lánh khi đang nói về tiền.
- **Don't** dùng emerald cho trang trí hoặc cho nút kêu gọi hành động. Nút chính là navy.
- **Don't** thêm bóng đổ vào thẻ hay dòng biên bản.
- **Don't** viết mã màu hex thẳng trong component.
- **Don't** thêm giao diện tối (hệ thống chỉ có giao diện sáng).
- **Don't** đặt nền đỏ đặc cho nút. Hành động tiêu cực dùng nền đỏ 10% kèm chữ đỏ.
