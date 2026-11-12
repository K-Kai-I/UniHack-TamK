# Hợp đồng API – Két Cọc Trọ

Backend làm 4 việc: lưu ảnh và điều khoản ngoài chuỗi, tính hash, gọi AI rồi ký con dấu, và chạy bot keeper. Backend không giữ tiền và không quyết định trạng thái; trạng thái luôn đọc từ contract. Khải sở hữu toàn bộ API; bạn làm AI chỉ viết 2 hàm ở mục "Module AI". Bản chốt tối 12/11.

## Lựa chọn kỹ thuật đề xuất

| Phần | Đề xuất | Lý do |
| --- | --- | --- |
| Nơi chạy API | Route Handlers của Next.js, thư mục `web/app/api/v1/`, cùng project Vercel với frontend | Một lần deploy, không lo CORS, Frontend và Backend chung kiểu TypeScript |
| Database và kho ảnh | Một dịch vụ Postgres có kèm lưu file (ví dụ Supabase) | Không tự dựng server; có gói miễn phí |
| Đọc và ghi chuỗi | `viem` | Cùng thư viện với frontend (wagmi dùng viem), ký EIP-712 có sẵn |
| Bot keeper | Endpoint `POST /keeper/tick`, được một dịch vụ cron bên ngoài gọi mỗi phút | Cần kiểm tra gói Vercel đang dùng có cho cron mỗi phút không; không thì dùng cron ngoài hoặc chạy script trên máy khi demo |
| AI | Mô hình đọc ảnh có đầu ra JSON theo schema; chọn theo kết quả trên 10 cặp ảnh | Bạn làm AI quyết định sau khi đo |

Bốn lựa chọn đầu là đề xuất, nhóm chốt trong buổi họp. Giới hạn thời gian chạy một hàm trên Vercel cần kiểm tra trước ngày 15/11, vì AI so nhiều ảnh có thể mất hơn 30 giây; hai endpoint AI vì thế được thiết kế kiểu gửi việc rồi hỏi lại.

## Quy ước chung

- Đường dẫn gốc: `/api/v1`. Dữ liệu JSON, trừ `POST /uploads` dùng `multipart/form-data`.
- Xác thực: header `Authorization: Bearer <access token của Privy>`. Server kiểm tra token bằng SDK của Privy và lấy ra địa chỉ ví; không tin địa chỉ ví do client tự gửi.
- Số tiền: chuỗi số nguyên theo đơn vị nhỏ nhất của token (6 số lẻ). `"230000000"` là 230 mUSDC. Không dùng số thực.
- Thời gian: ISO 8601 theo UTC trong JSON; giây Unix khi đưa lên chuỗi.
- Hash: chuỗi hex 32 byte có `0x` ở đầu. Địa chỉ ví: chữ thường.
- Lỗi: mã HTTP + `{"error":{"code":"...","message":"..."}}`.

## Danh sách endpoint

| Endpoint | Ai gọi | Việc | Mức | Ngày xong |
| --- | --- | --- | --- | --- |
| `GET /config` | Mọi người | Địa chỉ contract, chain ID, tỉ giá VND, phí, 8 hạn chót | P0 | 13/11 |
| `POST /faucet` | Đã đăng nhập | Gửi AVAX thử và mUSDC cho ví của người gọi | P0 | 13/11 |
| `POST /uploads` | Đã đăng nhập | Nhận 1 ảnh, lưu, tính SHA-256 | P0 | 14/11 |
| `POST /listings` | Chủ trọ | Nhận điều khoản, dựng file điều khoản chuẩn, trả `termsHash` | P0 | 14/11 |
| `POST /listings/:listingId/onchain` | Chủ trọ | Gắn `dealId` sau khi `createDeal` thành công | P0 | 14/11 |
| `GET /listings?state=OPEN` | Mọi người | Danh sách "Phòng đang trống" | P0 | 14/11 |
| `GET /deals/:dealId` | Mọi người | Điều khoản + trạng thái trên chuỗi + bộ ảnh + báo cáo AI | P0 | 15/11 |
| `GET /deals?wallet=0x...` | Đã đăng nhập | Các hợp đồng của một ví | P0 | 15/11 |
| `POST /deals/:dealId/photo-sets` | Người thuê (chủ trọ khi trả thay) | Gom ảnh thành bộ, trả `setHash` để ký lên chuỗi | P0 | 15/11 |
| `POST /deals/:dealId/ai/damage` | Một trong 2 bên | Chạy AI so trước và sau, ký con dấu | P0 | 15/11 |
| `GET /deals/:dealId/ai/damage` | Mọi người | Hỏi kết quả AI | P0 | 15/11 |
| `POST /deals/:dealId/ai/mismatch` | Người thuê | Chạy AI so ảnh đăng tin với thực tế, ký con dấu | P1 | 17/11 |
| `GET /disputes?juror=0x...` | Bồi thẩm | Các vụ đang chờ phiếu | P1 | 17/11 |
| `GET /disputes/:dealId` | Bồi thẩm | Bằng chứng của một vụ: chỉ các vị trí bị tranh chấp | P1 | 17/11 |
| `POST /keeper/tick` | Cron (header bí mật) | Gọi `poke` cho mọi deal có `canPoke == true` | P1 | 17/11 |
| `POST /ai/quality-check` | Đã đăng nhập | Kiểm tra ảnh mờ, tối, sai góc lúc chụp | P2 | 18/11 |

Nguyên tắc thứ tự giữa API và chuỗi: frontend gọi API để lấy hash trước, rồi mới ký giao dịch mang hash đó lên contract. Server không bao giờ gửi giao dịch thay người dùng, trừ `poke` và faucet.

## Ba luồng gọi chính

Mỗi luồng đều theo một kiểu: API trả hash, người dùng ký hash lên chuỗi, server đối chiếu lại với chuỗi.

1. Đăng phòng: `POST /uploads` cho từng ảnh → `POST /listings` (nhận `termsHash`) → ví ký `createDeal(..., termsHash)` → `POST /listings/:id/onchain`.
2. Ảnh nhận hoặc trả phòng: `POST /uploads` cho từng vị trí → `POST /deals/:id/photo-sets` (nhận `setHash`) → ví ký `submitCheckIn(id, setHash)` hoặc `submitCheckOut(id, setHash)`.
3. Báo cáo AI và đề xuất: sau khi `submitCheckOut` đã xác nhận, `POST /deals/:id/ai/damage` → hỏi `GET /deals/:id/ai/damage` tới khi `status` là `done` → chủ trọ ký `proposeDeduction(id, amount, aiAmount, reportHash, signature)`.

## Request và response

### GET /config

```
{
  "chainId": 43113,
  "contracts": { "escrow": "0x...", "token": "0x...", "vault": null },
  "aiSigner": "0x...",
  "tokenDecimals": 6,
  "vndPerToken": 25000,
  "feeBps": 1000,
  "timeouts": { "moveInGrace": 180, "checkInObjection": 120, "mismatchWindow": 120,
                "abandonWindow": 120, "checkOutGrace": 120, "proposeWindow": 180,
                "respondWindow": 180, "juryWindow": 300 },
  "explorerTxUrl": "https://testnet.snowtrace.io/tx/"
}
```

`vndPerToken` là tỉ giá hiển thị cố định do nhóm tự đặt, không phải tỉ giá thị trường.

### POST /faucet

Không cần body; ví lấy từ token. Mỗi ví một lần mỗi 24 giờ.

```
{ "avaxTxHash": "0x...", "tokenTxHash": "0x...", "avax": "0.05", "token": "1000000000" }
```

### POST /uploads

Form: `file` (JPEG hoặc PNG, tối đa 5 MB), `purpose` (`listing` | `example` | `checkin` | `checkout` | `mismatch`), `positionId` (tùy loại), `capturedAt`, `lat`, `lng`, `accuracyM` (có thì gửi).

```
{ "photoId": "ph_01HX...", "url": "https://.../ph_01HX.jpg", "sha256": "0x9f2c...", "bytes": 412345 }
```

### POST /listings

```
{
  "room": { "title": "Phòng 20m2 gần ĐH Bách Khoa", "address": "...", "rentVnd": 3000000,
            "amenities": ["máy lạnh", "tủ lạnh"] },
  "listingPhotoIds": ["ph_01...", "ph_02..."],
  "money": { "depositAmount": "240000000", "reserveFeeAmount": "20000000" },
  "dates": { "moveInDate": "2026-11-20T02:00:00Z", "leaseEnd": "2027-05-20T02:00:00Z" },
  "positions": [ { "name": "Tường đầu giường", "instruction": "Đứng ở cửa, chụp ngang", "examplePhotoId": "ph_03..." } ],
  "priceList": [ { "item": "Sơn lại 1 mảng tường", "unit": "mảng", "priceAmount": "16000000" } ],
  "yieldEnabled": false
}
```

Trả về `201`:

```
{
  "listingId": "ls_01HX...",
  "termsHash": "0x4be1...",
  "terms": { "schema": "kct.terms/1", "...": "file điều khoản chuẩn, xem Hợp đồng dữ liệu" },
  "createDealArgs": { "deposit": "240000000", "reserveFee": "20000000", "moveInDate": 1795140000,
                      "leaseEnd": 1810778400, "yieldEnabled": false, "termsHash": "0x4be1..." }
}
```

Frontend dùng nguyên `createDealArgs` để gọi contract, không tự đổi ngày sang giây.

### POST /listings/:listingId/onchain

```
{ "dealId": 12, "txHash": "0x..." }
```

Server đọc `getDeal(12)` và chỉ nhận khi `termsHash` và `landlord` khớp. Trả `200 { "ok": true }`, sai thì `409 CHAIN_MISMATCH`.

### GET /listings?state=OPEN

```
{ "items": [ { "listingId": "ls_01...", "dealId": 12, "title": "...", "address": "...", "rentVnd": 3000000,
               "depositAmount": "240000000", "reserveFeeAmount": "20000000",
               "moveInDate": "2026-11-20T02:00:00Z", "coverUrl": "https://...", "landlord": "0x..." } ] }
```

### GET /deals/:dealId

```
{
  "dealId": 12,
  "onchain": { "state": "PROPOSED", "stateIndex": 4, "landlord": "0x...", "tenant": "0x...",
               "deposit": "240000000", "reserveFee": "20000000", "deadline": "2026-11-18T09:03:00Z",
               "canPoke": false, "proposedAmount": "16000000", "aiAmount": "16000000",
               "counterAmount": "0", "hasAiSeal": true, "disputeKind": "NONE",
               "votesLandlord": 0, "votesTenant": 0, "yieldOn": false, "yieldGross": "0" },
  "terms": { "schema": "kct.terms/1" },
  "photoSets": { "checkin": { "setHash": "0x...", "items": [ { "positionId": "p1", "url": "https://..." } ] },
                 "checkout": null, "mismatch": null },
  "reports": { "damage": null, "mismatch": null },
  "history": [ { "event": "Deposited", "txHash": "0x...", "at": "2026-11-17T08:00:00Z" } ]
}
```

Phần `onchain` được đọc từ contract ở mỗi lần gọi, không lấy từ database. `history` là P1; chưa kịp thì trả mảng rỗng.

### POST /deals/:dealId/photo-sets

```
{ "kind": "checkin", "items": [ { "positionId": "p1", "photoId": "ph_11..." }, { "positionId": "p2", "photoId": "ph_12..." } ] }
```

Server kiểm tra đủ mọi vị trí trong điều khoản, dựng manifest, trả `201`:

```
{ "photoSetId": "ps_01...", "setHash": "0x77aa...", "manifest": { "schema": "kct.photoset/1" } }
```

Thiếu vị trí: `422 MISSING_POSITIONS` kèm danh sách `positionId` còn thiếu.

### POST /deals/:dealId/ai/damage và GET cùng đường dẫn

POST không cần body. Server chỉ chạy khi deal ở CHECKED_OUT và `checkOutHash` trên chuỗi khớp bộ ảnh đã lưu. Gọi lại khi đã có kết quả thì trả kết quả cũ, không chạy AI lần hai. POST trả `202 { "status": "processing" }`. GET trả:

```
{
  "status": "done",
  "report": { "schema": "kct.report.damage/1", "...": "xem Hợp đồng dữ liệu" },
  "seal": { "dealId": 12, "checkInHash": "0x...", "checkOutHash": "0x...",
            "aiAmount": "16000000", "reportHash": "0x...", "signature": "0x...", "signer": "0x..." }
}
```

`status` là `processing`, `done` hoặc `failed`. Khi `failed`, chủ trọ vẫn đề xuất được với chữ ký rỗng.

### POST /deals/:dealId/ai/mismatch

```
{ "photoSetId": "ps_09..." }
```

Trả về cùng dạng `status` / `report` / `seal`; `seal` gồm `dealId`, `termsHash`, `evidenceHash`, `verdict` (0, 1, 2), `reportHash`, `signature`.

### GET /disputes/:dealId

```
{ "dealId": 12, "kind": "DEDUCTION", "deadline": "2026-11-18T09:10:00Z",
  "landlordAmount": "40000000", "tenantAmount": "16000000", "aiAmount": "16000000",
  "votes": { "landlord": 0, "tenant": 1 },
  "evidence": [ { "positionId": "p1", "name": "Tường đầu giường", "beforeUrl": "https://...", "afterUrl": "https://...",
                  "aiVerdict": "NEW_DAMAGE", "aiDescription": "..." } ],
  "priceList": [ { "id": "i1", "item": "Sơn lại 1 mảng tường", "priceAmount": "16000000" } ] }
```

Chỉ trả các vị trí AI kết luận khác "không đổi". Che mặt và đồ cá nhân là việc để sau MVP; nói rõ khi pitch.

### POST /keeper/tick

Header `x-keeper-secret`. Server duyệt các deal chưa kết thúc, gọi `canPoke`, rồi gửi `poke` bằng ví keeper.

```
{ "checked": 7, "poked": [ { "dealId": 12, "txHash": "0x..." } ], "errors": [] }
```

Ví keeper chỉ cần AVAX để trả gas. Nó không nhận được tiền từ `poke`.

## Mã lỗi

| HTTP | `code` | Khi nào |
| --- | --- | --- |
| 400 | `BAD_REQUEST` | Thiếu hoặc sai kiểu trường |
| 401 | `UNAUTHORIZED` | Thiếu hoặc sai token |
| 403 | `FORBIDDEN` | Ví không phải bên được phép của deal |
| 404 | `NOT_FOUND` | Không có tin đăng, deal, ảnh |
| 409 | `WRONG_STATE` | Deal trên chuỗi không ở trạng thái cần |
| 409 | `CHAIN_MISMATCH` | Hash hoặc địa chỉ trên chuỗi không khớp dữ liệu đã lưu |
| 413 | `FILE_TOO_LARGE` | Ảnh quá 5 MB |
| 422 | `MISSING_POSITIONS` | Bộ ảnh thiếu vị trí |
| 429 | `RATE_LIMITED` | Faucet gọi quá 1 lần mỗi 24 giờ |
| 502 | `AI_FAILED` | Mô hình AI lỗi hoặc trả JSON sai schema sau 2 lần thử |

## Module AI (phần của bạn làm AI)

Hai hàm trong `web/lib/ai/`, không đụng database, chuỗi hay chữ ký. Khải gọi chúng từ API.

```
type PositionInput = {
  positionId: string; name: string;
  beforeUrl: string;   // ảnh nhận phòng (hoặc ảnh đăng tin với compareListing)
  afterUrl: string;    // ảnh trả phòng (hoặc ảnh thực tế)
};
type PriceItem = { id: string; item: string; unit: string; priceAmount: string };

// So trước và sau. Trả phần "positions" của báo cáo hư hỏng, CHƯA có số tiền.
compareDamage(input: { positions: PositionInput[]; priceList: PriceItem[] }):
  Promise<{ model: string; promptVersion: string; positions: DamagePosition[] }>

// So ảnh đăng tin với ảnh thực tế.
compareListing(input: { positions: PositionInput[] }):
  Promise<{ model: string; promptVersion: string; verdict: "MATCH" | "UNCLEAR" | "MISMATCH";
            confidence: number; reasons: string[] }>
```

`DamagePosition` định nghĩa ở Hợp đồng dữ liệu. AI chỉ chọn kết luận, hạng mục trong bảng giá và số lượng; API tự nhân đơn giá để ra tiền.
