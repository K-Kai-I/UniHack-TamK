# Két Cọc Trọ — Kết quả kiểm thử 3 cặp ảnh

Ngày kiểm thử 16/11/2026. Ba model được chạy một lần trên từng cặp qua cùng hàm `compareDamage`, prompt `damage-v1`, schema JSON và bảng giá demo. Thời gian tính từ lúc gọi hàm đến khi nhận kết quả hoặc lỗi.

## Bộ ảnh

Ba cặp **đối chứng** dùng chung ảnh ghế lúc nhận phòng. Ảnh sau được chọn hoặc tạo theo điều kiện đã biết để xác định nhãn trước khi chạy model.

| Cặp | Ảnh trước | Ảnh sau | Điều kiện và nhãn mong đợi |
| --- | --- | --- | --- |
| 01 | [Ảnh trước](anh/01-cung-anh/truoc.jpg) | [Ảnh sau](anh/01-cung-anh/sau.jpg) | Cùng một ảnh. `NO_CHANGE` |
| 02 | [Ảnh trước](anh/02-tang-do-sang/truoc.jpg) | [Ảnh sau](anh/02-tang-do-sang/sau.jpg) | Chỉ tăng độ sáng 22%. `NO_CHANGE` |
| 03 | [Ảnh trước](anh/03-anh-sau-toi/truoc.jpg) | [Ảnh sau](anh/03-anh-sau-toi/sau.png) | Ảnh sau tối đồng nhất, không thể quan sát ghế. `UNCLEAR` |

## Kết quả từng cặp

| Cặp | Gemini 4 Hydrogen | Gemini 3.8 Flash | Gemini 3.1 Flash-Lite |
| --- | --- | --- | --- |
| 01 | `NO_CHANGE` · 33,22 giây | `NO_CHANGE` · 65,61 giây | `NO_CHANGE` · 2,75 giây |
| 02 | `NO_CHANGE` · 22,10 giây | Mất kết nối (`ECONNRESET`) · 46,34 giây | `NO_CHANGE` · 2,27 giây |
| 03 | `UNCLEAR` · 13,76 giây | Lỗi phân giải DNS (`ENOTFOUND`) · 0,03 giây | `UNCLEAR` · 2,28 giây |

## Đối chiếu với nhãn mong đợi

| Cặp | Nhãn mong đợi | Gemini 4 Hydrogen | Gemini 3.8 Flash | Gemini 3.1 Flash-Lite |
| --- | --- | --- | --- | --- |
| 01 | `NO_CHANGE` | Khớp | Khớp | Khớp |
| 02 | `NO_CHANGE` | Khớp | Không có kết quả | Khớp |
| 03 | `UNCLEAR` | Khớp | Không có kết quả | Khớp |

| Model | Có kết quả hợp lệ | Khớp nhãn trong số ca có kết quả | Khớp nhãn trên toàn bộ ca đã gửi | Ca có kết quả sai nhãn |
| --- | ---: | ---: | ---: | ---: |
| Gemini 4 Hydrogen | 3/3 | 3/3 (100%) | 3/3 (100%) | 0 |
| Gemini 3.8 Flash | 1/3 | 1/1 (100%) | 1/3 (33,3%) | 0 |
| Gemini 3.1 Flash-Lite | 3/3 | 3/3 (100%) | 3/3 (100%) | 0 |

Tỉ lệ trên toàn bộ ca đã gửi cho biết bao nhiêu yêu cầu vừa trả kết quả vừa khớp nhãn. Với Gemini 3.8 Flash, hai lỗi kết nối làm tỉ lệ này còn 1/3. Hai ca đó không có dự đoán để chấm.

## Kết luận

**Gemini 3.1 Flash-Lite phù hợp nhất cho demo trong lượt thử này.** Flash-Lite và Hydrogen đều trả JSON hợp lệ và khớp nhãn ở cả 3 cặp. Thời gian trung vị trên 3 cặp là **2,28 giây** với Flash-Lite và **22,10 giây** với Hydrogen. Gemini 3.8 Flash chỉ trả kết quả cho 1/3 cặp và khớp nhãn ở cặp đó. Hai lỗi kết nối được ghi riêng vì không có kết quả để chấm.

Ba cặp này kiểm tra khả năng nhận ra hiện trạng không đổi và xử lý ảnh thiếu bằng chứng. Để đánh giá khả năng phát hiện hư hỏng mới hoặc hao mòn ngoài thực tế, nhóm cần chạy bộ 10 cặp ảnh thật đã gắn nhãn.
