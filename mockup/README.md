# Mockup — thiết kế giao diện đã chốt

Trước 01/09/2026 mấy file này nằm ở `E:\project\mockup\` và
`E:\project\homestay\`, **không repo nào theo dõi** — tức là chỉ tồn tại trên
một ổ đĩa. Đưa vào đây để có bản sao trên GitHub.

| File | Là gì |
|---|---|
| `marketplace-v2.html` | **BẢN ĐANG DÙNG.** Mockup GĐ1 "tông ấm v2", 01/09/2026. Hai vai Sales/Host, xem được cả mobile lẫn web. 11 màn: đăng nhập · đăng ký · tìm căn · kết quả · chi tiết · giữ chỗ · booking của tôi · tạo booking · host · thêm căn · admin. Có sẵn màn nhập từ Google Sheet, kiểm trùng căn, đếm ngược giữ chỗ, xem trước phiếu. |
| `marketplace-v1-cu.html` | Bản cũ 01/08/2026, giữ để đối chiếu. 12 màn, 3 vai. |
| `app-noi-bo.html` | Mockup app nội bộ: lịch timeline, CRM khách, giá theo mùa, xuất Excel. |
| `KE-HOACH-REACT.md` | Kế hoạch chuyển web sang React + 4 tính năng mới. Chứa kiến trúc monorepo `web/` mà mục 6b trong CLAUDE.md nhắc tới. |
| `sabi-tokens.css` · `sabi-icons.svg` | Bảng màu + 36 icon Phosphor. Nguồn chuẩn nằm ở skill `he-thong-thiet-ke-sabi`; hai file này để mockup mở được độc lập. |

## Cách mở

Mở thẳng file `.html` bằng trình duyệt, không cần chạy server.
`marketplace-v2.html` tự chứa mọi thứ. Hai bản còn lại cần `sabi-tokens.css`
và `sabi-icons.svg` nằm cùng thư mục.

## Lưu ý

Đây là **thiết kế**, không phải code chạy được. Khi dựng thật thì bám theo
`marketplace-v2.html`, đừng bám bản v1.
