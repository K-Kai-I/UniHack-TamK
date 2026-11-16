# Báo cáo nâng cấp phần AI — 16/11/2026

Phạm vi theo xác nhận của người dùng: chỉ phần AI; backend/API do leader nối.
Gốc dự án: `L:\HACKATHON\UniHack-TamK`.

## File code/tài liệu đã sửa hoặc thêm

| Đường dẫn trong dự án | Thay đổi và lý do |
| --- | --- |
| `web/lib/ai/providers.ts` | Phân loại lỗi HTTP; thử lại lỗi mạng/timeout, HTTP 408/429/500/502/503/504 và JSON lỗi, tối đa hai request. Chờ 1 giây hoặc Retry-After; không thử sớm khi Retry-After vượt 10 giây. HTTP 400/401/403 dừng ngay. Thông báo 503 là lỗi dịch vụ, không đánh đồng hết credit. Không lộ body/header của provider. |
| `web/lib/ai/ai.test.ts` | Tăng từ 14 lên 23 test: phục hồi/giới hạn thử lại 503, không thử lại lỗi cấu hình, Retry-After, lỗi mạng/JSON, gộp listing, lý do rỗng, chấm eval, tách lỗi dịch vụ và chống công thức trong CSV. |
| `web/lib/ai/eval/run.ts` | Chạy damage hoặc listing, nhiều model theo `--models`; kiểm tra schema, file ảnh, định dạng, dung lượng, phạm vi đường dẫn và đủ nhãn trước khi gọi API. `--dry-run` không gọi API. Ghi kết quả sau từng ca; lỗi một ca vẫn chạy tiếp. |
| `web/lib/ai/eval/evaluation.ts` | File mới: schema ca kiểm thử, chấm nhãn và trường dữ liệu, thống kê ca lỗi/hợp lệ, độ khớp, trung vị thời gian, ma trận nhầm nhãn, xuất CSV. |
| `web/lib/ai/eval/listing.cases.example.json` | File mẫu mới cho ba nhãn MATCH/MISMATCH/UNCLEAR; chưa có ảnh thật đi kèm. |
| `web/lib/ai/eval/.gitignore` | Bỏ qua bộ ảnh tham khảo, nhãn local và kết quả chạy; tránh vô tình commit ảnh hoặc báo cáo chứa nội dung riêng tư. |
| `web/lib/ai/README.md` | Cập nhật model cấu hình mẫu, lệnh eval, đọc báo cáo, cách xử lý lỗi và giới hạn của dữ liệu tham khảo. |
| `web/lib/ai/UPGRADE-REPORT.md` | Báo cáo thay đổi và kết quả kiểm tra này. |

## Dữ liệu local đã thêm

- `web/lib/ai/eval/reference/cases.json`: 10 ca damage, đủ 4 nhãn; tất cả được ghi `labelStatus=provisional`.
- `web/lib/ai/eval/reference/images/`: 20 ảnh từ gói đã gửi trước đây; không ghi đè hai ảnh ghế gốc trong `eval/images/`.
- `web/lib/ai/eval/reference/README.md` và `nhan-va-nguon.csv`: nguồn và giới hạn bộ ảnh; lệnh chạy chính xác xem README chính của module.
- `web/lib/ai/eval/results/2026-11-16T08-01-13.099Z-12316/results.json`: kết quả chi tiết và thống kê.
- `web/lib/ai/eval/results/2026-11-16T08-01-13.099Z-12316/results.csv`: bảng theo từng ca, mở bằng Excel/Sheets.

Các file dữ liệu/kết quả trên được Git bỏ qua. Chúng chưa được push.

## Kiểm tra đã thực hiện

| Kiểm tra | Kết quả |
| --- | --- |
| `npm.cmd run ai:test` | 23/23 test qua; phản hồi provider giả lập, không dùng để đo độ chính xác ảnh |
| `node.exe node_modules/typescript/bin/tsc --noEmit --incremental false` | Qua |
| ESLint bốn file TypeScript thay đổi/thêm | Qua |
| `git diff --check` | Qua; Git có thông báo chuẩn hóa LF/CRLF |
| Eval dry-run trên bộ reference | 10 ca và 20 ảnh hợp lệ, không gọi API |
| Eval thật `gemini-3.1-flash-lite`, prompt `damage-v1` | 10/10 phản hồi hợp lệ; khớp nhãn và mã bảng giá 10/10; không lỗi dịch vụ; trung vị 7.602 ms |

Kết quả phân theo nhãn: NEW_DAMAGE 4/4, WEAR 2/2, NO_CHANGE 2/2, UNCLEAR 2/2.
Số lượng và outsidePriceList chỉ được chấm khi khai báo đáp án tương ứng; bộ này chưa khai báo chúng.

**Giới hạn:** 0/10 nhãn được đánh dấu reviewed. Các cặp MVTec ghép hai mẫu khác nhau;
ảnh hao mòn là nguồn tham khảo, không phải cùng vật được nhóm chụp trước/sau.
10/10 ở đây chỉ là khớp nhãn dự kiến trên bộ tham khảo, không chứng minh 100% chính xác
và không chứng minh model hiện tại tốt nhất. Lượt này không chạy lại hai model còn lại.

## Phần còn cần người thật hoặc leader hoàn thiện

1. Nhóm chụp 10 cặp phòng trọ thật và gắn đáp án độc lập, đủ bốn nhãn; sau xác nhận mới đặt `labelStatus=reviewed`.
2. Chuẩn bị bộ listing thật đủ ba nhãn; bộ chạy và test logic đã hỗ trợ, chưa có kết quả listing thật.
3. Quy tắc gộp listing giữ nguyên: MISMATCH rõ ưu tiên, tiếp theo UNCLEAR, chỉ tất cả MATCH mới MATCH.
   TODO(spec) vẫn giữ vì nhóm chưa chốt; không tuyên bố quy tắc này đã được duyệt.
4. Leader nối API, xác thực, kho ảnh/database, đối chiếu hash, tính tiền bigint, lưu báo cáo và ký con dấu;
   frontend nhận trạng thái xử lý và hiển thị báo cáo. Không sửa backend trong lượt này theo yêu cầu người dùng.
5. Khi leader nối OpenAI, bắt lỗi riêng để mất credit/lỗi giải thích không hủy báo cáo Gemini.
   Phần diễn giải chưa được đánh giá bằng API thật trong lượt này.

Không đổi prompt, schema API chung, contract, khóa hoặc `.env.local`.
`web/.env.example` đã có thay đổi trước lượt sửa này và được giữ nguyên.

## Lệnh chạy lại

```powershell
cd "L:\HACKATHON\UniHack-TamK\web"
npm.cmd run ai:test
npm.cmd run ai:eval -- --cases reference/cases.json --allow-provisional --dry-run
npm.cmd run ai:eval -- --cases reference/cases.json --allow-provisional
```

Lệnh cuối gọi API thật và sử dụng hạn mức. Kết quả mỗi lần chạy ở thư mục mới trong `eval/results/`.
