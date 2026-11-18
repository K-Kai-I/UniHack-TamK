---
name: Két Cọc Trọ
description: "Hướng A — Căn phòng qua từng mốc: ảnh thật, tiền cọc và việc cần làm rõ ràng."
colors:
  background: "#ffffff"
  foreground: "#241f30"
  card: "#ffffff"
  card-foreground: "#241f30"
  popover: "#ffffff"
  popover-foreground: "#241f30"
  primary: "#30254b"
  primary-foreground: "#ffffff"
  primary-hover: "#241b3a"
  secondary: "#f2eff8"
  secondary-foreground: "#30254b"
  muted: "#f5f3f8"
  muted-foreground: "#655f73"
  accent: "#ebe6f4"
  accent-foreground: "#30254b"
  success: "#16634a"
  success-foreground: "#ffffff"
  warning: "#f4c36a"
  warning-foreground: "#65420c"
  info: "#245da8"
  info-foreground: "#ffffff"
  destructive: "#b42336"
  destructive-foreground: "#ffffff"
  border: "#ded9e8"
  input: "#898092"
  ring: "#6e5597"
typography:
  display:
    fontFamily: "Be Vietnam Pro, system-ui, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 800
    lineHeight: 1.2
    fontFeature: "\"tnum\""
  headline-lg:
    fontFamily: "Be Vietnam Pro, system-ui, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 800
    lineHeight: 1.375
    letterSpacing: "-0.025em"
  headline:
    fontFamily: "Be Vietnam Pro, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 800
    lineHeight: 1.375
    letterSpacing: "-0.025em"
  title-lg:
    fontFamily: "Be Vietnam Pro, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 800
    lineHeight: 1.375
  title:
    fontFamily: "Be Vietnam Pro, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 700
    lineHeight: 1.5
  body:
    fontFamily: "Be Vietnam Pro, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.6
  body-sm:
    fontFamily: "Be Vietnam Pro, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "Be Vietnam Pro, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: 1.5
  mono:
    fontFamily: "JetBrains Mono, ui-monospace, monospace"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.6
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
  6: "24px"
  8: "32px"
  12: "48px"
components:
  button-default:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    typography: "{typography.body}"
    rounded: "{rounded.lg}"
    height: "48px"
    padding: "8px 16px"
  button-default-hover:
    backgroundColor: "{colors.primary-hover}"
    textColor: "{colors.primary-foreground}"
  button-lg:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.lg}"
    height: "56px"
    padding: "12px 24px"
  button-action-area:
    rounded: "{rounded.lg}"
    height: "56px"
  button-secondary:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.secondary-foreground}"
    rounded: "{rounded.lg}"
    height: "48px"
    padding: "8px 16px"
  button-secondary-hover:
    backgroundColor: "{colors.accent}"
  button-outline:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.lg}"
    height: "48px"
    padding: "8px 16px"
  button-outline-hover:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.accent-foreground}"
  button-destructive:
    backgroundColor: "#b423361a"
    textColor: "{colors.destructive}"
    rounded: "{rounded.lg}"
    height: "48px"
    padding: "8px 16px"
  button-icon:
    rounded: "{rounded.lg}"
    size: "44px"
  back-link:
    textColor: "{colors.primary}"
    rounded: "{rounded.full}"
    size: "44px"
  input:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    typography: "{typography.body}"
    rounded: "{rounded.lg}"
    height: "48px"
    padding: "8px 12px"
  status-badge:
    rounded: "{rounded.full}"
    typography: "{typography.label}"
    height: "24px"
    padding: "4px 10px"
  wallet-chip:
    backgroundColor: "{colors.card}"
    textColor: "{colors.foreground}"
    typography: "{typography.mono}"
    rounded: "{rounded.full}"
    height: "44px"
    padding: "6px 12px"
  card-ledger:
    backgroundColor: "{colors.card}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.2xl}"
    padding: "12px 20px"
  status-panel:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.2xl}"
    padding: "20px"
  evidence-frame:
    backgroundColor: "{colors.muted}"
    rounded: "{rounded.xl}"
  tx-status:
    rounded: "{rounded.xl}"
    typography: "{typography.body-sm}"
    padding: "12px"
  action-area-content:
    backgroundColor: "{colors.background}"
    width: "640px"
---

# Design System: Két Cọc Trọ

## Overview

**Creative North Star: "Căn phòng qua từng mốc"**

Ảnh thật của cùng căn phòng nối các mốc gửi cọc, nhận phòng, trả phòng và chia tiền. Tên phòng, vị trí chụp và nhãn nguồn ảnh giúp người dùng nhận ra nơi ở của mình. Tiền, việc cần làm, hạn và hệ quả nằm cạnh một vùng hành động duy nhất. Khi chưa có ảnh, khung "Chưa có ảnh" cùng tên phòng và việc tiếp theo vẫn tạo thành một màn dùng được.

Nền trắng, chữ và nút mực tím than, vùng phụ tím rất nhạt. Be Vietnam Pro mang mọi chữ đọc, nút và số; JetBrains Mono chỉ cho địa chỉ ví và mã giao dịch. Bề mặt phẳng, không đổ bóng; nhóm tách bằng nền phụ, viền 1px hoặc ring mảnh. Chế độ vận hành: mật độ vừa phải, điều hướng bằng nút quay lại và lối "Hợp đồng của tôi"; cá tính đến từ ảnh và các mốc có căn cứ. Chuyển động chỉ phản hồi thao tác hoặc trạng thái.

**Trạng thái tài liệu — task UI 21, ngày 18/11/2026:** tài liệu mô tả bản build đã giao sau các task UI 02–20, đọc từ `web/app/globals.css`, `web/app/layout.tsx`, `web/components/` và `web/lib/client/`. Bằng chứng nghiệm thu đặt ở [.planning/ui-task-21/](.planning/ui-task-21/). Nghiệm thu UI dùng dữ liệu giả, Firefox headless và trang xem thử `/dev/*`; kiểm tra TypeScript, lint, build production và 26 test hành vi frontend đã qua. Ma trận kết quả, lỗi tích hợp Privy và các bước còn chờ có trong [bàn giao task 21](.planning/ui-task-21/README.md); **chưa nghiệm thu** trên điện thoại thật (camera, bàn phím, safe-area), Privy đăng nhập thật, ký ví thật, giao dịch Fuji và faucet thật, ảnh phòng/kho ảnh thật và trình đọc màn hình. Nghiệp vụ theo ba spec trong `docs/` và `docs/user-flow.md`; tài liệu này không thay các spec đó.

**Key Characteristics:**
- Ảnh nhận/trả ghép theo `positionId`, nhãn "Lúc nhận phòng" / "Lúc trả phòng", ảnh `contain` trong khung 4:3 và link "Xem ảnh gốc".
- Ba khung trang: rộng 1200px, đọc 768px, form 640px; từ 1024px nội dung trái, cột tóm tắt/hành động 320px bên phải.
- Dưới 1024px vùng hành động là thanh đáy cố định; từ 1024px nó trở về luồng nội dung.
- Tím than cho hành động và bước hiện tại; xanh, hổ phách, đỏ chỉ báo trạng thái và luôn đi cùng chữ.
- Mốc hoàn tất, tiền đã trả và kết luận chỉ hiện khi có dữ liệu xác nhận; tiền trước payout luôn ghi "dự kiến".

## Colors

Một màu nhận diện tím than trên nền trắng, ba màu trạng thái có tiết chế. Frontmatter là nguồn token; giá trị trùng biến trong `web/app/globals.css`. Component dùng class token (`bg-primary`, `text-success`…), không viết mã màu trực tiếp. `themeColor` trong `web/app/layout.tsx` trùng `primary`. Biến chart/sidebar có sẵn chỉ trỏ lại palette này; app không có biểu đồ hay sidebar. Chỉ có giao diện sáng.

### Primary
- **Mực tím than** (`primary`): nút chính, tiêu đề màn (h1 tô `text-primary`), link thao tác, icon mốc hiện tại. Hover chuyển sang **tím than sâu** (`primary-hover`), nền vẫn đặc.
- **Tím viền focus** (`ring`): outline focus toàn cục 2px, cách phần tử 3px, độc lập với màu thành công.

### Secondary
- **Tím sương** (`secondary`): nền bảng "Việc cần làm", hộp hướng dẫn, nút phụ, hover của nút quay lại.
- **Tím phấn** (`accent`): hover của nút outline/phụ, wallet chip và vùng chọn chữ (`::selection`).

### Tertiary
- **Xanh rêu** (`success`): giao dịch xong, mốc đã hoàn tất, kết quả đã xác nhận; không dùng làm màu thương hiệu.
- **Hổ phách** (`warning`): chờ phản hồi, sai mạng, đã trả phòng. Chữ trên nền hổ phách luôn dùng `warning-foreground` nâu đậm.
- **Xanh tín hiệu** (`info`): đang chờ ký/xác nhận và trạng thái OPEN.
- **Đỏ son** (`destructive`): lỗi, kháng nghị, phân xử, đã quá hạn.

### Neutral
- **Trắng** (`background`, `card`, `popover`) và **mực đen tím** (`foreground`): nền và chữ chính.
- **Sương nhạt** (`muted`) / **xám tím** (`muted-foreground`): skeleton, khung ảnh trống, chú thích, placeholder.
- **Viền nhạt** (`border`): đường chia thụ động. **Viền điều khiển** (`input`): viền ô nhập và nút outline, đậm hơn để nhận ra chỗ thao tác được.

**The Tone Table Rule.** Ánh xạ state → nhãn/tone nằm trong `web/lib/client/deal-status.ts` (`DEAL_STATUS`, `TONE_CLASS`). Tint: info/primary/danger/success 10%, warning 15%, muted dùng `muted`; chữ cùng tone (`text-success`, `text-info`…), riêng warning dùng `warning-foreground`. Không đặt foreground trắng trên tint, không suy quyền từ màu.

**The Earned State Rule.** Xanh chỉ đi với kết quả đã xác nhận; tím đánh dấu bước hiện tại; bước chưa tới dùng muted kèm chữ "Chưa tới". Không màu nào đứng một mình để diễn đạt trạng thái.

## Typography

**Body / Heading:** Be Vietnam Pro (fallback system-ui, sans-serif), nạp qua `next/font` với subset `latin` + `vietnamese`, weight 400–800, `display: swap`.
**Mono:** JetBrains Mono (ui-monospace, monospace), subset `latin` + `vietnamese`; chỉ cho địa chỉ ví, hash, mã giao dịch.

**Character:** một họ chữ không chân dựng cho tiếng Việt, đậm 800 ở tiêu đề và số tiền; mono xuất hiện như dấu hiệu "đây là dữ liệu kiểm chứng được".

### Hierarchy
- **Display** (`display`, 800, 30px, `tabular-nums`): số tiền chính (biên nhận, ô tiền nổi bật). Đồng hồ đếm ngược dùng 24px/800, nhỏ hơn số tiền.
- **Headline** (`headline`, 800 hoặc 700, 24px, tracking chặt): h1 của mọi màn. Tên phòng/tiêu đề hợp đồng, báo cáo, phân xử lên `headline-lg` 30px từ 640px, giới hạn 36ch, `text-balance`. Màn chào duy nhất dùng 32px → 40px.
- **Title** (`title-lg` 20px/800 cho tiêu đề bảng "Việc cần làm" và màn lỗi/trống; `title` 18px/700 cho h2 nhóm như "Các mốc của căn phòng").
- **Body** (`body`, 400, 16px, line-height 1.6): nội dung, ô nhập, nút (nút 600). Đoạn giải thích dùng `max-w-prose`.
- **Body-sm** (14px): chú thích, giờ hạn, nội dung TxStatus, nhãn ảnh (600).
- **Label** (`label`, 600, 12px): badge trạng thái, bước "Bước 1/2", chú thích minh họa; luôn cho xuống dòng.

**The Ledger Number Rule.** Tiền và thời gian dùng `tabular-nums`; VND đứng trước, số token (mUSDC) là dòng phụ. Đổi bằng `vndPerToken` qua hàm định dạng sẵn có; UI không đổi cách tính hay kiểu dữ liệu tiền.

**The Vietnamese Subset Rule.** Mọi font đều nạp subset `vietnamese`. Chuỗi kiểm tra: "Két Cọc Trọ — Đặng Thị Mỹ Duyên — Ảnh nhận phòng — Kháng nghị — 6.000.000 ₫ — 17/11/2026"; dấu không bị cắt ở đậm 800, trong nút và ở zoom 200%.

## Layout

Khung dùng `.page-shell`: `width: 100%`, `box-sizing: border-box`, max-width **đã gồm lề**, lề ngang 16px → 24px từ 640px → 32px từ 1024px (cộng safe-area). Ba cỡ: rộng 1200px (mặc định), đọc 768px (`data-page-shell="read"`), form 640px (`"form"`). Breakpoint: `sm` 640px, `md` 768px, `lg` 1024px.

| Màn | Khung | <1024px | ≥1024px |
| --- | --- | --- | --- |
| `/`, `/rooms`, `/deals`, `/jury` | rộng | Một cột; phòng 2 cột từ 640px | Phòng 3 cột (gap 24/32px); hợp đồng thành dòng `minmax(0,1fr) 160px 280px 20px` |
| `/rooms/[id]`, `/deals/[id]`, report, mismatch, jury vote | rộng + `.page-columns` | Tên/việc/hạn trước, ảnh và nội dung dài sau | `minmax(0,1fr) 20rem`, gap 32px; tiền/hạn/hành động bên phải |
| `/listings/new` | rộng, form trong 640px | Một form 640px | `minmax(0,40rem) 20rem`, gap 32px |
| Biên nhận, lỗi, không tìm thấy, chi tiết lỗi tải | đọc 768px | Một cột | Một cột |

Cặp ảnh nhận/trả xếp 2 cột từ 480px khi còn đọc được. Mọi con của lưới có `min-width: 0`; khung dùng `overflow-wrap: break-word`, địa chỉ/hash `break-all`. Nhịp: trong nhóm 8–12px, giữa nhóm 24–32px.

**The One Action Area Rule.** Mỗi màn có đúng một `ActionArea`. Dưới 1024px: thanh đáy cố định, nền trắng đặc, viền trên 1px, nội dung tối đa 640px, padding dưới `max(1rem, safe-area)`, cao tối đa `min(45dvh, 100dvh − 1rem)` và cuộn bên trong; spacer chừa đúng chiều cao đo được + 16px. Khi bàn phím mở hoặc màn cao ≤520px, thanh trở về luồng trang. Từ 1024px thanh nằm trong luồng, tối đa 640px. Nút trong vùng này tối thiểu 56px (outline 48px). Không nhân đôi form/ID/live region theo viewport.

Điều hướng: không có thanh nav chung. Trang con mở bằng `PageHeader` (nút quay lại 44px có `aria-label`, tiêu đề ngắn, chỗ phụ bên phải tối đa 40%). Trang chủ có thương hiệu, nút đăng xuất và lối "Hợp đồng của tôi"; banner sai mạng dính trên cùng.

## Elevation & Depth

Hệ phẳng: không `box-shadow` nào trên thẻ phòng, bảng tiền, ảnh, biên nhận, wallet chip hay nút. Chiều sâu đến từ nền phụ (`secondary`, `muted`), ring 1px `foreground/10` quanh bảng tiền và dialog, viền `border`. Overlay dialog/drawer dùng lớp đen 10%. Thanh đáy tách nội dung bằng nền trắng đặc và viền trên, không bằng bóng.

**The Flat Evidence Rule.** Không ánh sáng chạy viền, shimmer, confetti hay số nhảy để diễn đạt sự an toàn của tiền. Spinner chỉ quay khi có tác vụ thật và luôn đi kèm chữ.

Chuyển tiếp màu/viền 150ms (`transition-colors duration-150`); dialog mở/đóng fade + zoom 95% trong 100ms. Nội dung hiện ngay, không stagger. Quy tắc toàn cục `prefers-reduced-motion: reduce` đặt animation/transition 0.01ms, 1 lượt, tắt cuộn mượt; một phần spinner có thêm `motion-reduce:animate-none`, phần còn lại dựa vào quy tắc toàn cục này.

## Shapes

Bo góc lấy từ `--radius` 14px: nút, ô nhập, nút icon dùng `lg`; ảnh, khung ảnh, TxStatus, dialog dùng `xl`; bảng tiền, bảng "Việc cần làm", thẻ hợp đồng, hộp thông tin dùng `2xl`. Badge, wallet chip, nút quay lại và vòng icon mốc (32px) là hình tròn/pill. Đường nối mốc là vạch dọc 1px màu `border`.

Ảnh bìa phòng và ảnh bằng chứng đều nằm trong khung 4:3 với `object-fit: contain`, nền `muted`, không crop/filter. Chỉ thumbnail ảnh bìa trong "Hợp đồng của tôi" dùng `cover`. Ảnh thiếu hoặc lỗi hiện icon và chữ "Chưa có ảnh" / "Không tải được ảnh", kèm nút "Tải lại ảnh" ≥44px.

## Components

### Buttons
- **Shape:** bo vừa (14px), chữ 16px/600, cho xuống dòng, căn giữa.
- **Default:** nền tím than, chữ trắng, cao tối thiểu 48px, padding 8px 16px; `lg` 56px, padding 12px 24px. Trong `ActionArea` mọi nút ≥56px, outline ≥48px.
- **Hover / Focus:** hover `primary-hover`; focus là outline `ring` 2px cách 3px; disabled mờ 50% và không bấm được; nút đang gửi giữ tên tác vụ kèm spinner.
- **Secondary / Outline / Ghost / Destructive:** phụ nền `secondary`, hover `accent`; outline viền `input` nền trắng; ghost chỉ đổi nền khi hover; destructive nền đỏ 10%, chữ đỏ, hover 20%. Nút icon 44×44px.

### Chips
- **Badge trạng thái:** pill, cao tối thiểu 24px, padding 4px 10px, chữ 12px/600, nền tint + chữ theo Tone Table; nhãn tiếng Việt từ `DEAL_STATUS`, xuống dòng khi dài.
- **Wallet chip:** pill phẳng viền `border`, nền trắng, cao 44px, mono 14px, icon ví xám; bấm để sao chép, hover `accent`, có `aria-label` "Sao chép địa chỉ ví …" và thông báo "Đã sao chép".

### Cards / Containers
- **Bảng tiền (`Rows`):** `dl` bo 2xl, ring 1px, các dòng chia bằng viền; nhãn trái `muted-foreground`, giá trị phải `tabular-nums`, padding 12px 20px, giá trị xuống hàng khi hẹp.
- **Bảng "Việc cần làm":** nền `secondary`, bo 2xl, padding 20px; tiêu đề 20px/800, đếm ngược 24px/800, giờ hạn tuyệt đối "(giờ Việt Nam)" và hệ quả. Quá hạn: nền đỏ 5% + ring đỏ, đồng hồ đổi thành chữ "Đã quá hạn" và giải thích vì sao nút biến mất. Khi đến lượt vai đang xem, badge "Đến lượt bạn" đứng sau tiêu đề; không có nhãn nhỏ phía trên tiêu đề.
- **Hộp thông tin (`InfoBox`):** bo 2xl, padding 16px, tone neutral/warning/danger/success bằng tint + ring.
- **Màn trống/lỗi:** khối `muted` bo 2xl, tiêu đề 20px/700, chữ phụ 14px.

### Inputs / Fields
- **Style:** cao tối thiểu 48px, chữ 16px, viền `input`, nền trắng, bo 14px, padding 8px 12px; label luôn hiện.
- **Focus:** viền đổi `ring` + outline toàn cục; caret tím than; `scroll-margin` 16px để không bị thanh đáy che.
- **Error / Disabled:** `aria-invalid` cho viền đỏ + vòng đỏ 20%, lỗi bằng chữ qua `aria-describedby`; disabled nền `muted`. Lỗi ký không xóa nội dung đã nhập.

### Navigation
- **PageHeader:** nút quay lại tròn 44px chữ tím than, hover `secondary`, tên truy cập rõ; tiêu đề 16px/600 tím than, cho xuống dòng.
- Link thao tác (Snowtrace, Sao chép mã, Xem ảnh gốc): 14px/600 tím than gạch chân, vùng chạm ≥44px, báo "(mở tab mới)" cho trình đọc màn hình.

### Mốc của căn phòng và cặp ảnh
Danh sách có thứ tự Gửi cọc → Nhận phòng → Đang ở → Trả phòng → Chia tiền; mỗi mốc là vòng icon 32px + nhãn + chữ trạng thái "Đã hoàn tất / Đang chờ / Chưa tới / Không diễn ra", mốc hiện tại mang `aria-current="step"`. `EvidencePhoto` là `figure` có `figcaption` nguồn, khung 4:3 `contain`, link ảnh gốc; mốc thiếu ảnh ghi lý do. Kết luận `UNCLEAR` hiển thị "Ảnh chưa đủ rõ để kết luận". Minh họa: đúng hai hình vector nét tím than ("nhận phòng", "bàn giao"), chỉ ở màn chào và danh sách trống, luôn có chú thích "Minh họa, không phải ảnh phòng thật".

### Trạng thái giao dịch và quá hạn
`TxStatus` là khối bo xl, padding 12px, chữ 14px: chờ (info, "Bước 1/2 · Chờ bạn ký", "Bước 2/2 · Đã gửi…"), xong (success), lỗi (destructive, `role="alert"`); hash, link Snowtrace và nút sao chép hiện ở mọi pha có hash. Hạn chót có ba giai đoạn: còn hạn ("Hết hạn thì: …"), đã quá hạn nhưng contract chưa cho xử lý (chờ, nút tự hiện), sẵn sàng (nút "Xử lý quá hạn" mở drawer giải thích trước khi ký). Nút hành động chỉ hiện khi contract cho phép.

## Do's and Don'ts

### Do:
- **Do** dùng token tím than/nền trắng qua class token và chọn đúng khung trang (rộng/đọc/form).
- **Do** đặt tiền, việc cần làm, hạn và hệ quả cạnh một `ActionArea` duy nhất; nút trong đó ≥56px.
- **Do** giữ nhãn nguồn ảnh, vị trí chụp, `contain` và link "Xem ảnh gốc".
- **Do** ghi "dự kiến" cho mọi số tiền trước khi có event `Paid`; chỉ tô xanh khi đã xác nhận.
- **Do** cho mọi chữ xuống dòng (`min-width: 0`, `overflow-wrap`) thay vì cắt hoặc ẩn tràn.

### Don't:
- **Don't** đổ bóng, chạy viền, shimmer, confetti hay số nhảy; bề mặt luôn phẳng.
- **Don't** dùng ảnh mẫu/minh họa thay ảnh phòng hoặc bằng chứng, hay quá hai minh họa.
- **Don't** tô hoàn tất mốc chưa xảy ra hoặc để màu đứng một mình thay chữ trạng thái.
- **Don't** đặt nhãn nhỏ (eyebrow) phía trên tiêu đề; thông tin phụ như vai, số hợp đồng hay "Đến lượt bạn" đi sau tiêu đề hoặc trong hàng badge.
- **Don't** ép mọi màn vào cột hẹp hoặc kéo form/đoạn văn rộng theo desktop.
- **Don't** đổi nghiệp vụ, tên API/JSON/enum hay thêm thư viện trong đợt chỉnh giao diện.
