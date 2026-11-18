# Bộ test v2: 13 cặp ảnh thật, nhãn do người chụp xác nhận (19/11/2026)

Thay cho bộ `reference/` (nhãn phần lớn do AI gán sơ bộ). Ảnh `NN-truoc.jpg` là lúc nhận phòng, `NN-sau.jpg` là lúc trả phòng.

Phân bố nhãn: 7 NEW_DAMAGE, 3 UNCLEAR, 3 NO_CHANGE, 0 WEAR (chưa có ca hao mòn: giới hạn đã biết).

Quy định chụp áp dụng khi gán nhãn: chủ trọ yêu cầu bật hết đèn, mở nước, không che đồ khi chụp. Ảnh sau cho thấy đèn tắt,
nước không chảy hoặc bị che thì tính là `NEW_DAMAGE` (ca 02, 10, 11). Prompt damage-v1 chưa biết quy định này (lượt v2-01 trả NO_CHANGE ở ca 10, 11).
Từ damage-v2, prompt so trạng thái hoạt động khi tên vị trí ghi yêu cầu bật đèn hoặc mở nước.

`price-list.json` là bảng giá của bộ test, giống bảng giá chủ trọ nhập khi đăng phòng: ca 01, 05, 08, 10, 11 có hạng mục;
ca 02 (cửa) và 09 (mất tranh) là ngoài bảng giá. Lượt v2-01 chạy với bảng giá mẫu 3 dòng nên cột khớp hạng mục không so trực tiếp được.

Chạy (từ thư mục `web`):

```bash
node --conditions=react-server --import tsx lib/ai/eval/benchmark.ts --set reference-v2 --model gemini-3.5-flash-lite --run v2-02 --delay 5000
```
