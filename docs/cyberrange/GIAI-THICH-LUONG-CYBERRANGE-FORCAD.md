# Luồng hoạt động hiện tại: CyberRange, checker và ForcAD

Tài liệu mô tả bản thử nghiệm đã thiết lập ngày 27–28/10/2026. Cấu hình hoặc trạng thái chạy thực tế có thể thay đổi sau thời điểm đó.

## 1. Mục tiêu hiện tại

Hệ thống đang kiểm tra trạng thái HTTP của bốn máy đội trong một sandbox CyberRangeCZ và hiển thị kết quả trên scoreboard ForcAD chạy trên máy Windows.

```text
TRONG SANDBOX CYBERRANGECZ

attacker1 — 10.80.0.11 ──┐
attacker2 — 10.80.0.12 ──┤  HTTP GET /health
attacker3 — 10.80.0.13 ──┼─────────────────────> checker — 10.80.0.30
attacker4 — 10.80.0.14 ──┘                         │
                                                   ▼
                                     SQLite: results.sqlite3
                                                   ▲
                                                   │ SSH: Windows chủ động kết nối
                                                   │
TRÊN MÁY WINDOWS                                  │
                                                   │
Collector collect_checker.py ──────────────────────┘
        │
        ▼
latest.json → adapter bridge.py → ForcAD → scoreboard
```

Điểm chính: **máy Windows chủ động SSH vào checker để đọc kết quả đã lưu**. Checker không chủ động mở kết nối ra ngoài để gửi kết quả.

## 2. Các thành phần

| Thành phần | Vị trí | Nhiệm vụ | Công nghệ |
|---|---|---|---|
| Bốn máy đội | Sandbox CyberRange | Chạy endpoint web `/health` | VM Kali/Linux, Python HTTP server, HTTP/JSON |
| Checker | VM `10.80.0.30` trong sandbox | Kiểm tra bốn endpoint và lưu kết quả | Python 3, systemd, SQLite |
| Collector | Máy Windows | Kết nối vào checker và lấy kết quả mới nhất | Python 3, OpenSSH, SSH key, JSON |
| Adapter | Trong bản ForcAD trên Windows | Chuyển kết quả cho ForcAD | Python 3, mã kết quả checker của ForcAD |
| ForcAD | Docker Desktop trên Windows | Điều phối vòng thử, ghi nhận trạng thái, hiển thị scoreboard | Docker, Python, Celery, PostgreSQL, Redis, RabbitMQ, Nginx |

Các IP ở đây là địa chỉ trong cấu hình sandbox hiện tại. Khi đổi pool hoặc sandbox, phải kiểm tra topology và SSH config tương ứng.

## 3. Giai đoạn 1: dịch vụ web trên bốn máy đội

| Đội | Máy | Endpoint hiện đang kiểm tra |
|---|---|---|
| team01 | attacker1 | `http://10.80.0.11/health` |
| team02 | attacker2 | `http://10.80.0.12/health` |
| team03 | attacker3 | `http://10.80.0.13/health` |
| team04 | attacker4 | `http://10.80.0.14/health` |

Trong source sandbox hiện tại, đây là endpoint của **trang nhận diện HTTP** trên mỗi attacker, cổng 80. Ví dụ phản hồi:

```json
{"status": "ok", "node": "attacker1"}
```

Endpoint này giúp kiểm tra khả năng phản hồi HTTP và đúng tên máy. Nó chưa chứng minh toàn bộ chức năng website IDOR, đăng nhập, ticket hay database ứng dụng hoạt động.

## 4. Giai đoạn 2: checker trong sandbox

VM `checker` có IP `10.80.0.30`. Provisioning Ansible cài chương trình checker và tạo service `web-checker` trên VM này. Service chạy nền và được cấu hình khởi động cùng máy.

Mỗi **60 giây**, checker dùng HTTP GET để kiểm tra bốn endpoint. Các request có thể thực hiện song song. Với mỗi endpoint, checker kiểm tra:

1. HTTP trả mã 200.
2. Nội dung là JSON và có `status` bằng `ok`.
3. Trường `node` khớp với máy đích được khai báo.

Nếu đạt, checker ghi `UP`. Nếu không kết nối được, timeout, HTTP lỗi hoặc nội dung không đúng, checker ghi `DOWN` và kèm chi tiết. Timeout socket đang cấu hình là 3 giây cho mỗi request.

Mã nguồn sandbox: `idor-c-main/checker/web_health.py`. Danh sách đích: `idor-c-main/checker/web_targets.json`. Unit service: `idor-c-main/provisioning/files/web-checker.service`.

## 5. Giai đoạn 3: lưu kết quả bằng SQLite

Sau một lượt, checker lưu kết quả vào database trên VM checker:

```text
/var/lib/web-checker/results.sqlite3
```

Database có hai bảng:

- `check_cycles`: mã lượt kiểm tra `id` và thời gian `checked_at`.
- `check_results`: đội, URL, trạng thái, độ trễ và chi tiết của từng kết quả, liên kết với `cycle_id`.

Một lượt đầy đủ gồm bốn kết quả. Dữ liệu được lưu theo giao dịch để tránh ghi một phần lượt. Thời gian `checked_at` là UTC; giờ Việt Nam là UTC+7.

Checker đồng thời ghi thông tin JSON vào systemd journal để quản trị viên theo dõi. SQLite nằm trên ổ VM checker: nếu xóa sandbox/VM, dữ liệu có thể mất nếu chưa được sao lưu.

## 6. Giai đoạn 4: Windows lấy dữ liệu qua SSH

Chương trình `ForcAD-demo/collect_checker.py` chạy trên Windows, bình thường ở chế độ nền. Mỗi khoảng **15 giây**, nó thực hiện:

1. Gọi OpenSSH với file `pool101-management-config`.
2. Đi qua ProxyJump và MAN của CyberRange để tới VM checker.
3. Dùng quyền quản trị trên checker chạy truy vấn SQLite chế độ chỉ đọc.
4. Đọc **lượt mới nhất**, không đọc hay đồng bộ toàn bộ lịch sử.
5. Nhận kết quả JSON qua kết nối SSH và kiểm tra có đủ bốn đội.
6. Kiểm tra thời gian kết quả không quá 180 giây, sau đó ghi vào file snapshot.

File snapshot trên Windows:

```text
ForcAD-demo/checkers/mekodata_bridge/latest.json
```

File được thay thế sau mỗi lần lấy hợp lệ. Nếu SSH thất bại hoặc dữ liệu không hợp lệ/quá cũ, collector ghi lỗi; snapshot cũ có thể vẫn còn nhưng adapter cũng kiểm tra độ tuổi của nó.

SSH config và management key thuộc Pool 101/sandbox hiện tại. Host key ở bản thiết lập này được tin tại lần đầu kết nối, chưa đối chiếu fingerprint với quản trị viên. Không đưa private key hoặc token lên repository. Nếu host key thay đổi, cần dừng và xác minh.

Collector không tự khởi động sau khi Windows restart. File log: `ForcAD-demo/collector.log` và `ForcAD-demo/collector-error.log`.

## 7. Giai đoạn 5: adapter chuyển kết quả cho ForcAD

ForcAD không tự đọc database SQLite của checker. File `ForcAD-demo/checkers/mekodata_bridge/bridge.py` là adapter được tạo cho bản thử.

Ở mỗi vòng ForcAD, worker gọi adapter với thao tác `check` và IP đội. Adapter đọc `latest.json`, tìm đúng đội và trả mã thoát theo định dạng ForcAD:

| Dữ liệu đầu vào | Mã trả về | ForcAD hiển thị |
|---|---:|---|
| Đội có trạng thái `UP` | 101 | UP |
| Đội có trạng thái `DOWN` | 104 | DOWN |
| File thiếu, dữ liệu sai/quá 75 giây, lệch đồng hồ hoặc không đủ thông tin | 110 | CHECK FAILED |

`CHECK FAILED` cho biết adapter không có dữ liệu hợp lệ; nó không chứng minh web của đội đã tắt. Lượt này được đánh dấu cần kiểm tra và tạm thời không cộng điểm. Bản thử chưa có giao diện chấm bù; cần quy định xử lý trước thi thật.

Adapter hiện chỉ hỗ trợ `CHECK`. Trong cấu hình bài thử, `puts=0` và `gets=0`; không có flag nào được đặt hoặc đọc bằng adapter này. Bộ điều phối ForcAD bản thử đã được sửa để chạy bài chỉ có CHECK mà không tạo nhóm PUT/GET rỗng.

## 8. Giai đoạn 6: ForcAD và scoreboard

ForcAD bản thử chạy trên Docker Desktop của Windows. Các thành phần chính:

- **Ticker:** điều phối vòng và gửi tác vụ kiểm tra.
- **Celery worker:** chạy adapter checker theo từng đội.
- **PostgreSQL:** lưu dữ liệu cuộc thi, đội, bài và trạng thái/kết quả ForcAD.
- **Redis và RabbitMQ:** hỗ trợ cache, hàng đợi và xử lý tác vụ.
- **Nginx/web:** cung cấp scoreboard và các API.

ForcAD nhận kết quả adapter, ghi nhận trạng thái và cập nhật scoreboard:

```text
http://127.0.0.1:18080/
```

Trang quản trị: `http://127.0.0.1:18080/admin/`. Bản thử chỉ bind localhost của Windows. Luật hiện tại: có 2 round liên tiếp, mỗi round 15 tick, mỗi tick UP được 1 điểm; DOWN được 0 điểm. Điểm ban đầu là 0 và tối đa 30 điểm cho một dịch vụ. Giao diện chính hiển thị điểm trực tiếp thay cho SLA phần trăm. Hệ thống dừng tạo tick sau tick 30.

## 9. Quan hệ giữa lượt checker và round ForcAD

Hai lịch chạy độc lập:

```text
Checker trong sandbox: khoảng 60 giây/lượt → cycle_id
Collector Windows:    khoảng 15 giây/lần lấy snapshot
ForcAD:                tick 60 giây; 15 tick là một round lớn
```

`cycle_id` không phải tick của ForcAD. Adapter đọc snapshot mới nhất tại thời điểm ForcAD gọi; do lịch khác nhau, có thể xảy ra dữ liệu cũ hoặc trùng. Hệ thống ngăn cộng điểm hai lần cho cùng một lượt checker của một đội; lượt trùng được đánh dấu CHECK FAILED để ban tổ chức kiểm tra. Từ khi web thay đổi trạng thái đến khi scoreboard cập nhật có thể mất nhiều hơn một lượt. Bản thử chưa có cơ chế chấm bù khi checker/SSH lỗi, nên cần hoàn thiện trước khi chấm chính thức.

## 10. Ví dụ thử team01 bị DOWN

1. Ban tổ chức tạm dừng service `attacker-http@attacker1` trên VM attacker1 bằng quyền quản trị.
2. Checker trong sandbox không gọi được `10.80.0.11/health` và lưu `team01: DOWN` vào SQLite ở lượt tiếp theo.
3. Collector lấy lượt mới qua SSH và cập nhật `latest.json`.
4. Ở vòng ForcAD tiếp theo, adapter trả mã 104 cho team01.
5. Scoreboard hiển thị team01 DOWN. Sau khi service chạy lại, các bước tương tự đưa trạng thái về UP.

Đây là kiểm thử trạng thái khả dụng, không phải kiểm thử toàn bộ bài IDOR.

## 11. Những phần chưa có trong luồng hiện tại

- Checker nghiệp vụ: đăng nhập, tạo/đọc/sửa dữ liệu hợp lệ của ServiceDesk.
- Checker `PUT`/`GET` để đưa flag vào ứng dụng và đọc lại flag.
- Đối chiếu các flag động với dịch vụ thực tế của từng đội.
- Quy định và kiểm thử điểm Attack, Defense, SLA, đặc biệt khi collector/SSH lỗi.
- Đồng bộ chính xác mỗi round thi với mỗi lần kiểm tra.
- Tự khởi động collector sau khi Windows restart và cơ chế vận hành/khôi phục cho cuộc thi thật.
- Phân quyền vận hành: checker, management key và dữ liệu chấm cần do ban tổ chức quản lý.

ForcAD có các thành phần phục vụ vòng thi và flag, nhưng chúng chưa được nối với bài IDOR trong cấu hình thử này.

## 12. Đường dẫn trên máy Windows

```text
C:\Users\Nguyen Thanh Dat\Documents\ChatGPT\LUAN VAN TOT NGHIEP\
├── ForcAD-demo\
│   ├── collect_checker.py
│   ├── collector.log
│   ├── collector-error.log
│   └── checkers\mekodata_bridge\
│       ├── bridge.py
│       └── latest.json
├── pool101-management-config
├── pool101-known-hosts
└── HUONG-DAN-CYBERRANGE-FORCAD.md
```

Source cấu hình sandbox gốc nằm tại:

```text
C:\Users\Nguyen Thanh Dat\Documents\AN TOAN THONG TIN\LUAN VAN TOT NGHIEP ATTT\CYBERRANGECZ\idor-c-main
```

Hướng dẫn khởi động, đăng nhập, xem kết quả, thử DOWN/UP và dừng hệ thống nằm trong `HUONG-DAN-CYBERRANGE-FORCAD.md` cùng workspace.
