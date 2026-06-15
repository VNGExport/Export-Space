# ExportSpace — Department Community

แพลตฟอร์ม Community สำหรับแผนก Export & Logistics
ดีไซน์คล้าย Facebook ใช้งานได้ผ่าน Email บริษัทเท่านั้น

## Stack

| Layer | เครื่องมือ | หมายเหตุ |
|-------|-----------|---------|
| Frontend | HTML + CSS + Vanilla JS | ไม่ต้อง build step |
| Font | IBM Plex Sans Thai | อ่านง่าย, รองรับภาษาไทยเต็มรูปแบบ |
| Icons | Tabler Icons | 5,800+ icons, free |
| Hosting | Vercel | Free tier, auto-deploy จาก GitHub |
| Database | Google Sheets API | ฟรี, แก้ไขได้โดยตรง |
| Auth | Google OAuth 2.0 | จำกัด domain บริษัทเท่านั้น |

## วิธี Deploy

### 1. Push ขึ้น GitHub
```bash
git init
git add .
git commit -m "initial: ExportSpace community"
git remote add origin https://github.com/YOUR_ORG/exportspace.git
git push -u origin main
```

### 2. Connect Vercel
1. ไปที่ vercel.com → New Project
2. Import จาก GitHub repo ที่สร้าง
3. Framework Preset: **Other**
4. Root Directory: `/` (ค่าเริ่มต้น)
5. กด **Deploy**

### 3. ตั้งค่า Google OAuth (จำกัดแค่ email บริษัท)
1. ไปที่ [console.cloud.google.com](https://console.cloud.google.com)
2. สร้าง Project ใหม่ → APIs & Services → Credentials
3. Create OAuth 2.0 Client ID
4. Authorized origins: `https://your-site.vercel.app`
5. ใน OAuth consent screen → เพิ่ม **hd (hosted domain)**: `company.co.th`
6. ใส่ Client ID ใน `config.js`

### 4. Google Sheets API (Database)
สร้าง Google Sheet ด้วย columns:
```
Posts:  id | author | dept | content | tag | created_at | likes
Board:  id | author | title | tag | priority | created_at | pinned
Links:  id | name | url | type | created_by
Events: id | title | date | description | priority
```

Enable Google Sheets API → ใช้ Service Account หรือ Apps Script เป็น middleware

## โครงสร้างไฟล์
```
exportspace/
├── index.html     — หน้าหลัก + โครงสร้าง HTML ทุกหน้า
├── style.css      — Design System + ธีม Light/Dark/Navy
├── app.js         — Navigation, Posts, Settings, Links
├── vercel.json    — Vercel deployment config
└── README.md      — คู่มือนี้
```

## Features
- ✅ Feed โพสต์ + ถูกใจ
- ✅ กระดานข่าว (Board) พร้อม priority tag
- ✅ My Space — โปรไฟล์ส่วนตัว
- ✅ ปฏิทินทีม
- ✅ ตั้งค่า: ธีม Light/Dark/Navy, Accent color, ขนาดฟอนต์, ฟอนต์
- ✅ Quick Links — เพิ่ม/ลบได้เอง บันทึกใน localStorage
- ✅ Toast notifications
- ✅ Responsive + Dark mode
- ✅ Keyboard accessible

## License
Internal use only — Company confidential
