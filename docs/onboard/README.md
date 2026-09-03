# Bộ onboard host (giai đoạn 10 host tiên phong)

- `huong-dan-host.pdf` — tờ 1 trang GỬI CHO HOST (Zalo). Trước khi gửi: mở PDF, điền SĐT/Zalo + giờ hỗ trợ ở chân trang
  (hoặc sửa 2 ô `<span class="blank">` trong HTML rồi xuất lại).
- `kich-ban-mo-host.pdf` — 2 trang NỘI BỘ cho chủ dự án: checklist làm một lần, kịch bản mở host 10 phút,
  mẫu tin nhắn, theo dõi sau khi mở, quy tắc khi vào chế độ hỗ trợ, câu trả lời sẵn, sổ 10 host.

Sửa chữ: sửa file `.html` tương ứng rồi xuất lại PDF bằng Chromium (cần playwright):

```
cd docs/onboard
node xuat-pdf.mjs huong-dan-host.html huong-dan-host.pdf
node xuat-pdf.mjs kich-ban-mo-host.html kich-ban-mo-host.pdf
```

`xuat-pdf.mjs` đang trỏ `executablePath` tới Chromium của máy build; trên Windows đổi thành đường dẫn Chrome
(VD `C:\Program Files\Google\Chrome\Application\chrome.exe`) hoặc bỏ dòng đó nếu đã `npx playwright install chromium`.
Không có playwright thì mở HTML bằng Chrome → Ctrl+P → Lưu thành PDF, khổ A4, lề "Không", bật "Đồ hoạ nền".

Màu chữ theo palette Sabi (skill `homestay-manager-full` mục 11). Font DejaVu vì máy build không tải được Google Fonts;
đổi sang Be Vietnam Pro + Lora nếu xuất trên máy có mạng.
