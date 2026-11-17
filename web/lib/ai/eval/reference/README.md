# 11 cặp ảnh thực tế do người dùng chụp

22 ảnh gốc trong images; T = trước, S = sau (theo quy ước tên file). Không đổi tên, chỉnh sửa hoặc thay bằng ảnh AI.

cases.json và labels.csv lưu đáp án sơ bộ do trợ lý xem ảnh trước khi chạy model. Người chụp đã xác nhận cặp 03 và 07 (labelStatus=reviewed). Chín cặp còn lại có nhãn sơ bộ. Không chỉnh nhãn để khớp model. Chưa xác định được ca WEAR đáng tin cậy; không gán ép nhãn để đủ nhóm. Cặp 03 là mất khay ngoài bảng giá mẫu. Cặp 07 là vụn bẩn lau được. Cặp 02 và 10 cần phân biệt vùng bị che khuất và mất đồ với hư hỏng bề mặt. Vết cũ không thay đổi không tự trở thành WEAR; vùng bị che trước không chứng minh hư hỏng mới.

Chạy từ web:
```powershell
node --conditions=react-server --import tsx lib/ai/eval/benchmark.ts --model gemini-3.1-flash-lite --dry-run
node --conditions=react-server --import tsx lib/ai/eval/benchmark.ts --model gemini-3.1-flash-lite --run manual-01
```

benchmark.ts cho phép bộ thực tế chưa đủ nhãn và ghi rõ hạn chế. run.ts vẫn kiểm tra đủ bốn nhãn cho bộ đánh giá chuẩn. Mỗi model dùng cùng ảnh gốc, prompt damage-v1, bảng giá mẫu và ngưỡng confidence 0.6. Nhãn/đáp án không gửi cho model. Chạy lại bộ này chỉ kiểm tra ổn định, không phải tập kiểm thử độc lập. Không so tỷ lệ này với kết quả bộ proxy cũ.

## Cập nhật xác nhận ngày 17/11/2026

Người chụp xác nhận cặp 03 là NEW_DAMAGE ngoài bảng giá và cặp 07 là NO_CHANGE. Ảnh sau của cặp 07 có vụn bẩn lau được và không thấy hư hỏng mới trên mặt bàn. Bộ nhãn hiện tại có 2/11 ca reviewed và 9 ca provisional, gồm 3 NEW_DAMAGE, 3 NO_CHANGE và 5 UNCLEAR. Các điểm và bảng kết quả lịch sử dùng snapshot nhãn sơ bộ tại thời điểm chạy.

Cặp 02 có băng dính che vết nứt, cặp 08 là hai bức tường khác nhau và cặp 10 mất tranh. Chưa có ca WEAR xác nhận.
