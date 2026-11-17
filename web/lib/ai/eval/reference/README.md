# 11 cặp ảnh thực tế do người dùng chụp

22 ảnh gốc trong images; T = trước, S = sau (theo quy ước tên file). Không đổi tên, chỉnh sửa hoặc thay bằng ảnh AI.

cases.json và labels.csv lưu đáp án sơ bộ do trợ lý xem ảnh trước khi chạy model. Hiện cặp 03 đã được người chụp xác nhận mất khay, labelStatus=reviewed; 10 cặp còn lại vẫn provisional. Không chỉnh nhãn để khớp model. Chưa xác định được ca WEAR đáng tin cậy; không gán ép nhãn để đủ nhóm. Cặp 03 là mất khay ngoài bảng giá mẫu. Cặp 02/07/10 cần phân biệt che khuất, chất bẩn lau được và mất đồ với hư hỏng bề mặt. Vết cũ không thay đổi không tự trở thành WEAR; vùng bị che trước không chứng minh hư hỏng mới.

Chạy từ web:
```powershell
node --conditions=react-server --import tsx lib/ai/eval/benchmark.ts --model gemini-3.1-flash-lite --dry-run
node --conditions=react-server --import tsx lib/ai/eval/benchmark.ts --model gemini-3.1-flash-lite --run manual-01
```

benchmark.ts cho phép bộ thực tế chưa đủ nhãn và ghi rõ hạn chế. run.ts vẫn kiểm tra đủ bốn nhãn cho bộ đánh giá chuẩn. Mỗi model dùng cùng ảnh gốc, prompt damage-v1, bảng giá mẫu và ngưỡng confidence 0.6. Nhãn/đáp án không gửi cho model. Chạy lại bộ này chỉ kiểm tra ổn định, không phải tập kiểm thử độc lập. Không so tỷ lệ này với kết quả bộ proxy cũ.

## Cập nhật xác nhận ngày 17/11/2026

Đã đồng bộ mô tả người dùng sửa trong labels.csv sang cases.json. Cặp 03 được người chụp xác nhận mất khay dưới: NEW_DAMAGE, ngoài bảng giá, mã giá null, quantity 0; labelStatus=reviewed. Các cặp còn lại vẫn provisional. Cặp 02 xác nhận vết nứt bị băng dính che; 07 chỉ cần lau; 08 là hai bức tường khác nhau; 10 mất tranh. Chưa tự đổi nhãn 07/10 vì cần phân biệt mục tiêu đánh giá hư hỏng bề mặt với mất đồ. Giữ UNCLEAR ở hai ca này trong lúc chờ chốt tiêu chí.

Chỉ thay mô tả, nguồn và trạng thái xác nhận; không thay trường đáp án chấm điểm. Vì vậy điểm khớp các lượt đã chạy không đổi, không cần gọi lại API. Kết quả và cases.snapshot.json trong từng thư mục results được giữ nguyên: chúng phản ánh bộ nhãn ở thời điểm chạy, khi toàn bộ nhãn còn provisional. Hiện tại có 1/11 ca reviewed; chưa có ca WEAR xác nhận.
