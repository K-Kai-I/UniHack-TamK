# Images recognition report — 11 cặp ảnh thực tế

Ngày báo cáo: 17/11/2026. Ảnh do người dùng tự chụp; T = trước, S = sau theo tên file. Người dùng xác nhận chưa ghi đáp án. Vì vậy đây là **so sánh với nhãn sơ bộ**, không phải độ chính xác đã được người chụp xác nhận.

## Cập nhật xác nhận ngày 17/11/2026

Đã đồng bộ mô tả người dùng sửa trong labels.csv sang cases.json. Cặp 03 được người chụp xác nhận mất khay dưới: NEW_DAMAGE, ngoài bảng giá, mã giá null, quantity 0; labelStatus=reviewed. Các cặp còn lại vẫn provisional. Cặp 02 xác nhận vết nứt bị băng dính che; 07 chỉ cần lau; 08 là hai bức tường khác nhau; 10 mất tranh. Chưa tự đổi nhãn 07/10 vì cần phân biệt mục tiêu đánh giá hư hỏng bề mặt với mất đồ. Giữ UNCLEAR ở hai ca này trong lúc chờ chốt tiêu chí.

Chỉ thay mô tả, nguồn và trạng thái xác nhận; không thay trường đáp án chấm điểm. Vì vậy điểm khớp các lượt đã chạy không đổi, không cần gọi lại API. Kết quả và cases.snapshot.json trong từng thư mục results được giữ nguyên: chúng phản ánh bộ nhãn ở thời điểm chạy, khi toàn bộ nhãn còn provisional. Hiện tại có 1/11 ca reviewed; chưa có ca WEAR xác nhận.

## Phạm vi và cách đo

Khảo sát 12 model của Google/OpenAI bằng khóa dự án. Không đại diện tất cả model trên thị trường. Claude, Grok, Qwen/Llama chưa chạy do thiếu khóa/endpoint/trọng số. Danh sách API trả về nằm ở `eval/available-models.json`; được liệt kê không đồng nghĩa có hạn mức inference.

Cùng 22 ảnh gốc, prompt damage-v1, bảng giá `shared/samples/terms.json`, ngưỡng confidence 0.6. Không gửi nhãn mong đợi cho model. Gemini dùng compareDamage/Interactions API hiện có; OpenAI dùng Responses API và cùng schema/quy tắc, detail=high. Endpoint và thiết lập mặc định từng hãng khác nhau. Đo thời gian toàn bộ request và retry; không đo chi phí vì chưa thu token usage. Tối đa 2 lần gọi/ca. Khi lỗi quyền/404/429, các ca còn lại được ghi SKIPPED, không giả là đã test.

Có 3 ca NEW_DAMAGE, 2 NO_CHANGE, 6 UNCLEAR theo nhãn sơ bộ; **chưa có ca WEAR xác nhận**. Các nhãn được ghi trước inference và giữ nguyên. Không đổi nhãn để tăng điểm. Tại thời điểm chạy, cặp 03 chưa xác nhận mất khay hay tháo tạm; nay người chụp đã xác nhận mất khay. Các ca 02/07/08/10 vẫn cần đọc cùng giới hạn quan sát và tiêu chí phân loại. Kết luận tốt nhất chỉ áp dụng bộ nhỏ này và điều kiện API tại thời điểm chạy.

## So sánh lần đầu

| Model | Ca đã thử | JSON hợp lệ | Lỗi ca | Bỏ qua | Khớp nhãn / 11 | Khớp cả trường / 11 | Báo NEW_DAMAGE sai nhãn | Trung vị (s) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| gemini-2.5-flash | 1 | 0 | 1 | 10 | Không đánh giá | Không đánh giá | — | — |
| gemini-3.1-flash-lite | 11 | 11 | 0 | 0 | 5/11 | 5/11 | 2 | 2.77 |
| gemini-3.5-flash-lite | 11 | 10 | 1 | 0 | 6/11 | 6/11 | 2 | 2.53 |
| gemini-3.8-flash | 7 | 0 | 7 | 4 | Không đánh giá | Không đánh giá | — | — |
| gemini-4-argon | 1 | 0 | 1 | 10 | Không đánh giá | Không đánh giá | — | — |
| gemini-4-carbon | 1 | 0 | 1 | 10 | Không đánh giá | Không đánh giá | — | — |
| gemini-4-hydrogen | 11 | 7 | 4 | 0 | 7/11 | 7/11 | 0 | 39.36 |
| gpt-4.1-mini | 1 | 0 | 1 | 10 | Không đánh giá | Không đánh giá | — | — |
| gpt-4o-mini | 1 | 0 | 1 | 10 | Không đánh giá | Không đánh giá | — | — |
| gpt-6-astra | 1 | 0 | 1 | 10 | Không đánh giá | Không đánh giá | — | — |
| gpt-6-luna | 1 | 0 | 1 | 10 | Không đánh giá | Không đánh giá | — | — |
| gpt-6.1-sol | 1 | 0 | 1 | 10 | Không đánh giá | Không đánh giá | — | — |

Lỗi dịch vụ không phải lỗi nhận diện. Bỏ qua không tính là request đã gửi. Tỷ lệ khớp /11 giúp tránh model chỉ trả vài ca dễ có điểm cao. Bộ nhãn lệch về UNCLEAR: luôn trả UNCLEAR cũng khớp 6/11; vì vậy điểm chỉ hơn mức này một ca chưa là bằng chứng mạnh.

## Lựa chọn và chạy xác nhận

Ứng viên dẫn đầu lần so sánh: **gemini-4-hydrogen**. Tiêu chí: số ca khớp nhãn/11, sau đó khớp trường bảng giá, ít kết luận NEW_DAMAGE sai nhãn, số phản hồi hợp lệ và độ trễ. Không dùng tên/hạng model để chọn.

Chạy xác nhận `gemini-4-hydrogen`: 1/11 JSON hợp lệ; khớp nhãn 1/11; khớp cả trường 1/11; 7 lỗi, 3 bỏ qua. Không có cặp nào nhận được phản hồi hợp lệ ở cả hai lượt, nên không tính được tỷ lệ nhất quán nhãn giữa hai lượt; không diễn giải thành 0% nhất quán. Đây là kiểm tra độ ổn định trên cùng ảnh, không phải đánh giá tập ảnh mới.

**Kết luận vận hành:** Hydrogen không vượt qua xác nhận độ ổn định (1 phản hồi hợp lệ, 7 ca lỗi, 3 ca bỏ qua sau 429). Không đổi AI_MODEL trong .env.local: vẫn gemini-3.1-flash-lite. Model hiện tại có 11/11 phản hồi ở lượt đầu nhưng chỉ khớp 5/11 nhãn sơ bộ; giữ cấu hình không đồng nghĩa công nhận nó tốt nhất. Chưa đủ căn cứ chọn model tốt nhất cho sản phẩm; cần nhãn người chụp xác nhận, đủ WEAR và tài khoản API hoạt động ổn định.

## Điểm mạnh, điểm yếu và lý do lựa chọn

Nhận xét dưới đây chỉ dựa trên lượt test 11 cặp này. Lỗi API phản ánh điều kiện dịch vụ/tài khoản tại thời điểm chạy, không chứng minh năng lực nhận diện của model yếu. Chưa đo chi phí, nên không kết luận model nào rẻ nhất.

| Model / nhóm | Điểm mạnh quan sát được | Điểm yếu hoặc giới hạn quan sát được | Quyết định |
| --- | --- | --- | --- |
| Gemini 4 Hydrogen | Dẫn đầu về số ca khớp nhãn sơ bộ và trường bảng giá: 7/11. Không kết luận NEW_DAMAGE trái nhãn sơ bộ trong 7 phản hồi hợp lệ; nhận ra thiếu khay ở cặp 03 và giữ UNCLEAR ở vùng bị che tại cặp 10. | Trung vị 39,36 giây trên các ca thành công; 4 ca lỗi lượt đầu. Lượt xác nhận chỉ 1 ca hợp lệ, 7 lỗi, 3 bỏ qua. Chưa chứng minh độ ổn định dịch vụ hoặc độ chính xác thực tế. | Chọn làm ứng viên để chạy xác nhận vì dẫn đầu điểm khớp; chưa thay cấu hình production vì xác nhận không đạt độ tin cậy vận hành. |
| Gemini 3.5 Flash-Lite | Khớp 6/11, hơn model hiện tại một ca. Trung vị 2,53 giây, 10/11 phản hồi hợp lệ; nhận ra ảnh quạt tối và ảnh tủ mờ là UNCLEAR. | Một ca không trả kết quả hợp lệ; hai kết luận NEW_DAMAGE trái nhãn sơ bộ. Điểm 6/11 bằng cách luôn đoán nhãn phổ biến UNCLEAR trên bộ này. Chưa chạy xác nhận riêng; chênh lệch thời gian nhỏ không chứng minh nhanh hơn ổn định. | Chưa đủ cải thiện để thay model hiện tại. |
| Gemini 3.1 Flash-Lite | Trả đủ 11/11 kết quả hợp lệ trong lượt đầu, không lỗi dịch vụ; trung vị 2,77 giây. Đã được tích hợp trong dự án. | Chỉ khớp 5/11 nhãn sơ bộ; hai kết luận NEW_DAMAGE trái nhãn. Bỏ sót khay tủ lạnh thiếu và không giữ UNCLEAR với ảnh quạt tối. | Tạm giữ cấu hình để tránh chuyển sang ứng viên lỗi dịch vụ; đây không phải chứng nhận model tốt nhất hoặc đủ an toàn để tự quyết định khấu trừ. |
| Gemini 3.8 Flash | Chưa có phản hồi hợp lệ để đánh giá điểm mạnh. | 7 ca đã thử đều lỗi 503/429; 4 ca bỏ qua. Không có dữ liệu chấm khả năng nhìn ảnh. | Chưa xếp hạng chất lượng. |
| Gemini 2.5 Flash | Chưa có phản hồi hợp lệ để đánh giá điểm mạnh. | HTTP 404 trên cả Interactions và lần thử generateContent. | Chưa xếp hạng; cần kiểm tra lại khả năng truy cập model/endpoint. |
| Gemini 4 Argon, Gemini 4 Carbon | Chưa có phản hồi hợp lệ để đánh giá điểm mạnh. | Mỗi model gặp HTTP 429 ở ca đầu, bỏ qua 10 ca còn lại. | Chưa xếp hạng; cần hạn mức API khả dụng. |
| GPT-4o mini, GPT-4.1 mini, GPT-6 Luna, GPT-6.1 Sol, GPT-6 Astra | Chưa có phản hồi hợp lệ để đánh giá điểm mạnh. | Mỗi model gặp HTTP 429 ở ca đầu, bỏ qua 10 ca còn lại. | Không kết luận kém hơn Gemini; cần test lại khi tài khoản có hạn mức. |

**Lý do chọn ứng viên:** ưu tiên khớp nhãn trên toàn bộ 11 ca, sau đó khớp trường bảng giá, ít báo hư hỏng mới trái đáp án, tỷ lệ trả kết quả và thời gian. Hydrogen dẫn đầu lượt đầu nên được chọn để xác nhận. Tuy nhiên, bộ nhãn chưa được người chụp duyệt, thiếu WEAR và kết quả xác nhận có quá nhiều lỗi; chưa thể chốt model tốt nhất cho sản phẩm. Trước khi đổi cấu hình, cần xác nhận đáp án, bổ sung đủ nhóm nhãn và đánh giá trên bộ ảnh mới với API hoạt động ổn định.

## Nhãn và kết quả từng cặp tại thời điểm chạy (trước cập nhật xác nhận)

| Cặp | Vị trí | Nhãn sơ bộ | Lý do |
| --- | --- | --- | --- |
| 01 | Ghế xanh | NEW_DAMAGE | Mặt ghế sau xuất hiện mảng rách/bong ở mép phải. |
| 02 | Cửa gỗ | UNCLEAR | Băng dính mới che mặt cửa; không thấy rõ hư hỏng bên dưới. |
| 03 | Khay cửa tủ lạnh | NEW_DAMAGE | Khay dưới có trong ảnh trước nhưng thiếu ở ảnh sau; nhãn sơ bộ cho mất bộ phận, cần xác nhận không chỉ tháo tạm. |
| 04 | Quạt đứng | UNCLEAR | Ảnh sau thiếu sáng, khó kiểm tra chi tiết. |
| 05 | Tường gần ổ điện | NEW_DAMAGE | Xuất hiện nét vẽ/vết xước tối trên tường. |
| 06 | Tường cạnh máy lạnh | NO_CHANGE | Vết cũ quanh nắp tròn đã có ở cả hai ảnh; chưa thấy thay đổi rõ. |
| 07 | Mặt bàn | UNCLEAR | Có vụn/chất bẩn mới; chưa xác định chỉ cần lau hay bề mặt hỏng. |
| 08 | Tường dưới đèn | UNCLEAR | Ánh sáng và khung hình khác; thiếu điểm mốc đối chiếu chính xác vùng tường. |
| 09 | Tủ áo | UNCLEAR | Ảnh sau mất nét nặng. |
| 10 | Tường sau tranh | UNCLEAR | Các lỗ ở vùng trước bị tranh che; không biết có từ trước hay mới. |
| 11 | Bàn và màn hình | NO_CHANGE | Khác ánh sáng/nội dung màn hình; không thấy hư hỏng vật lý mới. |

Gemini 2.5 Flash được thử thêm qua generateContent sau khi Interactions trả 404; endpoint tương thích cũng trả 404. Chưa có kết quả nhận diện để xếp hạng model này.

### comparison-01 — gemini-2.5-flash

| Cặp | Kết luận | Khớp nhãn | Ghi chú/phản hồi |
| --- | --- | --- | --- |
| 01 | — | — | AI_FAILED: Dịch vụ AI trả HTTP 404. Kiểm tra model và định dạng yêu cầu. |
| 02 | — | — | SKIPPED after provider access/quota error; not tested |
| 03 | — | — | SKIPPED after provider access/quota error; not tested |
| 04 | — | — | SKIPPED after provider access/quota error; not tested |
| 05 | — | — | SKIPPED after provider access/quota error; not tested |
| 06 | — | — | SKIPPED after provider access/quota error; not tested |
| 07 | — | — | SKIPPED after provider access/quota error; not tested |
| 08 | — | — | SKIPPED after provider access/quota error; not tested |
| 09 | — | — | SKIPPED after provider access/quota error; not tested |
| 10 | — | — | SKIPPED after provider access/quota error; not tested |
| 11 | — | — | SKIPPED after provider access/quota error; not tested |

### comparison-01 — gemini-3.1-flash-lite

| Cặp | Kết luận | Khớp nhãn | Ghi chú/phản hồi |
| --- | --- | --- | --- |
| 01 | NEW_DAMAGE | Có | Bề mặt ghế bị bong tróc một phần lớp bọc màu xanh ở phía cạnh bên phải. |
| 02 | NEW_DAMAGE | Không | Trên bề mặt cánh cửa gỗ xuất hiện dấu dán băng keo hình chữ X tại vị trí trả phòng. |
| 03 | NO_CHANGE | Không | Khay cửa tủ lạnh vẫn giữ nguyên tình trạng như ban đầu. |
| 04 | NO_CHANGE | Không | Quạt đứng vẫn ở tình trạng nguyên vẹn, không có hư hỏng mới so với ảnh trước. |
| 05 | NEW_DAMAGE | Có | Trên tường xuất hiện vết vẽ nguệch ngoạc mới. |
| 06 | NO_CHANGE | Có | Vị trí lắp đặt máy lạnh và mảng tường xung quanh không có sự thay đổi đáng kể giữa hai ảnh. |
| 07 | NO_CHANGE | Không | Mặt bàn xuất hiện vết bẩn vụn thức ăn trên bề mặt nhưng không phải là hư hỏng bề mặt vĩnh viễn. |
| 08 | NO_CHANGE | Không | Bề mặt tường dưới đèn ở cả hai ảnh không có sự thay đổi đáng kể về hiện trạng. |
| 09 | UNCLEAR | Có | Ảnh sau trả phòng bị nhòe nên không thể xác định rõ tình trạng của tủ áo so với ảnh trước. |
| 10 | NEW_DAMAGE | Không | Xuất hiện các lỗ thủng trên tường tại vị trí tranh đã bị tháo bỏ. |
| 11 | NO_CHANGE | Có | Bàn và màn hình máy tính không có thay đổi đáng kể so với ảnh trước khi nhận phòng. |

### comparison-01 — gemini-3.5-flash-lite

| Cặp | Kết luận | Khớp nhãn | Ghi chú/phản hồi |
| --- | --- | --- | --- |
| 01 | NEW_DAMAGE | Có | Ghế xanh xuất hiện vết rách hoặc bong tróc bề mặt ở cạnh bên phải trong ảnh sau. |
| 02 | NEW_DAMAGE | Không | Cửa gỗ xuất hiện vết dán băng keo hình chữ thập ở mặt cánh cửa phía dưới. |
| 03 | — | — | AI_FAILED: Gemini không trả kết quả hợp lệ sau 2 lần gọi. |
| 04 | UNCLEAR | Có | Ảnh sau quá tối không thể quan sát rõ chi tiết quạt đứng. |
| 05 | NEW_DAMAGE | Có | Tường có vết vẽ nguệch ngoạc mới xuất hiện. |
| 06 | NO_CHANGE | Có | Không có thay đổi đáng kể trên tường cạnh máy lạnh giữa hai thời điểm. |
| 07 | WEAR | Không | Mặt bàn có dính vụn thức ăn và vết bẩn nhỏ ở ảnh sau so với ảnh trước. |
| 08 | NO_CHANGE | Không | Hai bức ảnh tường dưới đèn cho thấy bề mặt không có thay đổi đáng kể. |
| 09 | UNCLEAR | Có | Ảnh chụp ở trạng thái sau bị mờ nhòe, không thể so sánh chi tiết với ảnh trước. |
| 10 | NEW_DAMAGE | Không | Bức tranh treo tường đã bị tháo bỏ, để lại các lỗ khoan và vết trầy xước trên bề mặt tường. |
| 11 | NO_CHANGE | Có | Vùng bàn và màn hình nhìn rõ ở cả hai ảnh, không thấy thay đổi đáng kể. |

### comparison-01 — gemini-3.8-flash

| Cặp | Kết luận | Khớp nhãn | Ghi chú/phản hồi |
| --- | --- | --- | --- |
| 01 | — | — | AI_FAILED: Dịch vụ AI trả HTTP 503. Dịch vụ AI đang lỗi hoặc quá tải; thử lại sau. |
| 02 | — | — | AI_FAILED: Dịch vụ AI trả HTTP 503. Dịch vụ AI đang lỗi hoặc quá tải; thử lại sau. |
| 03 | — | — | AI_FAILED: Dịch vụ AI trả HTTP 503. Dịch vụ AI đang lỗi hoặc quá tải; thử lại sau. |
| 04 | — | — | AI_FAILED: Dịch vụ AI trả HTTP 503. Dịch vụ AI đang lỗi hoặc quá tải; thử lại sau. |
| 05 | — | — | AI_FAILED: Dịch vụ AI trả HTTP 503. Dịch vụ AI đang lỗi hoặc quá tải; thử lại sau. |
| 06 | — | — | AI_FAILED: Dịch vụ AI trả HTTP 503. Dịch vụ AI đang lỗi hoặc quá tải; thử lại sau. |
| 07 | — | — | AI_FAILED: Dịch vụ AI trả HTTP 429. Đạt giới hạn tốc độ hoặc hạn mức; kiểm tra dashboard. |
| 08 | — | — | SKIPPED after provider access/quota error; not tested |
| 09 | — | — | SKIPPED after provider access/quota error; not tested |
| 10 | — | — | SKIPPED after provider access/quota error; not tested |
| 11 | — | — | SKIPPED after provider access/quota error; not tested |

### comparison-01 — gemini-4-argon

| Cặp | Kết luận | Khớp nhãn | Ghi chú/phản hồi |
| --- | --- | --- | --- |
| 01 | — | — | AI_FAILED: Dịch vụ AI trả HTTP 429. Đạt giới hạn tốc độ hoặc hạn mức; kiểm tra dashboard. |
| 02 | — | — | SKIPPED after provider access/quota error; not tested |
| 03 | — | — | SKIPPED after provider access/quota error; not tested |
| 04 | — | — | SKIPPED after provider access/quota error; not tested |
| 05 | — | — | SKIPPED after provider access/quota error; not tested |
| 06 | — | — | SKIPPED after provider access/quota error; not tested |
| 07 | — | — | SKIPPED after provider access/quota error; not tested |
| 08 | — | — | SKIPPED after provider access/quota error; not tested |
| 09 | — | — | SKIPPED after provider access/quota error; not tested |
| 10 | — | — | SKIPPED after provider access/quota error; not tested |
| 11 | — | — | SKIPPED after provider access/quota error; not tested |

### comparison-01 — gemini-4-carbon

| Cặp | Kết luận | Khớp nhãn | Ghi chú/phản hồi |
| --- | --- | --- | --- |
| 01 | — | — | AI_FAILED: Dịch vụ AI trả HTTP 429. Đạt giới hạn tốc độ hoặc hạn mức; kiểm tra dashboard. |
| 02 | — | — | SKIPPED after provider access/quota error; not tested |
| 03 | — | — | SKIPPED after provider access/quota error; not tested |
| 04 | — | — | SKIPPED after provider access/quota error; not tested |
| 05 | — | — | SKIPPED after provider access/quota error; not tested |
| 06 | — | — | SKIPPED after provider access/quota error; not tested |
| 07 | — | — | SKIPPED after provider access/quota error; not tested |
| 08 | — | — | SKIPPED after provider access/quota error; not tested |
| 09 | — | — | SKIPPED after provider access/quota error; not tested |
| 10 | — | — | SKIPPED after provider access/quota error; not tested |
| 11 | — | — | SKIPPED after provider access/quota error; not tested |

### comparison-01 — gemini-4-hydrogen

| Cặp | Kết luận | Khớp nhãn | Ghi chú/phản hồi |
| --- | --- | --- | --- |
| 01 | — | — | AI_FAILED: Dịch vụ AI trả HTTP 503. Dịch vụ AI đang lỗi hoặc quá tải; thử lại sau. |
| 02 | UNCLEAR | Có | Ảnh sau xuất hiện dấu chữ X màu trắng được dán bằng băng keo trong lên ô gỗ phía dưới bên phải cánh cửa, che khuất bề mặt gỗ bên dưới tại vị trí trước đó còn nhìn rõ. |
| 03 | NEW_DAMAGE | Có | Khay nhựa trong suốt ở tầng dưới trên cánh cửa tủ lạnh đã bị thiếu mất so với ảnh ban đầu. |
| 04 | UNCLEAR | Có | Ảnh sau bị tối ở phần lồng quạt phía trên và thân động cơ phía sau nên không thể quan sát rõ toàn bộ chiếc quạt để so sánh. |
| 05 | — | — | AI_FAILED: Dịch vụ AI trả HTTP 503. Dịch vụ AI đang lỗi hoặc quá tải; thử lại sau. |
| 06 | NO_CHANGE | Có | Bề mặt tường, trần nhà và nắp đậy tròn cạnh máy lạnh ở cả hai ảnh đều giống nhau và không thấy dấu hiệu hư hỏng hay thay đổi mới. |
| 07 | — | — | AI_FAILED: Dịch vụ AI trả HTTP 503. Dịch vụ AI đang lỗi hoặc quá tải; thử lại sau. |
| 08 | UNCLEAR | Có | Ảnh sau chỉ chụp cận mảng tường phẳng có bóng người cầm điện thoại và không còn thấy đèn hay thiết bị nhỏ ở góc dưới như ảnh trước nên không chắc chắn cùng vị trí. |
| 09 | — | — | AI_FAILED: Dịch vụ AI trả HTTP 503. Dịch vụ AI đang lỗi hoặc quá tải; thử lại sau. |
| 10 | UNCLEAR | Có | Vùng tường phía sau bức tranh bị che khuất hoàn toàn trong ảnh trước nên không thể xác định các lỗ khoan và vết trên tường trong ảnh sau là hư hỏng mới hay đã có từ trước. |
| 11 | NO_CHANGE | Có | Bàn làm việc, màn hình, laptop, tường phía sau và các vật dụng đều giữ nguyên hiện trạng ở cả hai ảnh, chỉ khác nhẹ về ánh sáng và góc chụp. |

### comparison-01 — gpt-4.1-mini

| Cặp | Kết luận | Khớp nhãn | Ghi chú/phản hồi |
| --- | --- | --- | --- |
| 01 | — | — | Dịch vụ AI trả HTTP 429. Đạt giới hạn tốc độ hoặc hạn mức; kiểm tra dashboard. |
| 02 | — | — | SKIPPED after provider access/quota error; not tested |
| 03 | — | — | SKIPPED after provider access/quota error; not tested |
| 04 | — | — | SKIPPED after provider access/quota error; not tested |
| 05 | — | — | SKIPPED after provider access/quota error; not tested |
| 06 | — | — | SKIPPED after provider access/quota error; not tested |
| 07 | — | — | SKIPPED after provider access/quota error; not tested |
| 08 | — | — | SKIPPED after provider access/quota error; not tested |
| 09 | — | — | SKIPPED after provider access/quota error; not tested |
| 10 | — | — | SKIPPED after provider access/quota error; not tested |
| 11 | — | — | SKIPPED after provider access/quota error; not tested |

### comparison-01 — gpt-4o-mini

| Cặp | Kết luận | Khớp nhãn | Ghi chú/phản hồi |
| --- | --- | --- | --- |
| 01 | — | — | Dịch vụ AI trả HTTP 429. Đạt giới hạn tốc độ hoặc hạn mức; kiểm tra dashboard. |
| 02 | — | — | SKIPPED after provider access/quota error; not tested |
| 03 | — | — | SKIPPED after provider access/quota error; not tested |
| 04 | — | — | SKIPPED after provider access/quota error; not tested |
| 05 | — | — | SKIPPED after provider access/quota error; not tested |
| 06 | — | — | SKIPPED after provider access/quota error; not tested |
| 07 | — | — | SKIPPED after provider access/quota error; not tested |
| 08 | — | — | SKIPPED after provider access/quota error; not tested |
| 09 | — | — | SKIPPED after provider access/quota error; not tested |
| 10 | — | — | SKIPPED after provider access/quota error; not tested |
| 11 | — | — | SKIPPED after provider access/quota error; not tested |

### comparison-01 — gpt-6-astra

| Cặp | Kết luận | Khớp nhãn | Ghi chú/phản hồi |
| --- | --- | --- | --- |
| 01 | — | — | Dịch vụ AI trả HTTP 429. Đạt giới hạn tốc độ hoặc hạn mức; kiểm tra dashboard. |
| 02 | — | — | SKIPPED after provider access/quota error; not tested |
| 03 | — | — | SKIPPED after provider access/quota error; not tested |
| 04 | — | — | SKIPPED after provider access/quota error; not tested |
| 05 | — | — | SKIPPED after provider access/quota error; not tested |
| 06 | — | — | SKIPPED after provider access/quota error; not tested |
| 07 | — | — | SKIPPED after provider access/quota error; not tested |
| 08 | — | — | SKIPPED after provider access/quota error; not tested |
| 09 | — | — | SKIPPED after provider access/quota error; not tested |
| 10 | — | — | SKIPPED after provider access/quota error; not tested |
| 11 | — | — | SKIPPED after provider access/quota error; not tested |

### comparison-01 — gpt-6-luna

| Cặp | Kết luận | Khớp nhãn | Ghi chú/phản hồi |
| --- | --- | --- | --- |
| 01 | — | — | Dịch vụ AI trả HTTP 429. Đạt giới hạn tốc độ hoặc hạn mức; kiểm tra dashboard. |
| 02 | — | — | SKIPPED after provider access/quota error; not tested |
| 03 | — | — | SKIPPED after provider access/quota error; not tested |
| 04 | — | — | SKIPPED after provider access/quota error; not tested |
| 05 | — | — | SKIPPED after provider access/quota error; not tested |
| 06 | — | — | SKIPPED after provider access/quota error; not tested |
| 07 | — | — | SKIPPED after provider access/quota error; not tested |
| 08 | — | — | SKIPPED after provider access/quota error; not tested |
| 09 | — | — | SKIPPED after provider access/quota error; not tested |
| 10 | — | — | SKIPPED after provider access/quota error; not tested |
| 11 | — | — | SKIPPED after provider access/quota error; not tested |

### comparison-01 — gpt-6.1-sol

| Cặp | Kết luận | Khớp nhãn | Ghi chú/phản hồi |
| --- | --- | --- | --- |
| 01 | — | — | Dịch vụ AI trả HTTP 429. Đạt giới hạn tốc độ hoặc hạn mức; kiểm tra dashboard. |
| 02 | — | — | SKIPPED after provider access/quota error; not tested |
| 03 | — | — | SKIPPED after provider access/quota error; not tested |
| 04 | — | — | SKIPPED after provider access/quota error; not tested |
| 05 | — | — | SKIPPED after provider access/quota error; not tested |
| 06 | — | — | SKIPPED after provider access/quota error; not tested |
| 07 | — | — | SKIPPED after provider access/quota error; not tested |
| 08 | — | — | SKIPPED after provider access/quota error; not tested |
| 09 | — | — | SKIPPED after provider access/quota error; not tested |
| 10 | — | — | SKIPPED after provider access/quota error; not tested |
| 11 | — | — | SKIPPED after provider access/quota error; not tested |

### confirmation-01 — gemini-4-hydrogen

| Cặp | Kết luận | Khớp nhãn | Ghi chú/phản hồi |
| --- | --- | --- | --- |
| 01 | — | — | AI_FAILED: Dịch vụ AI trả HTTP 503. Dịch vụ AI đang lỗi hoặc quá tải; thử lại sau. |
| 02 | — | — | AI_FAILED: Dịch vụ AI trả HTTP 503. Dịch vụ AI đang lỗi hoặc quá tải; thử lại sau. |
| 03 | — | — | AI_FAILED: Dịch vụ AI trả HTTP 503. Dịch vụ AI đang lỗi hoặc quá tải; thử lại sau. |
| 04 | — | — | AI_FAILED: Không kết nối được AI hoặc quá 90 giây. Hãy thử lại. Đã thử 2 lần. |
| 05 | NEW_DAMAGE | Có | Trên bề mặt tường phía trên ổ điện ở ảnh sau xuất hiện vết vẽ nguệch ngoạc hình zíc zắc màu tối mà ở ảnh trước hoàn toàn không có. |
| 06 | — | — | AI_FAILED: Dịch vụ AI trả HTTP 503. Dịch vụ AI đang lỗi hoặc quá tải; thử lại sau. |
| 07 | — | — | AI_FAILED: Dịch vụ AI trả HTTP 503. Dịch vụ AI đang lỗi hoặc quá tải; thử lại sau. |
| 08 | — | — | AI_FAILED: Dịch vụ AI trả HTTP 429. Đạt giới hạn tốc độ hoặc hạn mức; kiểm tra dashboard. |
| 09 | — | — | SKIPPED after provider access/quota error; not tested |
| 10 | — | — | SKIPPED after provider access/quota error; not tested |
| 11 | — | — | SKIPPED after provider access/quota error; not tested |

### legacy-01 — gemini-2.5-flash

| Cặp | Kết luận | Khớp nhãn | Ghi chú/phản hồi |
| --- | --- | --- | --- |
| 01 | — | — | Dịch vụ AI trả HTTP 404. Kiểm tra model và định dạng yêu cầu. |
| 02 | — | — | SKIPPED after provider access/quota error; not tested |
| 03 | — | — | SKIPPED after provider access/quota error; not tested |
| 04 | — | — | SKIPPED after provider access/quota error; not tested |
| 05 | — | — | SKIPPED after provider access/quota error; not tested |
| 06 | — | — | SKIPPED after provider access/quota error; not tested |
| 07 | — | — | SKIPPED after provider access/quota error; not tested |
| 08 | — | — | SKIPPED after provider access/quota error; not tested |
| 09 | — | — | SKIPPED after provider access/quota error; not tested |
| 10 | — | — | SKIPPED after provider access/quota error; not tested |
| 11 | — | — | SKIPPED after provider access/quota error; not tested |

## File và kiểm tra

- `eval/reference/images/`: giữ nguyên 22 ảnh gốc.
- `eval/reference/cases.json`, `labels.csv`: ánh xạ ảnh và nhãn sơ bộ.
- `eval/reference/gallery.html`, `README.md`: xem từng cặp và hướng dẫn.
- `eval/benchmark.ts`: chương trình so sánh riêng, chưa thay provider trong production.
- `eval/results/`: JSON, CSV, snapshot đáp án cho mỗi lượt.
- `eval/comparison-summary.json`: bảng tổng hợp và quy tắc chọn.
- `README.md`: hướng dẫn hiện hành.
- Xóa `eval/reference/cases.pending.json` vì là danh sách 10 ảnh công khai cũ, không khớp 11 cặp mới.
- Xóa `UPGRADE-REPORT.md` cũ: hướng dẫn và báo cáo hiện hành đã được hợp nhất tại đây và README; số liệu 10/10 bộ proxy không áp dụng cho bộ thật.
- Giữ hai JSON mẫu damage/mismatch và tài liệu lịch sử trong docs: không phải file dư của benchmark; backend và tài liệu chung do nhóm quản lý.

Kiểm tra: dry-run 11 cặp hợp lệ; ai:test 23/23 qua; TypeScript --noEmit --incremental false và ESLint benchmark qua. Kết quả API thật ở bảng trên.

## Tái chạy

Chạy từ thư mục web, thay run bằng tên mới để không ghi đè bằng chứng:
```powershell
node --conditions=react-server --import tsx lib/ai/eval/benchmark.ts --model gemini-4-hydrogen --run manual-02
```

## Tài liệu model

- Google: https://aistudio.google.com/docs/models
- OpenAI: https://developers.openai.com/api/docs/models
- Claude (chưa test): https://platform.claude.com/docs/en/models/overview
