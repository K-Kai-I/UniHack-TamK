# 10 cặp ảnh — đủ 4 nhãn kiểm thử

Bộ ảnh gồm 4 ca NEW_DAMAGE, 2 ca WEAR, 2 ca NO_CHANGE và 2 ca UNCLEAR. Mỗi ca có hai tệp riêng. Nhãn nằm trong cases.json, còn nguồn, giấy phép và cách tạo cặp nằm trong nhan-va-nguon.csv.

- NEW_DAMAGE là nhãn quy ước cho các cặp MVTec ghép mẫu nguyên vẹn với mẫu có khuyết tật. Hai ảnh không chụp cùng một vật qua hai thời điểm.
- WEAR đối chiếu chi tiết mới và đã mòn từ ảnh công khai có chú thích. Các tệp được tách bằng cách cắt vùng ảnh và lưu JPEG, theo giấy phép ghi ở CSV.
- NO_CHANGE gồm cặp ghế thật của dự án có nhãn dự kiến cần nhóm xác nhận, và một đối chứng thay độ sáng từ cùng một ảnh.
- UNCLEAR gồm một ảnh sau làm mờ và một cặp ghép sai vật liệu. Hai ca này kiểm tra khả năng nhận ra bằng chứng không đủ để so sánh.
- Bộ này dùng để thử pipeline; kết quả không đại diện cho độ chính xác trên 10 cặp chụp thật tại phòng trọ.

Để chạy thử, đặt cases.json và các tệp trong thư mục images/ vào web/lib/ai/eval/. Giữ ảnh và bộ nhãn thật hiện có bằng cách sao lưu nếu trùng tên. Trong thư mục web, chạy npm.cmd run ai:eval. Hai ca gỗ có expectPriceItemId = null vì bảng giá mẫu chưa có mục tương ứng.
