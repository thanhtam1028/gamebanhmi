# Bánh Mì Thần Tốc

Game platformer hài hước chạy trên trình duyệt. Bạn là một ổ bánh mì biết chạy, nhiệm vụ là giải cứu tiệm bánh khỏi băng chuột cống đeo kính râm. Cuối mỗi ván bạn có thể gửi điểm lên bảng xếp hạng chung.

Game là một file [`public/index.html`](public/index.html) (HTML Canvas và JavaScript thuần). Bảng xếp hạng là một Cloudflare Worker ([`src/worker.js`](src/worker.js)) lưu điểm trong Cloudflare D1. Nếu mở file trực tiếp mà không có server, game vẫn chơi được, chỉ là bảng xếp hạng không hiện.

## Cách chơi

| Phím | Việc |
|---|---|
| ← → hoặc A D | Chạy |
| Space, ↑ hoặc W | Nhảy (giữ lâu thì nhảy cao hơn) |
| R | Chơi lại |

- Đạp lên đầu chuột cống để hạ nó.
- Bị chuột cắn lần đầu thì bánh mì **nhỏ lại** (chưa mất mạng). Cắn lần hai mới mất mạng.
- Hái bông hoa 🌼 lơ lửng trên cao để **lớn lên** lại. Phải giữ phím nhảy để nhảy cao mới với tới.
- Cụng đầu vào hộp `?` để lấy xu. Có một hộp bí mật chứa ly cà phê sữa đá, uống vào sẽ chạy nhanh gấp đôi.
- Chạm cờ ở cuối màn để thắng. Rơi xuống hố thì mất một mạng ngay.

Muốn tự sửa câu đùa, tốc độ, độ cao nhảy hay bản vẽ màn chơi, mở `public/index.html` và tìm khu vực `TỰ SỬA Ở ĐÂY` ở đầu phần script.

## Chạy trên máy

Cần Node.js 22 trở lên.

```bash
npm install
npm run dev
```

Lệnh `npm run dev` tạo D1 cục bộ (nằm trong thư mục `.wrangler/`, không đụng tới database thật) rồi mở game ở http://localhost:8787.

## Test

```bash
npm test            # API bảng xếp hạng + D1, chạy trong môi trường Workers
npm run test:e2e    # game trên Chrome thật + Worker + D1 cục bộ
```

`npm run test:e2e` dùng Google Chrome có sẵn trên máy. Cả hai bộ test không cần tài khoản Cloudflare.

## API bảng xếp hạng

| Yêu cầu | Kết quả |
|---|---|
| `GET /api/scores` | `{ "scores": [{ "name", "score", "created_at" }] }`, top 10, điểm cao trước |
| `POST /api/scores` với `{ "name", "score" }` | `201` và bảng mới. Tên 1 đến 12 ký tự không có ký tự điều khiển. Điểm là số nguyên từ 0 đến 99999. Sai thì `400`, nội dung quá 1 KB thì `413` |

Lưu ý: điểm do trình duyệt tự gửi lên, nên ai biết gọi API cũng có thể gửi điểm giả. Server chỉ kiểm tra dữ liệu có hợp lệ hay không, không chống gian lận. Hợp với game vui, không hợp với giải thưởng thật.

## CI/CD

Workflow [`.github/workflows/ci-cd.yml`](.github/workflows/ci-cd.yml):

- **Mọi pull request và mọi lần push vào `main`**: chạy job `Test` (cài thư viện, `npm test`, `npm run test:e2e`).
- **Push vào `main` và test đều qua**: chạy job `Deploy lên Cloudflare`:
  1. Kiểm tra đã có secrets và `database_id` thật.
  2. Sao lưu D1 (`backup.sql`, giữ 14 ngày trong mục Artifacts của lượt chạy).
  3. Áp dụng các file trong `migrations/` cho D1 thật.
  4. `wrangler deploy`.
  5. Gọi thử `/api/scores` và trang chủ trên địa chỉ vừa deploy.
- Hai lượt deploy không bao giờ chạy cùng lúc.

### Thiết lập lần đầu

1. Tạo database D1 và điền `database_id` vào [`wrangler.jsonc`](wrangler.jsonc):

   ```bash
   npx wrangler login
   npx wrangler d1 create gamebanhmi-db
   ```

2. Trên Cloudflare vào **My Profile** → **API Tokens** → **Create Token**, chọn mẫu **Edit Cloudflare Workers**, thêm quyền **Account → D1 → Edit**. Chỉ cấp cho đúng tài khoản của bạn.
3. Thêm hai secret cho repo (**Settings** → **Secrets and variables** → **Actions**, hoặc dùng `gh secret set`):
   - `CLOUDFLARE_API_TOKEN`: token vừa tạo.
   - `CLOUDFLARE_ACCOUNT_ID`: mã tài khoản Cloudflare (xem bằng `npx wrangler whoami`).
4. Push vào `main`. Địa chỉ game hiện ở phần tóm tắt của lượt chạy (dạng `https://gamebanhmi.<tên-bạn>.workers.dev`).

### Đổi cấu trúc database

Thêm file mới vào `migrations/` (ví dụ `0002_ten-thay-doi.sql`), không sửa file đã có. Lần deploy sau sẽ tự áp dụng. Test API cũng chạy trên chính các file này.

### Quay về bản trước

Bản code: vào tab **Actions**, mở lượt deploy cũ còn tốt rồi chạy lại, hoặc `git revert` commit lỗi rồi push. Bản deploy: `npx wrangler rollback`. Dữ liệu: tải `d1-backup` trong Artifacts của lượt deploy gần nhất rồi nạp lại bằng `npx wrangler d1 execute gamebanhmi-db --remote --file=backup.sql`.

## Gắn tên miền riêng

Hiện game chạy ở địa chỉ `workers.dev`. Muốn dùng tên miền riêng, thêm mục `routes` vào `wrangler.jsonc` (xem tài liệu Cloudflare Workers custom domains). Tên miền phải nằm trên Cloudflare DNS của bạn.
