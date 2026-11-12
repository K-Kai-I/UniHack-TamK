# DEVELOPER.md: hướng dẫn cho người trong nhóm

Đọc file này một lần lúc bắt đầu. AI đọc `AGENTS.md`; bạn không cần dán luật vào prompt, chỉ cần nhắc AI "đọc AGENTS.md và docs liên quan".

## Ba vai

| Vai | Ai | Làm gì | Thư mục chính |
| --- | --- | --- | --- |
| Contract + Backend | Khải | Solidity, test, deploy, API, ký con dấu AI, keeper, faucet | `contracts/`, `web/app/api/`, `web/lib/server/`, `scripts/` |
| Frontend | (điền tên) | Mọi màn hình, Privy, camera, gọi contract và API | `web/app/`, `web/components/`, `web/lib/client/` |
| AI | (điền tên) | `compareDamage`, `compareListing`, prompt, bộ 10 cặp ảnh, slide, kịch bản video | `web/lib/ai/` |

Lịch từng ngày và cổng kiểm tra nằm trong doc "Timeline UniHack – Team" trên Drive.

## Cài đặt

Cần: Node 20 trở lên, Git, [Foundry](https://book.getfoundry.sh/getting-started/installation) (chỉ người làm contract), ví MetaMask hoặc Core để thử.

```bash
git clone <link repo>
cd ket-coc-tro

# web (cả nhóm)
cd web
cp .env.example .env.local      # điền giá trị, hỏi Khải
npm install
npm run dev                      # http://localhost:3000

# contracts (Khải)
cd ../contracts
npm install                      # cài OpenZeppelin 5.1.0
npm run setup                    # cài forge-std vào contracts/lib (cần Foundry)
cp .env.example .env
forge build
forge test -vv
```

Deploy web lên Vercel: import repo, đặt **Root Directory = `web`**, giữ bật "Include files outside the root directory" (web đọc `../shared`), rồi thêm các biến trong `web/.env.example` vào Settings > Environment Variables.

Hiện trạng khung (12/11): contract biên dịch sạch với solc 0.8.24; `createDeal`, `cancelDeal`, `getDeal`, `addJuror` chạy thật, các hàm còn lại revert `NotImplemented()` kèm `TODO(spec)`. Web build được, trang chủ có nút đăng nhập Privy, route `GET /api/v1/config` đã viết, module AI đang là bản giả trả `UNCLEAR`. Giữ `wagmi` ở bản 2.x (bản 3 lỗi build với Privy).

## Cấu trúc repo

```
ket-coc-tro/
  AGENTS.md            luật cho AI
  DEVELOPER.md         file này
  docs/                3 hợp đồng: contract, API, dữ liệu (nguồn sự thật)
                       + user-flow.md: luồng, màn hình, nhánh A–H
  contracts/           Foundry: src/, test/, script/
  web/                 Next.js: màn hình + API + lib/ai
    app/api/v1/        API (Khải)
    lib/types.ts       kiểu dùng chung, khớp docs/
    lib/chain.ts       mạng Fuji, địa chỉ contract, ABI
    lib/abi.ts         ABI có kiểu (tự sinh bởi npm run export-abi)
    lib/hash.ts        hash JSON chuẩn hóa (chỉ API dùng)
    lib/seal.ts        định nghĩa EIP-712 cho con dấu AI
    lib/ai/            module AI
    lib/server/        code chỉ chạy trên server
    lib/client/        hook, cấu hình wagmi/Privy
  shared/
    deployments.json   địa chỉ contract, chainId, abiVersion
    abi/               ABI xuất sau mỗi lần build contract
    samples/           JSON mẫu đúng schema
  scripts/             keeper chạy tay, script tiện ích
```

## Quy trình làm việc

1. Mỗi người một nhánh: `contract/...`, `fe/...`, `ai/...`. Không push thẳng `main`.
2. `main` luôn chạy được. Merge mỗi tối trước 22:00 (tạo Pull Request, một người khác bấm merge).
3. Cuối ngày báo 3 dòng trong nhóm: xong gì, kẹt gì, mai làm gì.
4. Muốn đổi tên hàm, trường JSON, endpoint: báo trong nhóm → sửa file trong `docs/` → sửa `web/lib/types.ts` → mới sửa code.
5. Sau mỗi lần deploy contract, Khải cập nhật `shared/deployments.json`, `shared/abi/`, tăng `abiVersion` và báo nhóm.
6. Commit nhỏ, message tiếng Việt hoặc Anh đều được, nói rõ làm gì: `contract: thêm depositWithPermit + test`.

## Prompt cho AI thế nào

Mở repo trong Cursor, Claude Code hoặc VS Code có Copilot; công cụ sẽ tự đọc `AGENTS.md` (Claude đọc qua `CLAUDE.md`, Copilot qua `.github/copilot-instructions.md`). Mỗi lần nhờ một việc nhỏ và chỉ rõ file spec.

Mẫu prompt:

```
Đọc AGENTS.md và docs/contract-spec.md (mục Hàm và Chia tiền).
Viết hàm submitCheckIn trong contracts/src/DepositEscrow.sol đúng spec
và test trong contracts/test/DepositEscrow.t.sol: người lạ gọi, sai trạng thái,
gọi 2 lần, gọi sau hạn. Giải thích ngắn từng kiểm tra.
```

```
Đọc AGENTS.md và docs/api-contract.md (mục POST /listings).
Viết route web/app/api/v1/listings/route.ts: validate bằng zod theo
types trong web/lib/types.ts, dựng file kct.terms/1, tính termsHash bằng
web/lib/hash.ts, trả createDealArgs.
```

```
Đọc AGENTS.md. Làm màn "Chi tiết phòng + Gửi cọc" trong web/app/rooms/[dealId]/page.tsx.
Dữ liệu từ GET /api/v1/deals/:dealId. Nút Gửi cọc gọi depositWithPermit,
hiện 3 trạng thái giao dịch. Mobile-first, tiếng Việt.
```

```
Đọc AGENTS.md và docs/data-contract.md (mục Báo cáo hư hỏng).
Viết compareDamage trong web/lib/ai/index.ts: gửi từng cặp ảnh cho mô hình,
bắt trả JSON đúng DamagePosition, parse bằng zod, thử lại 2 lần nếu sai.
```

Sau khi AI viết xong: tự đọc lại, chạy lệnh kiểm tra, và hỏi lại AI chỗ không hiểu. Giám khảo sẽ hỏi bạn, không hỏi AI.

## Lệnh hay dùng

| Việc | Lệnh |
| --- | --- |
| Chạy web | `cd web && npm run dev` |
| Kiểm tra kiểu | `cd web && npm run typecheck` |
| Build contract | `cd contracts && forge build` |
| Test contract | `cd contracts && forge test -vv` |
| Xuất ABI | `cd contracts && npm run export-abi` |
| Deploy Fuji | `cd contracts && forge script script/Deploy.s.sol --rpc-url fuji --broadcast --verify` |
| Chạy keeper tay | `cd web && KEEPER_PRIVATE_KEY=0x... node ../scripts/keeper.mjs` |
| Chấm AI | `cd web && npm run ai:eval` |

## Mạng và tiền test

- Avalanche Fuji C-Chain, chain ID `43113`, explorer `https://testnet.snowtrace.io`.
- AVAX test: faucet chính thức của Avalanche Builder Hub (link trên trang team1vn.xyz).
- mUSDC: gọi `faucet()` trên `MockUSDC` hoặc bấm "Nhận tiền test" trong app.

## An toàn

- Ví deploy, ví ký AI, ví keeper là ví riêng chỉ dùng cho test. Không dùng ví cá nhân có tiền thật.
- `.env`, `.env.local` không bao giờ commit (đã có trong `.gitignore`). Lỡ commit key thì báo ngay để đổi ví.
- Trước khi nộp: mở mọi link bằng trình duyệt ẩn danh, quét lịch sử commit tìm key.

## Nộp bài (hạn BTC 23:59 ngày 21/11, nhóm nộp 21:00 ngày 20/11)

- Repo công khai, hoặc riêng tư và thêm `tuantqse90` làm collaborator.
- README có địa chỉ contract trên Fuji và link Snowtrace.
- Slide và video 2–3 phút mở quyền xem cho ai có link.
- Bấm Submit, không chỉ lưu nháp.
