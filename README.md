# Google Sheets Reader (Tauri + Vue)

แอป macOS อ่าน Google Sheets สรุปงานตามชื่อ พร้อม **ไอคอนที่ menubar** (ปิดหน้าต่างแล้วยังรันอยู่)

## ความต้องการ

- macOS 10.15+
- [Node.js](https://nodejs.org/) 18+
- [Rust](https://rustup.rs/)

## ติดตั้งและรัน

```bash
cd ~/Projects/macos-space/sheets-reader
npm install
npm run tauri dev
```

Build แบบ release:

```bash
npm run tauri build
```

ไฟล์ `.app` จะอยู่ที่ `src-tauri/target/release/bundle/macos/`

## การใช้ menubar

- ปิดหน้าต่าง (ปุ่มแดง) = **ซ่อน** แอป ไม่ได้ออกจากแอป
- คลิกไอคอนที่ **menubar** เพื่อเปิด/ซ่อนหน้าต่าง
- คลิกขวาที่ไอคอน → เมนู เปิด / ซ่อน / ออกจากแอป

## โหมดอ่านข้อมูล

### ลิงก์ public (แนะนำ)

1. Share ชีท → **Anyone with the link** (Viewer)
2. วางลิงก์ในแอป → กด **อ่านข้อมูล**

### Service Account

1. สร้าง key จาก Google Cloud (เปิด Sheets API)
2. Share ชีทให้อีเมล `client_email` ในไฟล์ JSON
3. เลือกไฟล์ key ในแอป + ระบุ Range เช่น `Sheet1!A1:Z1000`

## สรุปงาน

- นับจำนวนงานที่ตรงชื่อ (เช่น POND)
- รายการแบบ bullet (`•`) ในช่องข้อความ — **คัดลอกง่าย** (⌘A / ⌘C)
- เลือกคอลัมน์ค้นหา / กรองเฉพาะงานที่ตรง / แสดงตารางเต็ม (tab)

## โครงสร้าง

| ส่วน | เทคโนโลยี |
|------|-----------|
| UI | Vue 3 + TypeScript |
| Backend | Rust (Tauri 2) |
| Menubar | Tauri Tray API |

โค้ด Swift เดิมเก็บไว้ที่ `legacy-swift/` (ไม่ใช้แล้ว)
