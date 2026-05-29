# Sheets Reader

แอป macOS อ่าน Google Sheets แสดงเป็น Kanban board พร้อม **ไอคอนที่ menubar** (ปิดหน้าต่างแล้วยังรันอยู่)

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

## การเชื่อมต่อ Google Sheets

1. Share ชีท → **Anyone with the link** (Viewer)
2. วางลิงก์ในแอป → กด ⚙ → **อ่านข้อมูล**
3. ระบุแท็บ เช่น `FE-tasks, Bugs`

## ฟีเจอร์

- Kanban board จัดกลุ่มตาม Status
- กรอง Assignee, Action, Status
- อ่านหลายแท็บตามชื่อ (ไม่โหลดทั้งชีท)
- คัดลอกสรุปงานเป็น text

## โครงสร้าง

| ส่วน | เทคโนโลยี |
|------|-----------|
| UI | Vue 3 + TypeScript |
| Backend | Rust (Tauri 2) |
| Menubar | Tauri Tray API |
