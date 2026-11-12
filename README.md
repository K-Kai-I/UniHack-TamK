# Két Cọc Trọ

Giữ tiền cọc thuê trọ trong smart contract trên Avalanche, có AI đối chiếu ảnh nhận phòng và trả phòng. Không ai, kể cả nhóm phát triển, rút được tiền cọc ra ngoài người thuê và chủ trọ.

Dự án dự thi Team1 Vietnam UniHack 2026.

## Vấn đề

Ở Việt Nam, tiền cọc thuê trọ thường do chủ trọ giữ. Khi trả phòng, hai bên dễ bất đồng về hư hỏng, mức trừ và thời điểm hoàn cọc. Số tiền chỉ vài triệu đồng nên hiếm ai kiện ra tòa, và pháp luật không quy định thời hạn hoàn cọc bắt buộc.

## Cách hoạt động

1. Chủ trọ đăng phòng kèm điều khoản: tiền cọc, phí giữ chỗ, ngày dọn vào và hết hạn, danh sách vị trí cần chụp, bảng giá sửa chữa. Tất cả được khóa bằng một hash trên chuỗi.
2. Người thuê gửi cọc bằng stablecoin, chỉ ký 1 lần (ERC-2612 permit). Tiền nằm trong contract.
3. Ngày dọn vào, người thuê chụp ảnh theo danh sách vị trí bằng camera trong app. Hash của bộ ảnh được ghi lên chuỗi.
4. Khi trả phòng, người thuê chụp lại đúng các vị trí đó. AI so ảnh trước và sau, tách hư hỏng mới khỏi hao mòn, tính mức trừ theo bảng giá và ký một con dấu (EIP-712).
5. Chủ trọ đề xuất mức trừ. Người thuê đồng ý hoặc im lặng tới hạn thì contract chia tiền ngay. Người thuê kháng nghị thì bồi thẩm chọn một trong hai con số; AI chỉ là một phiếu.
6. Mỗi bước có hạn chót. Bên nào im lặng tới hạn thì bên đó chịu, và ai cũng gọi được hàm xử lý quá hạn, nên tiền không bao giờ kẹt.

AI chỉ đề xuất và ký con dấu. AI không có ví và không chuyển được tiền; tiền chỉ rời két theo quy tắc trong contract.

## Vì sao dùng Avalanche

- C-Chain tương thích EVM: Solidity, OpenZeppelin, MetaMask dùng như bình thường.
- Giao dịch chốt trong khoảng 1 đến 2 giây: người thuê đứng trong phòng thấy cọc đã khóa ngay.
- Phí thấp, phù hợp khoản cọc vài triệu đồng.
- Hướng mở rộng: một L1 riêng dùng stablecoin làm phí gas, để người thuê không cần biết tới AVAX.

## Kiến trúc

| Thành phần | Công nghệ | Việc |
| --- | --- | --- |
| `contracts/` | Solidity 0.8.24, Foundry, OpenZeppelin v5 | `DepositEscrow` giữ cọc, máy trạng thái, chia tiền, bồi thẩm, kiểm tra con dấu AI. `MockUSDC` là stablecoin test |
| `web/` | Next.js, Privy, wagmi, viem | Giao diện, đăng nhập Google tạo ví, camera, API |
| `web/app/api/v1/` | Next.js Route Handlers | Lưu ảnh và điều khoản ngoài chuỗi, tính hash, gọi AI, ký con dấu, bot keeper |
| `web/lib/ai/` | Mô hình AI đọc ảnh | So ảnh, trả kết luận có cấu trúc |

Đặc tả đầy đủ trong [`docs/`](docs/): [contract](docs/contract-spec.md), [API](docs/api-contract.md), [dữ liệu](docs/data-contract.md).

## Contract đã deploy (Avalanche Fuji, chain ID 43113)

| Contract | Địa chỉ | Snowtrace |
| --- | --- | --- |
| `DepositEscrow` | _cập nhật sau khi deploy_ | _link_ |
| `MockUSDC` | _cập nhật sau khi deploy_ | _link_ |

## Chạy thử

Hướng dẫn cài đặt chi tiết cho người trong nhóm: [`DEVELOPER.md`](DEVELOPER.md).

```bash
cd web
cp .env.example .env.local
npm install
npm run dev
```

## Giới hạn đã biết

- Danh sách bồi thẩm do nhóm thêm, nên một người vẫn có thể ảnh hưởng tới kết quả tranh chấp (nhưng không lấy được tiền).
- Ảnh vẫn có thể bị dàn dựng; camera trong app, thời gian và hash trên chuỗi làm việc giả mạo khó hơn chứ không loại bỏ hẳn.
- MVP chỉ dùng token test trên Fuji. Luật chia tiền cần luật sư xem trước khi dùng tiền thật.

## Nhóm

| Vai | Thành viên |
| --- | --- |
| Contract + Backend | Lê Quang Khải |
| Frontend | _điền tên_ |
| AI | _điền tên_ |
