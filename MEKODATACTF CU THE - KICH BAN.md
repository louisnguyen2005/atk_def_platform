# MEKODATACTF — Kịch bản cụ thể

KỊCH BẢN CỤ THỂ — LUẬT ĐIỂM CỦA HỆ THỐNG MEKODATACTF.
Mỗi đội chỉ có 1 máy ảo: Team01 dùng VM01 (10.10.1.20), Team02 dùng VM02 (10.10.2.20). Mỗi máy chạy dịch vụ ScoreBoardLab của đội. Người chơi tự bảo vệ, sửa lỗi và khởi chạy lại dịch vụ của mình. BTC xử lý lỗi hạ tầng do hệ thống tổ chức quản lý, như lỗi mạng chung hoặc cổng truy cập; BTC không sửa dịch vụ thi đấu thay đội.
Mô phỏng ngày 01/11/2026: Round 1 từ 09:00 đến 09:10, tick 1–5; Round 2 từ 09:10 đến 09:20, tick 6–10. Mỗi tick 2 phút. Trước khi mở round đầu, Attack=Defense=SLA=0. Khi mở mỗi round, cộng 1 điểm vào tổng SLA của từng đội. Attack và Defense được cộng dồn, không xóa khi chuyển round.
Attack: +1 cho mỗi cờ đối phương nộp hợp lệ lần đầu. Defense: +1 sau mỗi tick nếu cờ của đội được đặt thành công và không bị đối phương nộp hợp lệ trong tick. Nộp trùng hoặc cờ hết hạn không được cộng Attack. Không trừ Defense đã có khi mất cờ tick mới; chỉ không được cộng Defense ở tick đó.
Để minh họa đúng mức tối đa 5 cờ trong round 5 tick: mỗi đội nhận 1 cờ mới mỗi tick, tổng 5 cờ/round, 10 cờ/2 round. Hai lỗ hổng IDOR và SQLi cùng dẫn đến cờ của tick. Cấu hình thời hạn của bản minh họa: cờ chỉ được nộp trong chính tick sinh cờ, hết tick thì hết hạn; nhờ vậy Defense được chốt ngay cuối tick. Đây là cấu hình minh họa để nhất quán cách chốt điểm, không phải luật thời hạn đã được người dùng xác nhận riêng.
SLA: đầu mỗi round cấp 1 điểm/đội. Tại cuối từng tick, mỗi dịch vụ còn down bị trừ 0,2 điểm SLA. Dịch vụ phục hồi trước khi tick kết thúc thì không bị trừ ở tick đó. Nếu down qua nhiều thời điểm kết thúc tick thì tiếp tục bị trừ ở từng tick. Dịch vụ up không được cộng thêm điểm SLA theo tick, cũng không được hoàn khoản đã trừ ở tick trước. Sang round mới tiếp tục cộng 1 vào SLA tích lũy. Trong ví dụ chỉ có 1 dịch vụ/đội: 5 tick down liên tiếp sẽ mất trọn 1 điểm SLA của round. Tổng = Attack + Defense + SLA.
Tình huống đơn giản: Team02 sai mật khẩu rồi nhập lại đúng; Team01 nộp trùng cờ bị từ chối. Dịch vụ Team02 down lúc 09:06:45, vẫn down ở cuối tick 4 lúc 09:08 nên mất 0,2 SLA; đội tự khôi phục lúc 09:08:30, trước cuối tick 5 lúc 09:10, nên tick 5 không bị trừ. Sự cố mạng chung lúc 08:30 xảy ra trước cuộc thi và được BTC xử lý lúc 08:32, tách biệt với lỗi dịch vụ đội trong lúc thi.
Đối chiếu cả cuộc thi: Team01 nộp cờ Team02 tại tick 1,3,5,6,8,10 (6 cờ); Team02 nộp cờ Team01 tại tick 5,7,9 (3 cờ). Mọi lần đặt cờ đều thành công. Team01 có Attack=6, Defense=7, SLA=2, tổng 15. Team02 có Attack=3, Defense=4, SLA=1,8, tổng 8,8. Round 1: Team01 3+4+1=8; Team02 1+2+0,8=3,8. Round 2: Team01 3+3+1=7; Team02 2+2+1=5. Khiếu nại của Team02 về khoản trừ SLA được giải thích bằng trạng thái ở cuối tick 4, giữ nguyên điểm.
Hai sơ đồ 2TEAM ROUND 1 và 2TEAM ROUND 2 được giữ nguyên làm tham khảo cũ theo phạm vi đã thống nhất; không dùng luật và điểm số trong đó cho 12 sơ đồ mới. Mọi địa chỉ, cờ, thời gian và kết quả là dữ liệu minh họa.

## Tạo tài khoản

Trước cuộc thi, BTC tạo tài khoản cho các thành viên của Team01 và Team02. Tất cả kích hoạt thành công.

- Ban tổ chức → Hệ thống cuộc thi: Yêu cầu tạo tài khoản cho Team01 và Team02
- Hệ thống cuộc thi → Hệ thống cuộc thi: Kiểm tra thông tin đăng ký: cả hai đội hợp lệ
- Hệ thống cuộc thi → Quản lý tài khoản: Tạo tài khoản thành viên và gán vào đúng đội
- Quản lý tài khoản → Hệ thống cuộc thi: Đã tạo tài khoản cho thành viên của 2 đội
- Hệ thống cuộc thi → Team01 / Team02: Gửi hướng dẫn kích hoạt tài khoản
- Team01 / Team02 → Hệ thống cuộc thi: Các thành viên hoàn tất kích hoạt
- Hệ thống cuộc thi → Ban tổ chức: Team01 và Team02 đã có tài khoản sử dụng

## Soạn đề thi

Chuẩn bị ScoreBoardLab trên 1 máy ảo/đội. IDOR và SQLi cùng dẫn đến 1 cờ của tick; thử đặt và đọc cờ thành công.

- Ban tổ chức → Quản lý đề thi: Soạn ScoreBoardLab gồm lỗi IDOR và SQLi
- Quản lý đề thi → Quản lý đề thi: Chuẩn bị 1 cờ/đội/tick cho hai cách khai thác
- Quản lý đề thi → Kiểm tra dịch vụ: Thử đặt cờ và đọc lại bằng chức năng hợp lệ
- Kiểm tra dịch vụ → Quản lý đề thi: Cờ mẫu đặt và đọc thành công; dịch vụ hoạt động
- Quản lý đề thi → Ban tổ chức: Trình đề và kết quả kiểm thử
- Ban tổ chức → Quản lý đề thi: Phê duyệt đề cho cuộc thi

## Cấp phát tài nguyên

08:00. Cấp đúng 1 máy ảo/đội: Team01 nhận VM01, Team02 nhận VM02. Tổng 2 máy, mỗi máy 4 GB RAM.

- Ban tổ chức → Hệ thống cuộc thi: Yêu cầu cấp 1 máy ảo cho mỗi đội
- Hệ thống cuộc thi → Quản lý tài nguyên: Cấp 2 máy ảo cho 2 đội; tổng RAM 8 GB
- Quản lý tài nguyên → Quản lý tài nguyên: Kiểm tra tài nguyên: đủ cấp 2 máy ảo
- Quản lý tài nguyên → Quản lý tài nguyên: Gán VM01 cho Team01, VM02 cho Team02
- Quản lý tài nguyên → Quản lý tài nguyên: Chuẩn bị ScoreBoardLab trên từng máy ảo
- Quản lý tài nguyên → Hệ thống cuộc thi: VM01: 10.10.1.20; VM02: 10.10.2.20 — sẵn sàng
- Hệ thống cuộc thi → Team01 / Team02: Gửi thông tin truy cập đúng máy ảo của từng đội
- Hệ thống cuộc thi → Ban tổ chức: Hoàn tất: mỗi đội được cấp 1 máy ảo

## Kiểm tra đăng nhập

08:20. Team02 nhập sai mật khẩu khi truy cập môi trường. Sau khi nhập lại đúng, đội vào được VM02.

- Team02 → Hệ thống cuộc thi: Nhập tài khoản và mật khẩu để truy cập VM02
- Hệ thống cuộc thi → Hệ thống cuộc thi: Kiểm tra thông tin: mật khẩu chưa đúng
- Hệ thống cuộc thi → Team02: Thông báo sai mật khẩu; yêu cầu nhập lại
- Team02 → Hệ thống cuộc thi: Nhập lại mật khẩu đúng
- Hệ thống cuộc thi → Hệ thống cuộc thi: Xác thực thành công; Team02 có quyền vào VM02
- Hệ thống cuộc thi → Máy ảo VM02: Cho phép Team02 truy cập máy ảo được cấp
- Máy ảo VM02 → Hệ thống cuộc thi: Môi trường VM02 sẵn sàng
- Hệ thống cuộc thi → Team02: Đăng nhập thành công vào VM02

## Phát đề thi

Trước 09:00 các đội có Attack=Defense=SLA=0. Lúc 09:00 bắt đầu round 1 và cấp 1 điểm SLA/đội.

- Ban tổ chức → Hệ thống cuộc thi: 09:00 — Công bố đề và bắt đầu round 1
- Hệ thống cuộc thi → Bộ tính điểm: Xác nhận điểm ban đầu A=0, D=0, SLA=0
- Hệ thống cuộc thi → Team01 / Team02: Công bố đề, luật điểm và địa chỉ VM01, VM02
- Hệ thống cuộc thi → Bộ tính điểm: Cấp 1 SLA cho mỗi đội khi mở round 1
- Bộ tính điểm → Hệ thống cuộc thi: Mỗi đội hiện có A=0, D=0, SLA=1
- Hệ thống cuộc thi → Hệ thống cuộc thi: Mở tick 1; đặt 1 cờ vào dịch vụ của mỗi đội
- Hệ thống cuộc thi → Team01 / Team02: Thông báo bắt đầu thi; 5 tick trong round 1

## Tính điểm tấn công

Tick 3 từ 09:04 đến 09:06: Team01 nộp cờ của Team02 lúc 09:04:40. Attack tăng từ 1 lên 2; nộp lại không được cộng.

- Team01 → Hệ thống cuộc thi: 09:04:40 — Nộp cờ F-T02-T03 lấy từ VM02
- Hệ thống cuộc thi → Xác thực cờ: Kiểm tra cờ, đội nộp, tick và nộp trùng
- Xác thực cờ → Hệ thống cuộc thi: Cờ đúng của Team02, còn trong tick 3, chưa nộp
- Hệ thống cuộc thi → Bộ tính điểm: Cộng 1 điểm Attack cho Team01
- Bộ tính điểm → Bảng xếp hạng: Cập nhật Attack Team01: 1 lên 2
- Hệ thống cuộc thi → Team01: Nộp thành công; Attack hiện bằng 2
- Team01 → Hệ thống cuộc thi: Nộp lại chính cờ F-T02-T03
- Hệ thống cuộc thi → Xác thực cờ: Đối chiếu lần nộp trước
- Xác thực cờ → Hệ thống cuộc thi: Cờ đã được Team01 nộp thành công
- Hệ thống cuộc thi → Team01: Từ chối nộp trùng; không cộng thêm điểm

## Tính điểm phòng thủ

09:06 kết thúc tick 3. Team01 bảo vệ được cờ, Team02 bị nộp cờ. Defense trước tick 3: Team01=2, Team02=1.

- Hệ thống cuộc thi → Xác thực cờ: 09:06 — Đóng nộp cờ tick 3 và tổng hợp kết quả
- Xác thực cờ → Hệ thống cuộc thi: Team01 không bị nộp cờ; Team02 bị Team01 nộp cờ
- Hệ thống cuộc thi → Bộ tính điểm: Tính Defense theo kết quả bảo vệ cờ tick 3
- Bộ tính điểm → Bộ tính điểm: Team01 +1 Defense: 2 lên 3
- Bộ tính điểm → Bộ tính điểm: Team02 không được cộng; Defense vẫn là 1
- Bộ tính điểm → Bảng xếp hạng: Cập nhật Defense: Team01=3, Team02=1
- Bộ tính điểm → Hệ thống cuộc thi: Đã chốt Defense của tick 3

## Duy trì dịch vụ

Team02 tự sửa dịch vụ bị down. Cuối tick 4 vẫn down nên SLA round 1 từ 1 còn 0,8; tick 5 đã up nên giữ 0,8. Đầu round 2 tổng SLA lên 1,8.

- Hệ thống cuộc thi → Bộ tính điểm: 09:00 — Mở round 1, cấp 1 SLA cho mỗi đội
- Bộ tính điểm → Bảng xếp hạng: SLA Team01=1; Team02=1
- Team02 → Dịch vụ trên VM02: 09:06:45 — Dịch vụ dừng sau khi đội chỉnh sửa
- Kiểm tra dịch vụ → Dịch vụ trên VM02: 09:08 — Kiểm tra trạng thái cuối tick 4
- Dịch vụ trên VM02 → Kiểm tra dịch vụ: Dịch vụ vẫn down ở thời điểm kết thúc tick
- Kiểm tra dịch vụ → Bộ tính điểm: Ghi 1 dịch vụ down ở cuối tick 4; trừ 0,2 SLA
- Bộ tính điểm → Bảng xếp hạng: SLA Team02: 1 còn 0,8
- Team02 → Dịch vụ trên VM02: 09:08:30 — Tự sửa lỗi và khởi chạy lại dịch vụ
- Dịch vụ trên VM02 → Team02: Dịch vụ đã up; đội truy cập lại thành công
- Kiểm tra dịch vụ → Dịch vụ trên VM02: 09:10 — Kiểm tra cuối tick 5: dịch vụ up
- Kiểm tra dịch vụ → Bộ tính điểm: Tick 5 không trừ; SLA round 1 giữ 0,8
- Hệ thống cuộc thi → Bộ tính điểm: 09:10 — Mở round 2 sau khi chốt tick 5; cấp thêm 1 SLA
- Bộ tính điểm → Bảng xếp hạng: Tổng SLA: Team01=2; Team02=1,8

## Xử lí sự cố

08:30 trước cuộc thi, Team02 không kết nối được VM02 do mạng hạ tầng. BTC sửa kết nối mạng, đội thử lại thành công lúc 08:32.

- Team02 → Hệ thống cuộc thi: 08:30 — Báo không kết nối được VM02
- Hệ thống cuộc thi → Ban tổ chức: Chuyển báo cáo sự cố truy cập môi trường
- Ban tổ chức → Hạ tầng mạng cuộc thi: Kiểm tra đường kết nối tới máy ảo Team02
- Hạ tầng mạng cuộc thi → Ban tổ chức: Xác nhận lỗi kết nối ở hạ tầng mạng cuộc thi
- Ban tổ chức → Hạ tầng mạng cuộc thi: Khắc phục kết nối mạng của hệ thống
- Hạ tầng mạng cuộc thi → Ban tổ chức: 08:32 — Đường kết nối tới VM02 hoạt động lại
- Ban tổ chức → Team02: Thông báo mạng đã phục hồi; yêu cầu truy cập lại
- Team02 → Hệ thống cuộc thi: Team02 kết nối VM02 thành công; đóng sự cố

## Ghi nhận kết quả

09:20 kết thúc tick 10 và round 2. Tất cả cờ đã hết hạn; tổng Team01=15, Team02=8,8.

- Hệ thống cuộc thi → Hệ thống cuộc thi: 09:20 — Đóng nộp cờ, chốt tick 10 và round 2
- Hệ thống cuộc thi → Bộ tính điểm: Tổng hợp Attack, Defense và SLA của 2 round
- Bộ tính điểm → Hệ thống cuộc thi: Team01: Attack 6 + Defense 7 + SLA 2 = 15
- Bộ tính điểm → Hệ thống cuộc thi: Team02: Attack 3 + Defense 4 + SLA 1,8 = 8,8
- Hệ thống cuộc thi → Bảng xếp hạng: Cập nhật Team01 15 điểm; Team02 8,8 điểm
- Hệ thống cuộc thi → Team01 / Team02: Công bố kết quả tạm; nhận khiếu nại đến 09:30

## Xử lí khiếu nại

09:23. Team02 hỏi khoản trừ 0,2 SLA. BTC kiểm tra trạng thái cuối tick 4 và giải thích, không sửa dịch vụ hoặc cộng lại điểm.

- Team02 → Hệ thống cuộc thi: Hỏi vì sao tổng SLA là 1,8 thay vì 2?
- Hệ thống cuộc thi → Ban tổ chức: Chuyển thắc mắc về khoản trừ SLA tick 4
- Ban tổ chức → Kiểm tra dịch vụ: Đối chiếu trạng thái dịch vụ lúc 09:08 cuối tick 4
- Kiểm tra dịch vụ → Ban tổ chức: Dịch vụ còn down lúc 09:08; up lại lúc 09:08:30
- Ban tổ chức → Hệ thống cuộc thi: Xác nhận trừ 0,2 ở tick 4, không trừ ở tick 5
- Hệ thống cuộc thi → Team02: Giải thích: SLA=1+1-0,2=1,8; tổng điểm vẫn 8,8
- Hệ thống cuộc thi → Hệ thống cuộc thi: Ghi nhận khiếu nại đã được giải quyết

## Tổng hợp và đánh giá xếp loại

Sau 09:30, BTC xác nhận Team01 hạng 1 với 15 điểm; Team02 hạng 2 với 8,8 điểm.

- Ban tổ chức → Hệ thống cuộc thi: Yêu cầu tổng hợp kết quả sau khi xử lý khiếu nại
- Hệ thống cuộc thi → Ban tổ chức: Team01: 6+7+2=15; Team02: 3+4+1,8=8,8
- Ban tổ chức → Ban tổ chức: Đối chiếu kết quả và xác nhận thứ hạng
- Ban tổ chức → Hệ thống cuộc thi: Phê duyệt Team01 hạng 1, Team02 hạng 2
- Hệ thống cuộc thi → Bảng xếp hạng: Chốt BXH chính thức: Team01 15, Team02 8,8
- Hệ thống cuộc thi → Team01 / Team02: Công bố kết quả cuối cuộc thi
