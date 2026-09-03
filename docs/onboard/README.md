# Bộ onboard host (giai đoạn 10 host tiên phong)

- `huong-dan-host.pdf` — tờ 1 trang GỬI CHO HOST (Zalo). Trước khi gửi: điền SĐT/Zalo + giờ hỗ trợ ở chân trang
  (sửa 2 ô `<span class="blank">` trong HTML rồi xuất lại).
- `kich-ban-mo-host.pdf` — 2 trang NỘI BỘ cho chủ dự án: checklist làm một lần, kịch bản mở host 10 phút,
  mẫu tin nhắn, theo dõi sau khi mở, quy tắc khi vào chế độ hỗ trợ, câu trả lời sẵn, sổ 10 host.

## Sửa chữ & xuất lại PDF (trên Windows, dùng Chrome có sẵn)

Sửa file `.html` tương ứng, rồi chạy trong PowerShell:

```
$d='E:\project\homestay\homestay-backend\docs\onboard'
$chrome='C:\Program Files\Google\Chrome\Application\chrome.exe'
foreach ($n in 'huong-dan-host','kich-ban-mo-host') {
  & $chrome --headless=new --disable-gpu --no-pdf-header-footer --print-to-pdf="$d\$n.pdf" "file:///E:/project/homestay/homestay-backend/docs/onboard/$n.html"
}
```

Hoặc mở HTML bằng Chrome → Ctrl+P → Lưu thành PDF, khổ A4, lề "Không", bật "Đồ hoạ nền".

## Font — bài học 03/09/2026
- Tiêu đề dùng **Cambria** (fallback Palatino Linotype, Times New Roman), thân chữ **Segoe UI**.
- **KHÔNG dùng Georgia cho tiếng Việt**: bản Georgia trên Windows thiếu nhiều chữ có dấu (ầ, ề, ố...) → dấu rời ra
  "lâ`n đâ`u". Web app dùng Georgia được vì trình duyệt tự ghép font, còn in PDF thì lộ.
- Xuất PDF trên máy Linux không có font Windows (DejaVu) thì người nhận thấy chữ lạ → luôn xuất trên máy Windows này.
- `xuat-pdf.mjs` là script playwright dùng khi xuất ở máy khác; không cần trên Windows.
