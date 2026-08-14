# Spyfall Connected — Standalone Repo

เว็บช่วยเล่น social deduction แบบหลายเครื่อง ใช้ Firebase Realtime Database + Anonymous Authentication

## ฟีเจอร์

- Host สร้างห้องและเล่นเป็นผู้เล่นคนหนึ่งได้
- Room Code 6 ตัวขึ้นต้นด้วย `S`
- รองรับผู้เล่นอย่างน้อย 3 คน
- สุ่ม Spy 1 คนต่อรอบ
- ผู้เล่นทั่วไปเห็นสถานที่เดียวกัน + บทบาทเฉพาะตัว
- Spy ไม่เห็นสถานที่และสามารถเดาสถานที่ได้ 1 ครั้ง
- Timer 6 / 8 / 10 / 12 นาที
- ระบบกล่าวหา + Hidden Yes/No Vote
- ผู้ถูกกล่าวหาไม่มีสิทธิ์โหวต
- ต้องโหวต “ใช่” เป็นเอกฉันท์จึงถือว่าจับได้
- กล่าวหาผิดคน = Spy ชนะ
- Spy เดาถูก = Spy ชนะ / เดาผิด = ฝ่ายผู้เล่นชนะ
- หมดเวลา = Spy ชนะ
- เริ่มรอบใหม่ได้ทันที
- Location deck ต้นฉบับ 24 สถานที่ พร้อมบทบาทย่อย

## ไฟล์

- `index.html` — Host
- `player.html` — Player Companion
- `host.js` — Host room/game engine
- `player.js` — Player join/private card/vote/Spy guess
- `game-core.js` — Location deck + random assignment helpers
- `theme.css` — UI
- `firebase-config.js` — Firebase Web config
- `firebase.rules.json` — Realtime Database Security Rules สำหรับ Spyfall standalone

## วิธีเล่น

1. Host เปิด `index.html` ใส่ชื่อและเลือกเวลา
2. กด **สร้างห้อง** แล้วส่งลิงก์ผู้เล่น
3. ผู้เล่นเปิด `player.html` และเข้า Room Code เดียวกัน
4. เมื่อมีอย่างน้อย 3 คน Host กด **เริ่มรอบ**
5. ทุกคนแตะดูการ์ดลับของตัวเอง
6. เล่นถาม-ตอบกันบนโต๊ะ
7. Host สามารถกด **กล่าวหา Spy** เลือกผู้ต้องสงสัย แล้วเปิดโหวตลับ
8. ถ้าทุกคนที่มีสิทธิ์โหวต `ใช่` ระบบตัดสินผลทันที
9. Spy สามารถเลือกเดาสถานที่จากเครื่องตัวเองได้หนึ่งครั้ง
10. หมดเวลาหรือมีเงื่อนไขชนะ ระบบจบรอบและเปิดตัว Spy/สถานที่ตามผล

## Firebase Setup

แพ็กเกจนี้ใส่ Firebase config ของโปรเจกต์เดิมไว้แล้ว ถ้าจะใช้ backend เดิมให้ทำสองอย่างใน Firebase Console:

1. Authentication → Sign-in method → เปิด **Anonymous**
2. Realtime Database → Rules → วางเนื้อหาจาก `firebase.rules.json` แล้ว Publish

> สำคัญ: `firebase.rules.json` ใน ZIP นี้เป็นกฎสำหรับ **Spyfall standalone** หาก Firebase project เดียวกันยังใช้ WereWolf/Insider อยู่ ห้ามเอากฎ standalone นี้ไปทับ production rules ของสองเกมเดิม ให้ใช้ Firebase project แยก หรือ merge rules อย่างระมัดระวัง

ถ้าต้องการแยก Firebase project ใหม่ ให้สร้าง Web App + Realtime Database แล้วแก้ค่าใน `firebase-config.js`


## ถ้ากด “เริ่มรอบ” แล้วไม่เกิดอะไรขึ้น

สาเหตุเกือบทั้งหมดคือ Authentication ใช้งานได้ แต่ **Realtime Database Rules ยังเป็นของเกมเดิม** ทำให้หน้าเว็บขึ้น `Firebase พร้อม` แต่การแจก Role ถูก Firebase ปฏิเสธ

เวอร์ชัน 1.1 จะตรวจสิทธิ์ก่อนเริ่มรอบ และแจ้ง `Firebase Rules ยังไม่พร้อม` พร้อมวิธีแก้แทนการเงียบ

ให้เปิด Firebase Console → **Realtime Database → Rules** → วาง `firebase.rules.json` จากแพ็กเกจนี้ → **Publish** แล้ว Refresh หน้า Host

> ถ้า Firebase Project เดียวกันยังใช้ WereWolf/Insider อยู่ อย่า Publish Rules standalone นี้ทับ ให้สร้าง Firebase Project แยกสำหรับ Spyfall หรือ merge rules ก่อน

## GitHub Pages

1. สร้าง Repo ใหม่ เช่น `Spyfall-Board-Game`
2. แตก ZIP แล้วอัปโหลดไฟล์ทั้งหมดไว้ที่ root ของ repo
3. Settings → Pages
4. Deploy from a branch → `main` → `/ (root)`

URL โดยทั่วไปจะเป็น:

- Host: `https://USERNAME.github.io/Spyfall-Board-Game/`
- Player: `https://USERNAME.github.io/Spyfall-Board-Game/player.html`

## Privacy / Anti-cheat

- `private/<uid>` อ่านได้เฉพาะเจ้าของ uid
- `hostSecret` อ่านได้เฉพาะ Host engine
- คะแนน accusation เขียนได้ครั้งเดียวต่อคน
- ผู้ถูกกล่าวหาเขียนคะแนนไม่ได้
- Spy guess เขียนได้เฉพาะ uid ที่ถูกแจก `isSpy = true` และเฉพาะระหว่างรอบที่กำลังเล่น

อย่างไรก็ตามแอปนี้ยังเป็น client-only: Host browser เป็นผู้สุ่มและเขียนข้อมูลลับ จึงไม่สามารถป้องกัน Host ที่ตั้งใจ inspect DevTools/Firebase traffic ได้แบบ 100% หากต้องการ cheat-resistant Host-as-player จริง ควรย้ายการสุ่ม/resolve secret ไป trusted backend เช่น Cloud Functions
