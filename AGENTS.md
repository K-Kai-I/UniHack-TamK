# AGENTS.md: luật cho mọi AI viết code trong repo này

File này dành cho AI (Claude, Cursor, Copilot, Codex...). Đọc hết file này trước khi viết hay sửa bất kỳ dòng code nào. Người trong nhóm đọc `DEVELOPER.md`.

## Dự án là gì

Két Cọc Trọ giữ tiền cọc thuê trọ trong smart contract trên Avalanche Fuji. Người thuê gửi cọc bằng stablecoin, chụp ảnh lúc nhận phòng và lúc trả phòng ngay trong app. AI so ảnh trước và sau, tính mức trừ theo bảng giá có sẵn trong hợp đồng, rồi ký một con dấu. Chủ trọ đề xuất mức trừ; người thuê đồng ý hoặc kháng nghị; bồi thẩm phân xử. Mọi bước có hạn chót: bên nào im lặng tới hạn thì bên đó chịu.

Cuộc thi: Team1 Vietnam UniHack (Avalanche). Khóa sản phẩm 23:59 ngày 18/11/2026.

## Nguồn sự thật (đọc trước khi code)

| Việc bạn làm | Đọc file |
| --- | --- |
| Bất kỳ thứ gì trong `contracts/` | `docs/contract-spec.md` |
| Màn hình, thứ tự bước, nhánh A–H, hàm/API nào dùng ở bước nào | `docs/user-flow.md` (tóm tắt doc User flow 12/11; lệch thì 3 file spec thắng) |
| API trong `web/app/api/` hoặc gọi API từ frontend | `docs/api-contract.md` |
| Hash, JSON lưu ngoài chuỗi, database, biến môi trường, module AI | `docs/data-contract.md` |
| Kiểu TypeScript dùng chung | `web/lib/types.ts` (đã viết theo 3 file trên) |
| Địa chỉ contract, chain ID | `shared/deployments.json` |
| Dữ liệu mẫu | `shared/samples/*.json` |

Nếu yêu cầu của người dùng mâu thuẫn với 3 file trong `docs/`, **dừng lại và hỏi**, không tự chọn. Nếu spec không nói tới chuyện đang làm, ghi `// TODO(spec): <câu hỏi>` và làm phương án đơn giản nhất, rồi báo lại trong câu trả lời.

Không tự đổi tên hàm, tên trường JSON, thứ tự enum, mã lỗi, đường dẫn API. Ba người code song song dựa trên đúng các tên này.

## Ai sở hữu thư mục nào

| Thư mục | Người sở hữu | Ghi chú |
| --- | --- | --- |
| `contracts/` | Contract + Backend (Khải) | Solidity, test, script deploy |
| `web/app/api/`, `web/lib/server/`, `web/lib/hash.ts`, `web/lib/seal.ts`, `scripts/` | Contract + Backend (Khải) | API, ký con dấu, keeper |
| `web/app/` (trừ `api/`), `web/components/`, `web/lib/client/` | Frontend | Màn hình, Privy, wagmi |
| `web/lib/ai/` | AI | Chỉ 2 hàm `compareDamage`, `compareListing` và prompt |
| `docs/`, `shared/` | Cả nhóm | Sửa phải báo cả nhóm trước |

Khi được nhờ làm việc trong thư mục của vai khác, chỉ sửa đúng chỗ được nhờ và nói rõ trong câu trả lời.

## Luật cứng (không bao giờ vi phạm)

1. **Tiền chỉ đi theo contract.** Không có hàm nào cho owner, team, server hay AI rút tiền. Token chỉ được chuyển tới `tenant`, `landlord`, `feeRecipient`, `vault`.
2. **AI không chạm tiền.** Module AI chỉ trả kết luận, hạng mục bảng giá và số lượng. Số tiền do code nhân đơn giá. AI không có ví, không gọi contract.
3. **Server không gửi giao dịch thay người dùng**, trừ `poke` (keeper) và faucet.
4. **Trạng thái đọc từ contract**, không lưu cột trạng thái hợp đồng trong database.
5. **Chỉ API tính hash** (`web/lib/hash.ts`). Frontend và module AI không tự tính hash.
6. **Thứ tự enum `State` cố định** như spec. Trạng thái mới chỉ thêm vào cuối.
7. **Không bao giờ** đưa private key, API key, `.env` vào code, commit, log hay câu trả lời. Biến `NEXT_PUBLIC_*` không được chứa bí mật.
8. **Số tiền là chuỗi số nguyên** theo đơn vị nhỏ nhất (6 số lẻ) trong JSON và `bigint` trong TypeScript. Không dùng `number` hay số thực cho tiền.
9. **Không thêm tính năng ngoài phạm vi MVP** (xem mục Phạm vi) trừ khi người dùng yêu cầu rõ.

## Luật theo từng phần

### Solidity (`contracts/`)

- Solidity `0.8.24`, OpenZeppelin v5, không proxy, không `delegatecall`, không `selfdestruct`.
- Mỗi hàm theo thứ tự: kiểm tra người gọi → kiểm tra trạng thái → kiểm tra hạn chót → đổi state → phát event → chuyển tiền cuối cùng (checks-effects-interactions).
- Hàm có chuyển tiền: `nonReentrant` và `SafeERC20`.
- Revert bằng custom error có sẵn trong spec, không dùng chuỗi `require(..., "msg")`.
- Mỗi lần đổi trạng thái phát `StateChanged` và đúng một event nghiệp vụ.
- Mọi kết thúc đi qua `_payout`. Mọi chạm vault đi qua `_toVault` / `_fromVault`.
- Viết test Foundry cùng lúc với hàm: người lạ gọi, sai trạng thái, gọi 2 lần, gọi sau hạn. Không có test thì chưa xong.
- Sau khi đổi ABI: chạy `npm run export-abi` trong `contracts/` để cập nhật `shared/abi/`, và tăng `abiVersion` trong `shared/deployments.json` khi deploy.

### API (`web/app/api/v1/`)

- Next.js Route Handlers, TypeScript strict. Validate input bằng `zod`.
- Xác thực bằng access token Privy; lấy địa chỉ ví từ token, không tin ví client gửi.
- Lỗi trả đúng dạng `{"error":{"code","message"}}` với mã trong `docs/api-contract.md`.
- Đọc chuỗi bằng `viem` qua `web/lib/server/chain.ts`. Địa chỉ lấy từ `shared/deployments.json`.
- Trước khi lưu kết quả gắn với hash trên chuỗi, đối chiếu với `getDeal` (mã `CHAIN_MISMATCH` nếu lệch).

### Frontend (`web/app/`, `web/components/`)

- App Router, React Server Components mặc định; chỉ thêm `"use client"` khi cần state, ví hoặc camera.
- Đăng nhập và ví qua Privy; gọi contract qua wagmi/viem với ABI trong `shared/abi/`.
- Nút hành động chỉ hiện khi contract ở đúng trạng thái (bảng "Nút trên app theo trạng thái" trong contract-spec).
- Mỗi giao dịch hiện 3 trạng thái: đang chờ ký/xác nhận, xong (kèm link Snowtrace), lỗi (kèm lý do dễ hiểu).
- Tiền hiển thị VND bằng `vndPerToken` từ `GET /config`; không làm tròn khi gửi lên chuỗi.
- Ảnh chỉ chụp từ camera trong app (`<input type="file" accept="image/*" capture="environment">` hoặc `getUserMedia`), không cho chọn ảnh từ thư viện.
- UI tiếng Việt, câu ngắn. Mobile-first: người dùng đứng trong phòng trọ cầm điện thoại.

### Module AI (`web/lib/ai/`)

- Chỉ export `compareDamage` và `compareListing` đúng chữ ký trong `web/lib/ai/index.ts`.
- Bắt mô hình trả JSON theo schema; parse bằng `zod`; sai schema thì thử lại tối đa 2 lần rồi ném lỗi.
- Không chắc thì trả `UNCLEAR`, không đoán. Ảnh mờ, tối, sai góc là `UNCLEAR`.
- Không tính tiền, không đọc database, không ký.
- Ghi `promptVersion` mỗi khi đổi prompt; chạy `npm run ai:eval` trên 10 cặp ảnh trước khi đổi.

## Phạm vi

- **P0 (xong tối 15/11):** đăng nhập, faucet, đăng phòng, gửi cọc, ảnh nhận/trả phòng, AI so trước-sau có con dấu, đề xuất, đồng ý, chia tiền, `poke` cho 4 hạn chót chính.
- **P1 (xong tối 17/11):** kháng nghị + bồi thẩm, phòng sai mô tả, bỏ ngang, chủ trọ trả phòng thay, bot keeper, biên nhận có link Snowtrace.
- **P2 (chỉ khi dư giờ):** MockVault + chia lãi, chủ trọ phản đối ảnh nhận phòng, kiểm tra chất lượng ảnh, lớp ảnh mờ, GPS.
- **Không làm:** thanh toán tiền thuê/điện nước, lịch xem phòng, tìm kiếm nâng cao, gia hạn hợp đồng, cọc 2 chiều, trả gas hộ, L1 riêng, tiền thật.

## Cách trả lời khi làm việc

- Làm việc nhỏ: một hàm, một màn hình, một endpoint mỗi lần.
- Trước khi sửa: nói ngắn gọn sẽ sửa file nào. Sau khi sửa: nói đã đổi gì, còn thiếu gì, và lệnh để kiểm tra.
- Giải thích ngắn phần khó (vì sao đặt kiểm tra ở đây, vì sao dùng permit...). Người trong nhóm là sinh viên mới học blockchain và phải tự giải thích được code với giám khảo.
- Không sửa file ngoài phạm vi yêu cầu, không format lại cả file, không đổi phiên bản thư viện nếu không được nhờ.
