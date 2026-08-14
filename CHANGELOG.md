# Changelog

## 1.1

- แก้ปุ่ม “เริ่มรอบ” ที่ดูเหมือนไม่ทำงานเมื่อ Firebase Rules ยังไม่ได้ Publish
- เพิ่ม pre-flight check สำหรับ Host-only `hostSecret`
- แสดงข้อความ `PERMISSION_DENIED` พร้อมขั้นตอนแก้แทนการ fail แบบเงียบ
- หลัง Host refresh/reopen room จะตั้ง `connected: true` ใหม่ ทำให้สถานะ online ไม่ค้างเป็นจุดเทา
- เพิ่ม error handling ตอนสร้างห้องและเริ่มรอบ
