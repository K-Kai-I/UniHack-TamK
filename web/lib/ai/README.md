# Chạy thử Gemini + OpenAI

Bản thử tích hợp dịch vụ, chưa được đánh giá trên 10 cặp ảnh thật. Người dùng đã cho phép
làm bản thử trước, đánh giá sau. Không dùng kết quả thử làm quyết định chia tiền.

## Luồng và phạm vi

Ảnh trước + ảnh sau → Gemini → kiểm tra JSON và quy tắc → báo cáo gốc.
Báo cáo gốc → OpenAI → lời giải thích tiếng Việt, chỉ để tham khảo.

Gemini cũng là mô hình ngôn ngữ đa phương thức (đọc cả chữ lẫn ảnh). Chia hai dịch vụ theo
vai trò là lựa chọn của nhóm, không phải vì Gemini không viết được tiếng Việt.
Ảnh được gửi đến Google. OpenAI chỉ nhận báo cáo chữ, không nhận ảnh.

Hai hàm compareDamage/compareListing giữ chữ ký để backend gọi. Module AI không tính tiền,
không lưu database, không ký, không gọi blockchain. OpenAI không sửa báo cáo Gemini.
Lời giải thích vẫn có thể sai; giao diện cần hiển thị báo cáo gốc và nhãn tham khảo.

Hiện repo chỉ có API /api/v1/config. Chạy demo này CHƯA đồng nghĩa toàn bộ web app đã gọi AI.
Không tạo endpoint AI công khai không xác thực để thử; demo chạy trên máy bằng terminal.

## 1. Chuẩn bị

Mở thư mục L:\HACKATHON\UniHack-TamK trong VS Code. Mở Terminal > New Terminal:

```powershell
Set-Location 'L:\HACKATHON\UniHack-TamK\web'
npm install
```

Dùng Node >=20.12 (máy hiện có Node 26). Node chạy JavaScript trên máy/server;
npm cài các thư viện đã được liệt kê trong package.json. Không cần Python, GPU hay tải trọng số.
Không thêm SDK: code dùng fetch có sẵn trong Node để gọi HTTP API.

## 2. Khóa và cấu hình

Tạo khóa Gemini tại https://aistudio.google.com/apikey và OpenAI tại
https://platform.openai.com/api-keys. Cần tài khoản có quyền dùng model và hạn mức API.
API có thể tính phí. Không gửi khóa qua chat hoặc commit lên GitHub.

Chép web/.env.example thành web/.env.local nếu chưa có file .env.local:

```powershell
if (-not (Test-Path .env.local)) { Copy-Item .env.example .env.local }
```

Mở .env.local bằng VS Code, điền bốn biến này (giá trị khóa bên dưới chỉ là hướng dẫn):

```dotenv
AI_MODEL=gemini-3.1-flash-lite
AI_API_KEY=DIEN_KHOA_GEMINI_CUA_BAN
OPENAI_MODEL=gpt-6-luna
OPENAI_API_KEY=DIEN_KHOA_OPENAI_CUA_BAN
```

AI_MODEL=mock vẫn dùng kết quả giả trong app; ai:demo cố ý không chấp nhận mock.
Model có thể thay bằng tên được tài khoản của bạn hỗ trợ. API key giống mật khẩu để chương
trình dùng dịch vụ; không đặt NEXT_PUBLIC_ trước các biến chứa khóa.

## 3. Hai ảnh

Tạo web/lib/ai/eval/images (được Git bỏ qua), chép ảnh của CÙNG vị trí:

- 01-before.jpg: lúc nhận phòng.
- 01-after.jpg: lúc trả phòng.

JPG/PNG, tối đa 5 MB mỗi ảnh. Đổi tên không đổi định dạng ảnh. Chụp rõ và gần cùng góc.
Các ảnh local chỉ phục vụ thử code. App thật vẫn phải dùng luồng camera theo quy định nhóm.

```powershell
New-Item -ItemType Directory -Force lib/ai/eval/images
npm run ai:demo -- "lib/ai/eval/images/01-before.jpg" "lib/ai/eval/images/01-after.jpg" "Tường đầu giường"
```

Chương trình in báo cáo JSON Gemini, sau đó in lời giải thích OpenAI.
Nếu OpenAI lỗi, báo cáo Gemini đã in vẫn giữ nguyên; lệnh kết thúc với mã lỗi.
Muốn thử riêng Gemini, thêm --no-explain. Muốn so ảnh đăng tin/thực tế, thêm --listing:

```powershell
npm run ai:demo -- "lib/ai/eval/images/01-before.jpg" "lib/ai/eval/images/01-after.jpg" "Tường" --no-explain
npm run ai:demo -- "lib/ai/eval/images/01-before.jpg" "lib/ai/eval/images/01-after.jpg" "Phòng" --listing
```

demo-price-list.json là bảng giá THỬ. Nếu thử đồ vật khác, sửa tên mục/đơn vị tương ứng.
priceAmount là chuỗi số nguyên đơn vị token nhỏ nhất, không phải số VND; demo không tính tiền.
Không có mục tương ứng thì Gemini có thể trả outsidePriceList=true; đây không phải lỗi.

## 4. Đọc kết quả

- NEW_DAMAGE: thấy hư hỏng mới.
- WEAR: dấu hiệu phù hợp hao mòn thông thường.
- NO_CHANGE: không thấy thay đổi rõ.
- UNCLEAR: chưa đủ căn cứ; chụp thêm.
- confidence: mức tự đánh giá, không phải độ chính xác đã được chứng minh. Dưới 0.6 chuyển UNCLEAR.
- priceItemId: mã mục bảng giá, không phải tiền.
- quantity: số đơn vị; chỉ dùng khi NEW_DAMAGE và có mục khớp.
- outsidePriceList: hư hỏng mới nằm ngoài bảng giá.
- model/promptVersion: model nào và phiên bản chỉ dẫn nào tạo báo cáo.

Ảnh không luôn chứng minh được nguyên nhân, người gây hư hỏng hay gian lận.

## 5. Kiểm tra

```powershell
npm run ai:test
npm run typecheck
npm run ai:eval
```

ai:test giả lập câu trả lời dịch vụ để kiểm tra code, không gọi mạng và không đo chất lượng ảnh.
typecheck kiểm tra kiểu TypeScript. ai:eval gọi Gemini thật, tốn hạn mức; chỉ chạy sau khi chép
cases.example.json thành cases.json, bổ sung ít nhất 10 cặp có ảnh thật và nhãn do người kiểm tra.
Nhãn là kết quả mong đợi: expectVerdict, expectPriceItemId. Không cần đổi tên ảnh giống nhãn.
Eval chấm cả damage và listing, chưa chấm chất lượng diễn giải OpenAI.

### Bộ đánh giá và báo cáo tự động

Chạy từ thư mục `web`:

```powershell
# Kiểm tra 10 cặp tham khảo đã có trên máy, không gọi API
npm.cmd run ai:eval -- --cases reference/cases.json --allow-provisional --dry-run
# Chạy model trong .env.local, ghi kết quả sau từng ca
npm.cmd run ai:eval -- --cases reference/cases.json --allow-provisional
# So sánh cùng bộ ảnh giữa các model mà tài khoản hỗ trợ
npm.cmd run ai:eval -- --cases reference/cases.json --allow-provisional --models "gemini-3.1-flash-lite,gemini-3.8-flash,gemini-4-hydrogen"
```

`reference/` là bộ proxy đã gửi trước đây: không phải 10 cặp cùng phòng trước/sau.
Nhãn của các ảnh ghép khác mẫu có thể không phù hợp với prompt nhận diện cùng vật;
model trả UNCLEAR trên chúng không tự chứng minh model kém. Chỉ dùng để thử pipeline.
Các ảnh này và kết quả chạy được Git bỏ qua, không tự đưa lên GitHub.

Bộ chính thức đặt ở `eval/cases.json`, ít nhất 10 ca damage, đủ bốn nhãn. Mỗi ca
thêm `task: "damage"`, `labelStatus: "reviewed"` sau khi người kiểm tra xác nhận.
Có thể chấm thêm `expectQuantity` và `expectOutsidePriceList`; bỏ trống thì không chấm hai trường đó.
Giữ nguồn ảnh bằng trường `source`. Không đổi nhãn theo dự đoán của model để tăng điểm.

Listing: sao chép `listing.cases.example.json` thành bộ riêng, thay đường dẫn bằng ảnh thật,
kiểm tra nhãn và chạy `--cases listing.cases.json`. Mẫu chưa kèm ảnh, không phải kết quả test.
Bộ listing cần đủ ba nhãn MATCH/MISMATCH/UNCLEAR.

Kết quả nằm ở `eval/results/<thời-gian>-<pid>/results.json` và `results.csv`.
Mỗi ca lưu model, promptVersion, nhãn mong đợi/dự đoán, khớp nhãn/khớp trường,
thời gian, lỗi và đầu ra đã kiểm tra. Ca lỗi không làm dừng các ca tiếp theo.
JSON có số ca hợp lệ, số lỗi, độ khớp nhãn trên ca hợp lệ và trên tổng yêu cầu,
ma trận nhầm nhãn và thời gian trung vị của ca thành công. Nhãn provisional được cảnh báo rõ.
Mã thoát 1 có thể là ca sai/lỗi; xem báo cáo để phân biệt, không gộp lỗi mạng thành sai nhãn.

Gemini thử tối đa hai lần tổng cộng cho lỗi mạng/timeout, JSON sai và HTTP tạm thời
408/429/500/502/503/504. Chờ một giây hoặc theo Retry-After; nếu Retry-After trên 10 giây,
trả lỗi để người gọi thử sau, không gọi sớm. HTTP 400/401/403 không thử lại.
HTTP 503 không có nghĩa hết lượt miễn phí. Không có cơ chế tự đổi model ngầm.

## 6. Nối với web app (việc backend/frontend còn cần làm)

Backend tạo endpoint theo docs/api-contract.md: xác thực Privy, đọc hợp đồng và ảnh đã lưu,
đối chiếu hash, gọi compareDamage, nhân đơn giá bằng bigint, giới hạn theo tiền cọc, lưu báo cáo,
ký con dấu. Giữ cơ chế POST gửi việc/GET lấy kết quả; nhiều cặp có thể mất nhiều thời gian.
Backend gọi explainDamage(report) riêng và bắt lỗi để lỗi OpenAI không hủy báo cáo gốc.

Frontend gọi API backend và hiển thị kết quả. Không import file AI/LLM vào component client,
không gửi API key xuống trình duyệt. Hai bên/contract xử lý tiền theo spec hiện có.

TODO(spec): nhóm cần chốt nơi lưu/trả lời giải thích phụ và quy tắc gộp nhiều cặp listing.
Bản thử gộp listing: có MISMATCH rõ → MISMATCH; nếu không, có UNCLEAR → UNCLEAR;
chỉ tất cả MATCH mới MATCH. Chưa sửa hợp đồng API/data chung.

## File và thuật ngữ

| File | Vai trò |
| --- | --- |
| lib/ai/index.ts | Hai hàm nghiệp vụ so ảnh và kiểm tra quy tắc |
| lib/ai/providers.ts | Gửi request Gemini, đọc response, timeout và thử lại JSON sai |
| lib/ai/prompts.ts | Chỉ dẫn và cấu trúc JSON yêu cầu Gemini trả |
| lib/ai/schema.ts | Zod kiểm tra kiểu dữ liệu đầu ra (giữ file gốc) |
| lib/llm/explain.ts | Gọi OpenAI diễn giải báo cáo đã kiểm tra |
| lib/ai/demo.ts | Điểm chạy thử từ terminal, nạp .env.local và ảnh |
| lib/ai/demo-price-list.json | Bảng giá riêng cho demo |
| lib/ai/ai.test.ts | Kiểm tra code bằng phản hồi giả lập |
| lib/ai/eval/run.ts | Chấm trên ảnh và nhãn thật |
| package.json | Thư viện và các lệnh npm run |
| .env.example / .env.local | Mẫu cấu hình / cấu hình bí mật trên máy |

Function/hàm là một khối code nhận input và trả output. Module là nhóm code đảm nhiệm một việc.
API là cổng giao tiếp giữa các chương trình. HTTP là cách gửi request (yêu cầu) và nhận response
(phản hồi) qua mạng. Backend gọi API của Google/OpenAI bằng fetch.
JSON là dạng dữ liệu có tên trường và giá trị. Schema là khuôn định nghĩa trường nào bắt buộc,
kiểu dữ liệu nào được phép. Zod là thư viện kiểm tra dữ liệu theo khuôn đó.
Prompt là chỉ dẫn gửi cho model. Inference là dùng model có sẵn để suy luận; đây không phải training.
LLM là mô hình ngôn ngữ lớn. Multimodal nghĩa là xử lý nhiều loại dữ liệu như chữ và ảnh.
Base64 là cách biểu diễn dữ liệu ảnh thành chuỗi ký tự để gửi API, không phải mã hóa bảo mật.
Mock là giả lập. Eval là đánh giá chất lượng với câu trả lời đúng được con người xác nhận.
server-only ngăn module chứa logic gọi dịch vụ bị dùng trong giao diện trình duyệt.
--conditions=react-server cho phép các lệnh terminal chạy module server-only khi thử độc lập.

## Lỗi thường gặp

- Thiếu AI_API_KEY/OPENAI_API_KEY: điền .env.local trong web, chạy terminal tại web.
- HTTP 401/403: kiểm tra khóa và quyền model.
- HTTP 404: kiểm tra tên model có trong tài khoản/API.
- HTTP 429: hạn mức hoặc tốc độ gọi; kiểm tra dashboard nhà cung cấp.
- HTTP 400: kiểm tra model có hỗ trợ Interactions/structured output và định dạng ảnh.
- AI_FAILED: dịch vụ không trả JSON/quan hệ dữ liệu hợp lệ sau 2 lần gọi; không dùng kết quả này chia tiền.
- Quá 90 giây: mạng/dịch vụ chậm, thử lại.
- Thiếu cases.json/ảnh: chuẩn bị bộ đánh giá trước, không lấy kết quả mock làm độ chính xác.

Tài liệu đối chiếu: https://aistudio.google.com/docs/image-understanding,
https://aistudio.google.com/docs/structured-output,
https://developers.openai.com/api/docs/guides/text.
