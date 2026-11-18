# Bộ test v2: 13 cặp ảnh thật, nhãn do người chụp xác nhận (19/11/2026)

Thay cho bộ `reference/` (nhãn phần lớn do AI gán sơ bộ). Ảnh `NN-truoc.jpg` là lúc nhận phòng, `NN-sau.jpg` là lúc trả phòng.

Phân bố nhãn: 7 NEW_DAMAGE, 3 UNCLEAR, 3 NO_CHANGE, 0 WEAR (chưa có ca hao mòn: giới hạn đã biết).

Quy định chụp áp dụng khi gán nhãn: chủ trọ yêu cầu bật hết đèn, mở nước, không che đồ khi chụp. Ảnh sau cho thấy đèn tắt,
nước không chảy hoặc bị che thì tính là `NEW_DAMAGE` (ca 02, 10, 11). Prompt damage-v1 chưa biết quy định này, nên model
trả `UNCLEAR` ở 3 ca đó là hợp lý với prompt hiện tại; xem cột ghi chú khi đọc kết quả.

Chạy (từ thư mục `web`):

```bash
node --conditions=react-server --import tsx lib/ai/eval/benchmark.ts --set reference-v2 --model gemini-3.1-flash-lite --run v2-01 --delay 5000
```
