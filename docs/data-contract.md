# Hợp đồng dữ liệu – Két Cọc Trọ

Tiền và trạng thái nằm trên chuỗi; ảnh, điều khoản và báo cáo AI nằm ngoài chuỗi và được khóa bằng 4 hash trên chuỗi. Tài liệu này định nghĩa chính xác từng file JSON và cách tính hash, để ba người viết code riêng vẫn khớp nhau. Bản chốt tối 12/11.

## Cái gì nằm ở đâu

| Dữ liệu | Nằm ở | Khóa bằng | Ai tạo |
| --- | --- | --- | --- |
| Tiền cọc, phí giữ chỗ, ngày, trạng thái, hạn chót, phiếu | Contract | — | Giao dịch của người dùng |
| File điều khoản (phòng, ảnh đăng tin, vị trí chụp, bảng giá) | Database | `termsHash` trên chuỗi | API, từ dữ liệu chủ trọ nhập |
| File ảnh | Kho ảnh | SHA-256 từng ảnh, nằm trong manifest | Camera trong app |
| Manifest bộ ảnh nhận phòng, trả phòng | Database | `checkInHash`, `checkOutHash` trên chuỗi | API |
| Báo cáo AI | Database | `aiReportHash` trên chuỗi + chữ ký | Module AI + API |

## Quy tắc hash

1. Ảnh: `sha256` của đúng các byte file đã lưu. Đổi 1 pixel thì hash đổi hoàn toàn.
2. File JSON (điều khoản, manifest, báo cáo): chuẩn hóa theo RFC 8785 (JCS: khóa xếp theo thứ tự, không khoảng trắng, UTF-8), rồi `keccak256` trên chuỗi byte đó. Trong TypeScript: gói `canonicalize` rồi `keccak256(toBytes(text))` của `viem`.
3. Chỉ API tính hash. Frontend và module AI không tự tính, để chỉ có một bản cài đặt.
4. File đã có hash trên chuỗi thì không sửa nữa. Muốn đổi thì tạo file mới và hash mới.
5. Ai cũng kiểm tra lại được: tải file JSON, chuẩn hóa, hash, so với giá trị trên Snowtrace.

## File điều khoản `kct.terms/1`

API dựng file này trong `POST /listings`; `termsHash` là hash của nó.

```
{
  "schema": "kct.terms/1",
  "createdAt": "2026-11-14T03:00:00Z",
  "landlord": "0xabc...",
  "room": {
    "title": "Phòng 20m2 gần ĐH Bách Khoa",
    "address": "...",
    "rentVnd": 3000000,
    "amenities": ["máy lạnh", "tủ lạnh"]
  },
  "listingPhotos": [ { "photoId": "ph_01...", "sha256": "0x..." } ],
  "money": {
    "token": "0x<MockUSDC>",
    "decimals": 6,
    "depositAmount": "240000000",
    "reserveFeeAmount": "20000000",
    "vndPerToken": 25000
  },
  "dates": { "moveInDate": "2026-11-20T02:00:00Z", "leaseEnd": "2027-05-20T02:00:00Z" },
  "positions": [
    { "id": "p1", "name": "Tường đầu giường", "instruction": "Đứng ở cửa, chụp ngang",
      "examplePhoto": { "photoId": "ph_03...", "sha256": "0x..." } }
  ],
  "priceList": [
    { "id": "i1", "item": "Sơn lại 1 mảng tường", "unit": "mảng", "priceAmount": "16000000" }
  ],
  "yieldEnabled": false
}
```

Ràng buộc: 3 đến 10 vị trí; id vị trí `p1`, `p2`… và id bảng giá `i1`, `i2`… do API đánh số; `reserveFeeAmount <= depositAmount`; `moveInDate < leaseEnd`. Theo tỉ giá mẫu 25.000, cọc 240 mUSDC hiển thị là 6.000.000đ.

## Manifest bộ ảnh `kct.photoset/1`

Một lần chụp (nhận phòng, trả phòng, báo phòng sai) gom thành 1 manifest và 1 hash. `checkInHash`, `checkOutHash`, `evidenceHash` đều là hash của manifest tương ứng.

```
{
  "schema": "kct.photoset/1",
  "dealId": 12,
  "kind": "checkin",
  "takenBy": "0xdef...",
  "createdAt": "2026-11-20T02:15:00Z",
  "items": [
    { "positionId": "p1", "sha256": "0x9f2c...", "capturedAt": "2026-11-20T02:12:31Z",
      "lat": 10.7721, "lng": 106.6579, "accuracyM": 12 }
  ]
}
```

Ràng buộc: `kind` là `checkin`, `checkout` hoặc `mismatch`; `items` xếp theo `positionId` và có đúng một ảnh cho mỗi vị trí trong điều khoản; `lat`, `lng`, `accuracyM` là `null` khi không lấy được GPS. Tọa độ chỉ nằm ngoài chuỗi.

## Báo cáo hư hỏng `kct.report.damage/1`

Module AI trả phần `positions` không có tiền; API điền `amount`, tính tổng, hash và ký. `aiAmount` trong con dấu bằng `sealedAmount`.

```
{
  "schema": "kct.report.damage/1",
  "dealId": 12,
  "checkInHash": "0x...",
  "checkOutHash": "0x...",
  "model": "<tên mô hình>",
  "promptVersion": "damage-v3",
  "createdAt": "2027-05-20T03:00:00Z",
  "positions": [
    { "positionId": "p1", "verdict": "NEW_DAMAGE", "confidence": 0.86,
      "description": "Vết bẩn lớn màu nâu ở góc phải, không có trong ảnh nhận phòng",
      "priceItemId": "i1", "quantity": 1, "outsidePriceList": false, "amount": "16000000" },
    { "positionId": "p2", "verdict": "WEAR", "confidence": 0.74,
      "description": "Sơn cửa bạc màu đều", "priceItemId": null, "quantity": 0,
      "outsidePriceList": false, "amount": "0" }
  ],
  "totalAmount": "16000000",
  "sealedAmount": "16000000"
}
```

| Trường | Ai điền | Quy tắc |
| --- | --- | --- |
| `verdict` | AI | `NEW_DAMAGE` (hư hỏng mới), `WEAR` (hao mòn tự nhiên), `NO_CHANGE`, `UNCLEAR` (ảnh mờ, tối, sai góc, hoặc không chắc) |
| `confidence` | AI | 0 đến 1. Dưới 0,6 thì API đổi `verdict` thành `UNCLEAR` |
| `description` | AI | 1 câu tiếng Việt, nói thứ nhìn thấy được trong ảnh |
| `priceItemId`, `quantity` | AI | Chỉ khi `NEW_DAMAGE` và khớp một dòng bảng giá; `quantity` là số nguyên từ 1 |
| `outsidePriceList` | AI | `true` khi có hư hỏng mới nhưng không dòng bảng giá nào khớp; khi đó `priceItemId` là `null` |
| `amount` | API | Đơn giá × `quantity`; `0` cho mọi trường hợp khác, kể cả `outsidePriceList` |
| `totalAmount` | API | Tổng `amount` |
| `sealedAmount` | API | `min(totalAmount, depositAmount)` |

Hư hỏng ngoài bảng giá hiện trên màn hình với nhãn "ngoài bảng giá, chủ trọ tự định giá"; nó không nằm trong mức AI ký.

## Báo cáo phòng sai mô tả `kct.report.mismatch/1`

```
{
  "schema": "kct.report.mismatch/1",
  "dealId": 12,
  "termsHash": "0x...",
  "evidenceHash": "0x...",
  "model": "<tên mô hình>",
  "promptVersion": "listing-v1",
  "createdAt": "2026-11-20T02:20:00Z",
  "verdict": "MISMATCH",
  "confidence": 0.91,
  "reasons": ["Ảnh đăng tin có cửa sổ lớn, phòng thực tế không có cửa sổ"]
}
```

`verdict` đổi sang số khi ký: `MATCH` = 0, `UNCLEAR` = 1, `MISMATCH` = 2. Chỉ kết luận `MISMATCH` khi khác về cấu trúc phòng (phòng khác hẳn, thiếu hạng mục lớn, có người đang ở); khác về ánh sáng hay đồ đạc nhỏ thì `MATCH`. Ngưỡng cụ thể do bạn làm AI chốt sau khi đo trên bộ ảnh thử.

## Bảng database

Database chỉ lưu nội dung ngoài chuỗi và bản ghi tra cứu nhanh. Không có cột trạng thái hợp đồng; trạng thái đọc từ contract.

| Bảng | Cột chính |
| --- | --- |
| `listings` | `id`, `landlord`, `terms` (jsonb), `terms_hash`, `deal_id` (null tới khi lên chuỗi), `tx_hash`, `request_id` (có khi sinh ra từ yêu cầu thuê), `created_at` |
| `rooms` | `id`, `landlord`, `template` (jsonb: `kct.terms/1` thiếu `createdAt`, `dates`), `active`, `created_at` |
| `rental_requests` | `id`, `room_id`, `tenant`, `move_in`, `lease_end`, `note`, `status` (`PENDING` / `APPROVED` / `REJECTED` / `CANCELLED`), `listing_id`, `created_at`, `decided_at` |
| `photos` | `id`, `owner`, `sha256`, `storage_path`, `purpose`, `position_id`, `captured_at`, `lat`, `lng`, `accuracy_m`, `created_at` |
| `photo_sets` | `id`, `deal_id`, `kind`, `manifest` (jsonb), `set_hash`, `photo_ids` (jsonb, theo positionId), `created_by`, `created_at` |
| `ai_reports` | `id`, `deal_id`, `type` (`damage` / `mismatch`), `input_hash`, `status`, `report` (jsonb), `report_hash`, `sealed_amount`, `verdict`, `signature`, `error`, `explanation` (jsonb, ngoài phần đã ký), `created_at`, `updated_at` |
| `faucet_claims` | `wallet`, `claimed_at` |
| `chain_events` | `tx_hash`, `log_index`, `block_number`, `deal_id`, `event`, `at` (cho mục history) |
| `sync_state` | `key` (`events:<địa chỉ escrow>`), `value` (khối cuối đã đọc) |

Schema đầy đủ: `web/db/schema.sql`, server tự chạy lúc khởi động. Mọi bảng bật RLS: chỉ server (qua `DATABASE_URL`) đọc ghi.

## deployments.json

Frontend, API và keeper đều đọc địa chỉ từ file này trong `shared/`. Khải cập nhật sau mỗi lần deploy và tăng `abiVersion`.

```
{
  "chainId": 43113,
  "abiVersion": 2,
  "deployedAt": "2026-11-14T15:00:00Z",
  "deployBlock": 0,
  "contracts": { "DepositEscrow": "0x...", "MockUSDC": "0x...", "MockVault": null },
  "aiSigner": "0x...",
  "feeRecipient": "0x..."
}
```

## Biến môi trường

Khóa nào cũng chỉ nằm trong `.env` trên máy và trong cài đặt của Vercel, không nằm trong repo. Biến có tiền tố `NEXT_PUBLIC_` là biến trình duyệt đọc được, nên không bao giờ đặt khóa bí mật vào đó.

| Biến | Dùng ở | Ghi chú |
| --- | --- | --- |
| `DEPLOYER_PRIVATE_KEY` | `contracts/` | Ví deploy, cũng là owner thêm bồi thẩm |
| `FUJI_RPC_URL` | `contracts/`, API | RPC của Fuji C-Chain |
| `AI_SIGNER_PRIVATE_KEY` | API | Ví ký con dấu; địa chỉ của nó là `aiSigner` trong constructor |
| `KEEPER_PRIVATE_KEY` | API | Ví gọi `poke` và gửi AVAX faucet |
| `KEEPER_SECRET` | API | Giá trị header `x-keeper-secret` |
| `AI_MODEL`, `AI_API_KEY` | API | Mô hình so ảnh (`gemini-3.5-flash-lite`; `mock` để chạy không cần AI) và khóa Google AI Studio |
| `OPENAI_MODEL`, `OPENAI_API_KEY` | API | Không bắt buộc: lời giải thích tiếng Việt, chỉ tham khảo, không nằm trong báo cáo đã ký |
| `DATABASE_URL`, `SUPABASE_URL`, `STORAGE_KEY` | API | Database và kho ảnh (bucket `photos`, private). Bỏ trống `DATABASE_URL` thì dùng PGlite (`PGLITE_DIR`) |
| `PRIVY_APP_SECRET` | API | Kiểm tra access token |
| `VND_PER_TOKEN`, `FEE_BPS` | API | Tỉ giá hiển thị, phí sàn (trả qua `GET /config`) |
| `FAUCET_AVAX` | API | AVAX faucet gửi cho ví gần hết gas |
| `LOGS_CHUNK`, `EXPLORER_API_URL` | API | Đọc sự kiện cho lịch sử: số khối mỗi lần gọi RPC, API Routescan để đuổi kịp lịch sử cũ |
| `AUTH_DEV_BYPASS` | API | Chỉ máy local: nhận header `x-dev-wallet`. Vercel luôn bỏ qua |
| `NEXT_PUBLIC_PRIVY_APP_ID` | Frontend | Công khai được |
| `NEXT_PUBLIC_SPONSOR_GAS` | Frontend | `1` = Privy trả gas hộ cho ví Google |
| `NEXT_PUBLIC_MOCK_API` | Frontend | `0` = gọi API thật |

## Kiểm tra chéo trước G1

- [ ] Hash `shared/samples/terms.json` bằng code API ra đúng giá trị ghi trong file mẫu
- [ ] Chữ ký do API tạo cho một báo cáo mẫu được test Foundry chấp nhận (cùng domain, cùng kiểu dữ liệu)
- [ ] Đổi 1 ký tự trong báo cáo thì `proposeDeduction` revert `BadSignature`
- [ ] `sealedAmount` không bao giờ vượt tiền cọc
