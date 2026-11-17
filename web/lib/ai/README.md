# Module AI — hướng dẫn hiện hành

Bộ đang dùng: **11 cặp ảnh thực tế / 22 ảnh gốc**, trong `eval/reference/images`. Báo cáo hiện hành: [images recognition report.md](images%20recognition%20report.md). Xem ảnh và nhãn ở [gallery](eval/reference/gallery.html).

## Phạm vi

`compareDamage` so ảnh trước/sau; `compareListing` kiểm tra phòng so với mô tả. Giữ nguyên chữ ký API. Production vẫn dùng Gemini qua `AI_MODEL`; OpenAI trong `lib/llm/explain.ts` chỉ diễn giải báo cáo chữ. Riêng benchmark mới gửi ảnh cho cả Gemini và OpenAI để so sánh. Module không tính tiền, không nối database/kho ảnh, không ký hay gọi blockchain; backend do leader nối.

## Cấu hình

Chạy tại thư mục `web`, dùng Node >=20.12 và dependencies của dự án. Khóa nằm trong `.env.local`, không commit hay gửi qua chat:

```dotenv
AI_MODEL=gemini-3.1-flash-lite
AI_API_KEY=<khóa Gemini>
OPENAI_MODEL=gpt-6-luna
OPENAI_API_KEY=<khóa OpenAI>
```

Đây là cấu hình đang dùng trước benchmark. Ứng viên dẫn đầu và kết quả xác nhận nằm trong báo cáo; việc thử model không tự thay cấu hình production. Không sửa khóa hoặc cấu hình backend trong lượt này. API có thể sử dụng credit/hạn mức.

## Chạy bộ 11 cặp thật

```powershell
Set-Location 'L:\HACKATHON\UniHack-TamK\web'
# Kiểm tra file, không gọi API
node --conditions=react-server --import tsx lib/ai/eval/benchmark.ts --model gemini-3.1-flash-lite --dry-run
# Model Gemini bất kỳ được tài khoản hỗ trợ; dùng tên run mới mỗi lượt
node --conditions=react-server --import tsx lib/ai/eval/benchmark.ts --model gemini-4-hydrogen --run manual-01
# Model OpenAI, cần khóa/hạn mức OpenAI
node --conditions=react-server --import tsx lib/ai/eval/benchmark.ts --model gpt-6-luna --run manual-02
```

Kết quả ở `eval/results/<run>-<model>/`: JSON gốc đã parse/kiểm tra, CSV và snapshot đáp án. Không ghi đè một run đã có. Các trường `summary.errors` cũ bao gồm ca SKIPPED; báo cáo tổng hợp tách số lỗi thực và số ca bỏ qua. Không đọc SKIPPED thành đã gọi API. `--legacy` thử Gemini qua generateContent, chỉ dùng để kiểm tra tương thích; production vẫn dùng Interactions.

Nhãn trong `reference/cases.json` được ghi trước inference và ban đầu đều có `labelStatus=provisional`. Sau lượt chạy, người chụp xác nhận đáp án cặp 03 và 07. Hiện có 2/11 ca reviewed và 9 ca provisional. Kết quả lịch sử vẫn giữ snapshot nhãn trước xác nhận. Chưa có ca WEAR đủ rõ; cần người chụp xác nhận nhãn, bổ sung hao mòn và thêm bộ ảnh độc lập trước khi đánh giá thực tế. Không đổi đáp án theo dự đoán để nâng điểm. Các ảnh T/S giữ nguyên tên và byte gốc.

`run.ts` / `npm run ai:eval` vẫn dành cho bộ chuẩn: ít nhất 10 ca damage đủ bốn nhãn hoặc listing đủ ba nhãn. Bộ 11 ảnh hiện tại chưa đạt đủ bốn nhãn nên dùng `benchmark.ts` và đọc giới hạn trong báo cáo. Không nới kiểm tra của bộ chuẩn để giả vờ dữ liệu đã đầy đủ.

## Thử một cặp và kiểm tra code

```powershell
npm.cmd run ai:demo -- "lib/ai/eval/reference/images/ảnh1T.jpg" "lib/ai/eval/reference/images/ảnh1S.jpg" "Ghế xanh" --no-explain
npm.cmd run ai:test
npx.cmd tsc --noEmit --incremental false
npx.cmd eslint lib/ai/eval/benchmark.ts
```

Thêm `--listing` để thử phòng sai mô tả; bỏ `--no-explain` để gọi thêm OpenAI diễn giải. `demo-price-list.json` chỉ là bảng giá demo; benchmark dùng bảng giá mẫu trong `shared/samples/terms.json`. Không có dòng phù hợp thì hư hỏng mới phải trả `outsidePriceList=true`, mã null và số lượng 0.

## Quy tắc và lỗi

- Bốn nhãn damage: NEW_DAMAGE, WEAR, NO_CHANGE, UNCLEAR. `confidence` là tự đánh giá, không phải xác suất đã kiểm chứng; dưới 0.6 chuyển UNCLEAR.
- Chỉ NEW_DAMAGE được chọn mục/đơn vị bảng giá. Mọi kết luận khác xóa mục khấu trừ; số tiền để backend tính.
- HTTP 401/403: khóa/quyền; 404: model/endpoint; 429: tốc độ hoặc hạn mức; 503: lỗi/quá tải dịch vụ. Không gộp tất cả thành hết credit.
- Tối đa 2 lần gọi mỗi ca; timeout 90 giây mỗi request, tôn trọng Retry-After trong ngân sách. Không ghi response lỗi thô hoặc khóa vào log.
- Ảnh JPEG/PNG <=5 MB, cùng vị trí/góc tương đương. Không coi vùng trước bị che là bằng chứng chắc có hư hỏng mới.
- Unit test giả lập chỉ kiểm tra logic; không phải độ chính xác nhận diện.

## Phần còn lại

Chưa đánh giá `compareListing` bằng ảnh thật trong lượt này; hai JSON mẫu vẫn cần thiết. Quy tắc gộp listing còn TODO(spec) chờ nhóm chốt. 11 ảnh nhỏ, nhãn sơ bộ và lỗi dịch vụ không đủ chứng minh model tốt nhất thị trường. Tài liệu 3 cặp cũ trong `docs/model ai report` là kết quả lịch sử; không áp dụng số liệu đó lên bộ mới.
