# Mockup — thiết kế giao diện đã chốt

Trước 01/09/2026 mấy file này nằm ở `E:\project\mockup\` và
`E:\project\homestay\`, **không repo nào theo dõi** — tức là chỉ tồn tại trên
một ổ đĩa. Đưa vào đây để có bản sao trên GitHub.

| File | Là gì |
|---|---|
| `marketplace-final.html` | **BẢN ĐANG DÙNG.** Mockup GĐ1 final, 02/09/2026, 119 KB. |
| `marketplace-v2.html` | Bản 01/09, 80 KB. Giữ để đối chiếu. |
| `marketplace-v1-cu.html` | Bản 01/08, 43 KB. 12 màn, 3 vai. |
| `app-noi-bo.html` | Mockup app nội bộ: lịch timeline, CRM khách, giá theo mùa, xuất Excel. |
| `KE-HOACH-REACT.md` | Kế hoạch chuyển web sang React + 4 tính năng mới. Chứa kiến trúc monorepo `web/` mà mục 6b trong CLAUDE.md nhắc tới. |
| `sabi-tokens.css` · `sabi-icons.svg` | Bảng màu + 36 icon Phosphor. Nguồn chuẩn nằm ở skill `he-thong-thiet-ke-sabi`. |

## Bản final thêm gì so với v2

**Bộ lọc tìm căn**
- Tách **Người lớn** / **Trẻ em (dưới 6 tuổi)** thay cho một ô "Số khách"
- Số phòng ngủ đổi thành **tối thiểu** (trước là đúng bằng)

**Hai màn mới:** `holds` (danh sách giữ chỗ) · `myhomes` (căn của tôi)

**⚠️ Đổi mô hình hoa hồng — quan trọng nhất.**
Trước đây lộ trình ghi *một* cơ chế: sales cộng thêm vào giá host, phần chênh
là hoa hồng ẩn. Bản final có **hai cơ chế, host chọn cho từng căn**:

| | Cơ chế A — % giá bán | Cơ chế B — giá sàn + kê |
|---|---|---|
| Host khai | Giá bán niêm yết + % hoa hồng | Giá sàn (host nhận) + mức kê chuẩn |
| Sales hưởng | giá bán × % | phần kê thêm |
| Sales kê thêm | **Không được** | Được, tuỳ họ |
| Host nhận | giá bán − hoa hồng | luôn đúng giá sàn |

Kèm một cơ chế mới: **Sales cắt bớt hoa hồng của mình để giảm giá cho khách**
(tối đa bằng toàn bộ hoa hồng). Cắt bao nhiêu sales chịu bấy nhiêu — host vẫn
nhận đủ. Dòng tiền: hoa hồng trừ vào cọc trước, sales chuyển host phần cọc đã
trừ, host thu nốt tại nhà.

**Trường mới trên căn:** tiêu đề bán hàng (tách khỏi tên căn) · số nhà + tên
đường + điểm mốc gần · ô tô đậu miễn phí + phí bãi ngoài · chính sách trẻ dưới
6 tuổi / từ 6 tuổi · link album ảnh đầy đủ (Google Drive) + tối đa 8 ảnh bìa ·
tiện ích tự thêm.

## Cách mở

Mở thẳng file `.html` bằng trình duyệt, không cần chạy server.
`marketplace-final.html` và `marketplace-v2.html` tự chứa mọi thứ.
Hai bản còn lại cần `sabi-tokens.css` và `sabi-icons.svg` cùng thư mục.

## Lưu ý

Đây là **thiết kế**, không phải code chạy được. Khi dựng thật thì bám
`marketplace-final.html`.

Bảng màu trong mockup (`--brown:#6b4f2a`) **khác** bảng màu app đang chạy
(`#7C6A4E`). Chạy `node scripts/do-mau.mjs` để xem còn bao nhiêu chỗ viết cứng
trước khi định đổi.
