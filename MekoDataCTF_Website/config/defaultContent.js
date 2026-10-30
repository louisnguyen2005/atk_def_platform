// Nội dung mặc định cho trang chủ — BTC có thể sửa trong /admin/contents
module.exports = {
  vi: {
    hero: {
      title: 'Cuộc thi An toàn thông tin & Khoa học dữ liệu vùng đồng bằng sông Cửu Long',
      body: 'Tấn công để chiếm cờ, phòng thủ để giữ hệ thống — đối đầu trực tiếp với các đội sinh viên khắp vùng Mekong tại Trường Đại học Cần Thơ.',
    },
    about: {
      title: 'Về MekoDataCTF',
      body: [
        'MekoDataCTF là sân chơi học thuật dành cho sinh viên đam mê An toàn thông tin và Khoa học dữ liệu, được tổ chức tại Trường Đại học Cần Thơ.',
        'Cuộc thi theo hình thức Capture The Flag kiểu Attack‑Defense: mỗi đội vừa bảo vệ máy chủ của mình, vừa khai thác lỗ hổng trên máy chủ của đội khác để lấy cờ (flag) và ghi điểm.',
        '- Kết nối cộng đồng sinh viên CNTT vùng Mekong',
        '- Rèn luyện kỹ năng thực chiến về bảo mật và phân tích dữ liệu',
        '- Cơ hội gặp gỡ doanh nghiệp và chuyên gia',
      ].join('\n'),
    },
    format: {
      title: 'Hình thức thi',
      body: [
        'Thi theo đội, hình thức Attack‑Defense, kéo dài trong một ngày.',
        '- Mỗi đội nhận một máy chủ (vulnbox) chạy các dịch vụ chứa lỗ hổng giống nhau cho mọi đội.',
        '- Phòng thủ: tìm và vá lỗ hổng trên dịch vụ của đội mình mà vẫn giữ dịch vụ hoạt động.',
        '- Tấn công: khai thác lỗ hổng trên máy chủ các đội khác để lấy flag và nộp lên hệ thống.',
        '- Trận đấu chia thành các vòng (tick); flag mới được cài vào mỗi vòng.',
        '- Điểm = Tấn công (flag lấy được) + Phòng thủ (flag không bị mất) + SLA (dịch vụ hoạt động ổn định).',
      ].join('\n'),
    },
    rules: {
      title: 'Thể lệ',
      body: [
        '- Mỗi đội gồm 1–4 sinh viên đang theo học tại các trường đại học, cao đẳng.',
        '- Mỗi sinh viên chỉ được tham gia một đội; MSSV được dùng để xác minh danh tính.',
        '- Chỉ được tấn công các dịch vụ trên vulnbox của đội khác trong dải mạng thi đấu.',
        '- Nghiêm cấm tấn công hạ tầng của BTC (máy chấm, hệ thống nộp flag, mạng VPN).',
        '- Nghiêm cấm DoS/DDoS, làm tràn tài nguyên hay phá hủy dữ liệu của đội khác.',
        '- Không được tắt dịch vụ hoặc chặn checker của BTC; dịch vụ ngừng hoạt động sẽ bị trừ điểm SLA.',
        '- Nghiêm cấm chia sẻ flag, mã khai thác giữa các đội trong thời gian thi.',
        '- Quyết định của Ban tổ chức là quyết định cuối cùng.',
      ].join('\n'),
    },
    prizes: {
      title: 'Giải thưởng',
      body: [
        '- Giải Nhất: 10.000.000 VNĐ + Giấy chứng nhận',
        '- Giải Nhì: 6.000.000 VNĐ + Giấy chứng nhận',
        '- Giải Ba: 3.000.000 VNĐ + Giấy chứng nhận',
        '- Giải Khuyến khích: Quà tặng từ nhà tài trợ',
      ].join('\n'),
    },
    faq: {
      title: 'Hỏi đáp',
      body: [
        'Q: Tôi chưa từng chơi CTF, có tham gia được không?',
        'A: Được. BTC sẽ tổ chức buổi hướng dẫn về Attack‑Defense và có môi trường thử trước ngày thi.',
        'Q: Attack‑Defense khác Jeopardy thế nào?',
        'A: Jeopardy là giải bài độc lập; Attack‑Defense là đối kháng trực tiếp — vừa vá lỗi hệ thống của mình, vừa tấn công hệ thống đội khác.',
        'Q: Cần chuẩn bị gì?',
        'A: Mỗi thành viên mang laptop cá nhân có Wi‑Fi, cài sẵn Linux (hoặc máy ảo), SSH client, Python và WireGuard/OpenVPN.',
        'Q: Có thể thay đổi thành viên sau khi đăng ký?',
        'A: Có, bạn có thể chỉnh sửa thông tin đội cho đến hạn chót đăng ký.',
      ].join('\n'),
    },
    contact: {
      title: 'Liên hệ Ban tổ chức',
      body: 'Email: mekodatactf@example.com\nFanpage: facebook.com/mekodatactf',
    },
  },
  en: {
    hero: {
      title: 'Cybersecurity & Data Science CTF of the Mekong Delta',
      body: 'Attack to capture flags, defend to keep your services alive — go head‑to‑head with student teams across the Mekong region at Can Tho University.',
    },
    about: {
      title: 'About MekoDataCTF',
      body: [
        'MekoDataCTF is an academic competition for students passionate about cybersecurity and data science, hosted at Can Tho University.',
        'It follows the Attack‑Defense Capture The Flag format: every team protects its own server while exploiting vulnerabilities on other teams’ servers to steal flags and score points.',
        '- Connect the student IT community of the Mekong Delta',
        '- Build hands-on skills in security and data analysis',
        '- Meet companies and industry experts',
      ].join('\n'),
    },
    format: {
      title: 'Format',
      body: [
        'Team-based, Attack‑Defense style, one day long.',
        '- Each team gets a server (vulnbox) running the same set of vulnerable services.',
        '- Defense: find and patch the vulnerabilities in your services while keeping them running.',
        '- Attack: exploit the services of other teams to steal flags and submit them.',
        '- The game runs in rounds (ticks); new flags are planted every round.',
        '- Score = Attack (flags captured) + Defense (flags not lost) + SLA (service uptime).',
      ].join('\n'),
    },
    rules: {
      title: 'Rules',
      body: [
        '- Each team has 1–4 currently enrolled university or college students.',
        '- Each student may join only one team; student IDs are used for verification.',
        '- Only attack services on other teams’ vulnboxes within the game network.',
        '- Attacking organizer infrastructure (checkers, flag submission, VPN) is forbidden.',
        '- DoS/DDoS, resource exhaustion or destroying other teams’ data is forbidden.',
        '- Do not shut down services or block the organizers’ checker; downtime costs SLA points.',
        '- Sharing flags or exploits between teams during the contest is forbidden.',
        '- The organizing committee’s decisions are final.',
      ].join('\n'),
    },
    prizes: {
      title: 'Prizes',
      body: [
        '- First prize: 10,000,000 VND + Certificate',
        '- Second prize: 6,000,000 VND + Certificate',
        '- Third prize: 3,000,000 VND + Certificate',
        '- Honorable mentions: Gifts from sponsors',
      ].join('\n'),
    },
    faq: {
      title: 'FAQ',
      body: [
        'Q: I have never played a CTF. Can I join?',
        'A: Yes. The organizers will run an Attack‑Defense workshop and provide a practice environment before the contest.',
        'Q: How is Attack‑Defense different from Jeopardy?',
        'A: Jeopardy means solving standalone challenges; Attack‑Defense is head‑to‑head — patch your own system while attacking other teams.',
        'Q: What should we prepare?',
        'A: Each member brings a laptop with Wi‑Fi, Linux (or a VM), an SSH client, Python and WireGuard/OpenVPN.',
        'Q: Can we change members after registering?',
        'A: Yes, you can edit your team until the registration deadline.',
      ].join('\n'),
    },
    contact: {
      title: 'Contact the organizers',
      body: 'Email: mekodatactf@example.com\nFanpage: facebook.com/mekodatactf',
    },
  },
};
