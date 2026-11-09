# Vận hành hai round Web → Crypto

Crypto chạy ngay trên ba VM Pool 139 đang chạy web Boutique. Ba dịch vụ nghe cổng TCP `9011` (`curveball`), `9012` (`padding_oracle`) và `9013` (`ecdsa_nonce`). Checker crypto đặt flag và kiểm tra dịch vụ qua ForcAD. Website dùng tài khoản đội đã đăng ký và tự đồng bộ cùng team token với ForcAD. Một capture hợp lệ được `Attack +1`, đội mất flag bị `Defense −1`; mỗi tick dịch vụ của đội qua checker nhận SLA `+1`. Scoreboard cộng điểm của cả hai round.

## Địa chỉ

- Website/scoreboard trên máy điều phối: `http://10.13.131.95:3000/scoreboard`.
- Website/scoreboard từ các VM trong CyberRange: `http://10.90.0.30:3000/scoreboard`. Website đi vào range qua SSH reverse tunnel. Tunnel tự reconnect khi mạng chập chờn.
- ForcAD API trên máy điều phối: `http://127.0.0.1:18080`.
- Round 1: 10 tick, 5 phút mỗi tick (50 phút).
- Round 2: 15 tick, 2 phút mỗi tick (30 phút).
- VM đội: `10.90.0.11`, `10.90.0.12`, `10.90.0.13`. Mỗi VM có đủ web và crypto.

## Thư mục làm bài trên VM đội

Sau khi đăng nhập, source và file làm bài nằm trong `~/crypto-lab/`:

```text
crypto-lab/
├── host_port.txt
├── chall1_curveball/
├── chall2_padding_oracle/
└── chall3_ecdsa_nonce/
```

`host_port.txt` ở thư mục gốc liệt kê IP và cả ba cổng của hai đội đối thủ.
Mỗi challenge có `host_port.txt` riêng, source dễ bị khai thác trong `src/`,
`flag.txt` mẫu, `exploit.py` để đội tự viết và `submit.txt` hướng dẫn nộp.
Ghi chú, kết quả và flag thật nằm trong `notes.txt`, `results.txt` và
`captured_flags.txt`; các file tự viết được giữ nguyên khi cập nhật workspace.
Chạy `./connect.sh [IP-đối-thủ]` để mở kết nối bằng `nc`.

`flag.txt` chỉ minh họa định dạng, không phải flag để nộp. Đặt flag thật vào
`captured_flags.txt`, mỗi dòng một flag, rồi chạy `python3 ../submit_flag.py`
trong thư mục challenge. Script đăng nhập bằng email/mật khẩu đội trưởng
(hoặc `--team-token` cho thành viên), lấy CSRF token và gửi qua website bằng
phiên của đội; thông tin đăng nhập không được lưu trong workspace. Có thể thay
bằng cách mở `http://10.90.0.30:3000/scoreboard`, đăng nhập và dán flag trong
mục **Nộp flag**. Flag Crypto được tính khi Round 2 đang chạy.

Cài hoặc cập nhật riêng workspace trên pool hiện tại, không restart service:

```bash
python3 labs/crypto_ad/deploy.py --web-lab meko_boutique --workspace \
  --ssh-config ./ops/pool139/.secrets/management-config
```

Đội đăng nhập website bằng email/mật khẩu của mình rồi vào **Nộp flag**. Website tự gửi token của đội đang đăng nhập tới ForcAD; đội không cần nhập hay chép token vào exploit. Thông tin BTC và ba đội đã tạo được lưu cục bộ tại `ops/pool139/.secrets/website-access.json`. Không đưa file `.secrets` vào Git hoặc chia sẻ token BTC. Website trên máy điều phối chỉ truy cập được khi máy đang kết nối mạng hiện tại; website trong range chỉ truy cập được khi SSH tunnel đang hoạt động.

## Bắt đầu và chuyển round

Mở **điều khiển round** trên trang chủ MekoDataCTF bằng tài khoản BTC. Round 1 đang được chuẩn bị sẵn với 5 checker của Boutique; tất cả 5 checker trên mỗi VM đã được kiểm tra `UP`. Bấm **Bắt đầu** để mở thi.

Khi Round 1 đã hoàn tất 10 tick, dừng ở trạng thái `finished`. Điều khiển sẽ hiện **Chuyển sang Round 2 — Crypto**. Bấm nút đó rồi bấm **Bắt đầu**. ForcAD giữ nguyên đội, token và điểm của round Web, bật ba task crypto, đồng thời tiếp tục tick toàn cục để flag giữa hai round không bị trùng. Bảng điểm của website hiển thị số tick SLA cộng dồn trên tổng tick của cả hai round.

Sau khi Round 2 kết thúc, tổng điểm và lịch sử hai round vẫn hiển thị. Muốn bắt đầu một cuộc thi mới, dùng **Đóng và lưu hồ sơ** trước khi reset; chức năng bắt đầu lại reset cuộc thi mới về round Web và lưu snapshot cuộc thi trước.

## Nối checker và triển khai lại

Website, collector SSH và reverse tunnel chạy bằng các user service. Kiểm tra trạng thái:

```bash
systemctl --user status mekodata-website mekodata-collector mekodata-range-tunnel
```

ForcAD chạy bằng Docker Compose project `forcad-demo`. Xem trạng thái:

```bash
sg docker -c 'docker compose -p forcad-demo ps'
```

Chạy lại kiểm tra crypto trên toàn pool:

```bash
MEKO_SSH_CONFIG=ops/pool139/.secrets/management-config \
  .venv-integration/bin/python labs/crypto_ad/deploy.py --web-lab meko_boutique --probe
```

Cài lại các binary crypto dùng cấu hình và token đã lưu trên mỗi VM:

```bash
MEKO_SSH_CONFIG=ops/pool139/.secrets/management-config \
  .venv-integration/bin/python labs/crypto_ad/deploy.py --web-lab meko_boutique --apply
```

Mã tích hợp, checker ForcAD, cài đặt VM, vận hành website LAN và kiểm thử nằm trong `labs/crypto_ad/`, `ForcAD-demo/checkers/crypto_ad/` và `ops/`. Management key chỉ nằm trong `ops/pool139/.secrets/management-config` và `.secrets/pool-id-139-management-key`.

## Trạng thái sau kiểm tra triển khai

Kiểm tra trên Pool 139 xác nhận cả 5 service Web và cả 3 service Crypto của từng đội trả `UP`; 9 crypto checker trên pool đều `UP`. Một lần mô phỏng tấn công thực từ VM đội 2 đã chiếm flag web và flag crypto của đội 1, đăng nhập rồi nộp hai flag qua website. ForcAD lưu đủ capture, tính `Attack +1`, `Defense −1` mỗi capture và SLA đúng cho cả hai round. Snapshot của lần kiểm tra đã lưu trong ForcAD; cuộc thi trực tiếp đã được reset về Round 1, tick 0, điểm 0 để BTC bắt đầu giải.
