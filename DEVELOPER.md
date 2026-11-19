# DEVELOPER.md: hướng dẫn cho người trong nhóm

Đọc file này một lần lúc bắt đầu. AI đọc `AGENTS.md`; bạn không cần dán luật vào prompt, chỉ cần nhắc AI "đọc AGENTS.md và docs liên quan".

## Ba vai

| Vai | Ai | Làm gì | Thư mục chính |
| --- | --- | --- | --- |
| Contract + Backend | Khải | Solidity, test, deploy, API, ký con dấu AI, keeper, faucet | `contracts/`, `web/app/api/`, `web/lib/server/`, `scripts/` |
| Frontend | Nguyễn Quốc Khánh | Mọi màn hình, Privy, camera, gọi contract và API | `web/app/`, `web/components/`, `web/lib/client/` |
| AI | Lê Đăng Khoa | `compareDamage`, `compareListing`, prompt, bộ 10 cặp ảnh, slide, kịch bản video | `web/lib/ai/` |

Lịch từng ngày và cổng kiểm tra nằm trong doc "Timeline UniHack – Team" trên Drive.

## Cài đặt

Cần: Node 20 trở lên, Git, [Foundry](https://book.getfoundry.sh/getting-started/installation) (chỉ người làm contract), một tài khoản Google để đăng nhập thử (app chỉ đăng nhập bằng Google, ví do Privy tạo).

```bash
git clone https://github.com/K-Kai-I/UniHack-TamK.git
cd UniHack-TamK

# web (cả nhóm)
cd web
cp .env.example .env.local      # điền giá trị, hỏi Khải
npm install
npm run dev                      # http://localhost:3000

# contracts (Khải)
cd ../contracts
npm install                      # cài OpenZeppelin 5.1.0
npm run setup                    # cài forge-std vào contracts/lib (cần Foundry)
cp .env.example .env             # DEPLOYER_PRIVATE_KEY, AI_SIGNER_ADDRESS, FEE_RECIPIENT_ADDRESS, JUROR_ADDRESSES, USE_VAULT
forge build
forge test -vv
```

Deploy web lên Vercel: import repo, đặt **Root Directory = `web`**, giữ bật "Include files outside the root directory" (web đọc `../shared`), rồi thêm các biến trong `web/.env.example` vào Settings > Environment Variables.

Hiện trạng (19/11, MVP xong): contract đủ P0 + P1 + vault P2, 87 test qua; đã deploy lên Fuji (địa chỉ trong `shared/deployments.json` và README). Backend có 20 route trong `web/app/api/v1/` (danh sách ở `docs/api-contract.md`), chạy trên Vercel. Từ 19/11 app có danh mục phòng + yêu cầu thuê, chỉ đăng nhập Google. Giữ `wagmi` ở bản 2.x (bản 3 lỗi build với Privy).

### Biến môi trường của backend (`web/.env.local` và Vercel)

| Biến | Bí mật? | Lấy ở đâu |
| --- | --- | --- |
| `NEXT_PUBLIC_PRIVY_APP_ID` | Không | Privy dashboard |
| `PRIVY_APP_SECRET` | Có | Privy dashboard > App settings > API keys |
| `DATABASE_URL` | Có | Supabase > Connect > Transaction pooler (cổng 6543). Bỏ trống khi dev: server dùng PGlite trong máy |
| `SUPABASE_URL` | Không | `https://<project-ref>.supabase.co` |
| `STORAGE_KEY` | Có | Supabase > Project Settings > API Keys > Secret key (`sb_secret_…`). Bucket `photos` để private |
| `AI_SIGNER_PRIVATE_KEY` | Có | Ví ký AI (chỉ ký, không cần AVAX). Địa chỉ của ví này phải trùng `AI_SIGNER_ADDRESS` lúc deploy |
| `KEEPER_PRIVATE_KEY` | Có | Ví keeper (cần AVAX: gọi `poke`, phát faucet) |
| `KEEPER_SECRET` | Có | Chuỗi ngẫu nhiên; cron gửi trong header `x-keeper-secret` |
| `AI_MODEL`, `AI_API_KEY` | Có (key) | Gemini; `AI_MODEL=mock` để chạy không cần AI |
| `OPENAI_API_KEY`, `OPENAI_MODEL` | Có (key) | Không bắt buộc: có thì báo cáo có thêm lời giải thích tiếng Việt |
| `NEXT_PUBLIC_MOCK_API` | Không | `0` = frontend gọi API thật |
| `FUJI_RPC_URL` | Không | RPC Fuji; bỏ trống dùng RPC công khai (giới hạn 100 khối mỗi lần đọc sự kiện) |
| `VND_PER_TOKEN`, `FEE_BPS` | Không | Tỉ giá hiển thị và phí sàn (trả ở `GET /config`) |
| `FAUCET_AVAX` | Không | AVAX gửi cho ví mới ở faucet, mặc định `0.005` |
| `NEXT_PUBLIC_SPONSOR_GAS` | Không | `1` = Privy trả gas hộ cho ví Google (cần bật Fee sponsorship trong Privy dashboard) |
| `LOGS_CHUNK`, `EXPLORER_API_URL` | Không | Đọc sự kiện cho lịch sử: số khối mỗi lần (mặc định 100) và API Routescan để đuổi kịp lịch sử cũ |
| `PGLITE_DIR` | Không | Chỉ máy local: thư mục database PGlite khi bỏ trống `DATABASE_URL` |
| `AUTH_DEV_BYPASS` | Không | **Chỉ máy local**: `1` = nhận header `x-dev-wallet` thay token Privy. Vercel luôn bỏ qua |

Biến `NEXT_PUBLIC_` được đóng gói lúc build: sửa trên Vercel xong phải Redeploy. Không bao giờ đặt `NEXT_PUBLIC_` trước biến bí mật.

### Bot keeper chạy tự động

Bot là `POST /api/v1/keeper/tick` (header `x-keeper-secret`): gọi `poke` cho mọi deal quá hạn và đọc sự kiện mới cho mục lịch sử. Gói Hobby của Vercel không chạy cron mỗi phút, nên dùng một trong hai:

- [cron-job.org](https://cron-job.org): job mỗi 1 phút gọi URL trên, thêm header `x-keeper-secret`. Khuyên dùng khi demo.
- GitHub Actions (`.github/workflows/keeper.yml`, mỗi 5 phút, có thể trễ; bấm Actions > keeper > Run workflow để chạy ngay): thêm secret `KEEPER_SECRET` ở Settings > Secrets and variables > Actions.

Bot ngừng thì tiền không kẹt: ai cũng gọi được `poke` (nút "Xử lý quá hạn" trên app). Riêng bước hết hạn phản đối ảnh nhận phòng, trang hợp đồng tự gọi `POST /api/v1/deals/:id/confirm-checkin` để sang Đang ở ngay, không chờ cron.

## Cấu trúc repo

```
UniHack-TamK/
  README.md            giới thiệu cho giám khảo
  AGENTS.md            luật cho AI
  DEVELOPER.md         file này
  PRODUCT.md, DESIGN.md  người dùng, giọng văn, hệ thiết kế giao diện
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
  scripts/             deploy, xuất ABI, keeper chạy tay, tạo phòng mẫu (seed-demo.mjs, demo/)
```

## Quy trình làm việc

1. Mỗi người một nhánh: `contract/...`, `fe/...`, `ai/...`. Không push thẳng `main`.
2. `main` luôn chạy được. Merge mỗi tối trước 22:00 (tạo Pull Request, một người khác bấm merge).
3. Cuối ngày báo 3 dòng trong nhóm: xong gì, kẹt gì, mai làm gì.
4. Muốn đổi tên hàm, trường JSON, endpoint: báo trong nhóm → sửa file trong `docs/` → sửa `web/lib/types.ts` → mới sửa code.
5. Sau mỗi lần deploy contract, Khải cập nhật `shared/deployments.json`, `shared/abi/`, tăng `abiVersion` và báo nhóm.
6. Commit nhỏ, message tiếng Việt hoặc Anh đều được, nói rõ làm gì: `contract: thêm depositWithPermit + test`.

## Prompt cho AI thế nào

Mở repo trong Cursor, Claude Code hoặc VS Code có Copilot; công cụ sẽ tự đọc `AGENTS.md` (Claude đọc qua `CLAUDE.md`; với Copilot thì nhắc "đọc AGENTS.md" trong prompt). Mỗi lần nhờ một việc nhỏ và chỉ rõ file spec.

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
| Chạy thử deploy (miễn phí, in phí gas dự kiến) | `cd contracts && forge script script/Deploy.s.sol --rpc-url fuji` |
| Deploy Fuji | `cd contracts && npm run deploy:fuji` (deploy + verify + ghi `deployments.json`, ABI, bảng địa chỉ trong README) |
| Tạo phòng mẫu cho demo | Xem đầu file `scripts/seed-demo.mjs` |
| Tạo lãi giả trong vault | `cd web && node ../scripts/seed-demo.mjs --yield 5` |
| Gửi mồi vào vault (1 lần cho bản đã deploy trước 17/11) | `cd web && node ../scripts/seed-demo.mjs --seed-vault` |
| Test khớp chéo backend ↔ contract | `cd web && npm run be:test` |
| Test bất biến contract (xem độ phủ) | `cd contracts && forge test --match-contract InvariantTest -vv` |
| Chạy keeper tay | `cd web && KEEPER_PRIVATE_KEY=0x... node ../scripts/keeper.mjs` |
| Chấm AI | `cd web && npm run ai:eval` |

## Mạng và tiền test

- Avalanche Fuji C-Chain, chain ID `43113`, explorer `https://testnet.snowtrace.io`.
- AVAX test: faucet chính thức của Avalanche Builder Hub (link trên trang team1vn.xyz).
- mUSDC và một ít AVAX phí mạng: bấm "Nhận thêm tiền thử" ở Home (mỗi ví 1 lần mỗi 24 giờ), hoặc gọi `faucet()` trên `MockUSDC`.

## An toàn

- **Vault rỗng phải có "mồi".** Vault ERC-4626 đang rỗng mà bị chuyển tiền vào trước thì người gửi đầu tiên mất tiền (test `test_vault_emptyVaultDonation_*`). Script deploy tự gửi 1.000 mUSDC cho địa chỉ chết ngay khi tạo vault. Bản v4 (deploy 16/11) chưa có bước này: chạy `--seed-vault` một lần **trước khi** ai dùng `--yield`.
- Mỗi Pull Request tự chạy `.github/workflows/ci.yml`: test contract, kiểm tra kiểu, test khớp chéo, test AI. Đỏ thì chưa merge.

- Ví deploy, ví ký AI, ví keeper là ví riêng chỉ dùng cho test. Không dùng ví cá nhân có tiền thật.
- `.env`, `.env.local` không bao giờ commit (đã có trong `.gitignore`). Lỡ commit key thì báo ngay để đổi ví.
- Trước khi nộp: mở mọi link bằng trình duyệt ẩn danh, quét lịch sử commit tìm key.

## Nộp bài (hạn BTC 23:59 ngày 21/11, nhóm nộp 21:00 ngày 20/11)

- Repo công khai, hoặc riêng tư và thêm `tuantqse90` làm collaborator.
- README có địa chỉ contract trên Fuji và link Snowtrace.
- Slide và video 2–3 phút mở quyền xem cho ai có link.
- Bấm Submit, không chỉ lưu nháp.
