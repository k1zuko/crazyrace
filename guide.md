# Crazy Race - Game Guide

## 1. Pendahuluan
**Crazy Race** adalah sebuah platform game edukasi interaktif multiplayer berbasis web yang menggabungkan elemen kuis kompetitif dengan minigame balapan (racing). Game ini dirancang dengan estetika retro-pixel yang unik, efek layar CRT, dan elemen visual neon, memberikan pengalaman bermain yang menyenangkan sekaligus menantang. Game ini terintegrasi dalam ekosistem **GameForSmart**.

## 2. Deskripsi Game
Crazy Race memungkinkan seorang Host (misalnya guru atau presenter) untuk membuat sesi kuis dan mengundang para pemain (peserta) melalui sebuah Game PIN (Room Code) yang terdiri dari 6 karakter.
Uniknya, Crazy Race tidak hanya menguji pengetahuan melalui soal pilihan ganda, tetapi juga menyisipkan **Racing Minigame** (Minigame Balapan) setiap kali pemain berhasil menjawab sejumlah soal tertentu (setiap 3 soal). Kesulitan kuis yang dipilih oleh Host akan menentukan trek balapan yang akan dimainkan oleh peserta.

## 3. Fitur Utama
*   **Retro Pixel Art Aesthetic:** Tampilan UI dengan tema retro, font pixel, efek CRT/scanline, dan warna neon (cyan & pink) yang memanjakan mata.
*   **Mode Kuis & Balapan Terintegrasi:** Peralihan mulus antara menjawab soal kuis dan bermain game balapan HTML5 (Racing Game).
*   **Real-time Multiplayer:** Sinkronisasi real-time antara Host dan Pemain menggunakan teknologi Supabase Realtime.
*   **PWA (Progressive Web App):** Game dapat diinstal langsung ke perangkat (Mobile/Desktop) seperti aplikasi native.
*   **Dukungan Multi-Bahasa (i18n):** Tersedia dalam bahasa Inggris (English), Indonesia (Bahasa Indonesia), dan Arab (العربية).
*   **Pemindai QR Code:** Pemain dapat bergabung ke dalam ruangan (room) dengan memindai QR code secara langsung dari kamera perangkat mereka.
*   **Generator Nickname Otomatis:** Pemain yang tidak login dapat menggunakan fitur pembuatan nama acak (kombinasi Kata Sifat + Kata Benda).
*   **Manajemen Kuis (Host):** Host dapat mencari kuis, memfilter berdasarkan kategori, dan menandai kuis favorit.
*   **Media Pendukung:** Kuis mendukung penggunaan gambar pada soal maupun pada opsi jawaban (dengan fitur *zoom-in* gambar).

## 4. Alur Permainan (Game Flow)

### A. Persiapan Host (Pembuat Game)
1.  **Akses Halaman Host:** Host membuka halaman utama dan masuk ke mode manajemen kuis.
2.  **Pilih Kuis:** Host mencari dan memilih kuis yang tersedia di dalam database.
3.  **Buat Room:** Setelah kuis dipilih, sistem akan men-generate sebuah **Game PIN** (6 karakter acak).
4.  **Pengaturan & Lobby:** Host mengatur tingkat kesulitan kuis (Easy, Normal, Hard). Tingkat kesulitan ini akan menentukan sirkuit balapan (Straight, Curves, atau Final). Host kemudian menunggu di **Lobby** sampai semua pemain bergabung.
5.  **Mulai Permainan:** Setelah pemain dirasa cukup, Host menekan tombol mulai untuk memulai permainan secara sinkron.

### B. Alur Pemain (Peserta)
1.  **Masuk (Join):** Pemain memasukkan **Game PIN** 6 karakter dan **Nickname** di halaman utama (Homepage), atau cukup memindai QR Code yang disediakan Host.
2.  **Menunggu di Lobby:** Pemain masuk ke ruang tunggu (Lobby) dan bersiap-siap menunggu Host memulai permainan.
3.  **Fase Kuis:** 
    *   Soal kuis akan muncul di layar pemain. Urutan soal diacak secara spesifik untuk setiap pemain agar mencegah kecurangan.
    *   Pemain memilih jawaban dari opsi yang tersedia.
    *   Waktu hitung mundur (timer) akan terus berjalan.
4.  **Fase Minigame Balapan:**
    *   Setiap kali pemain selesai menjawab 3 soal secara berturut-turut, layar akan otomatis beralih (switch) ke mode **Racing Minigame**.
    *   Pemain akan memainkan game balapan mobil singkat.
    *   Setelah balapan selesai, pemain akan otomatis dikembalikan ke soal kuis berikutnya.
5.  **Fase Hasil (Result/Leaderboard):**
    *   Permainan berakhir ketika waktu sesi telah habis atau pemain telah menyelesaikan seluruh soal.
    *   Pemain akan diarahkan ke halaman **Result/Leaderboard** untuk melihat skor akhir, peringkat klasemen, dan statistik permainan.

## 5. Integrasi Teknologi
*   **Frontend:** Dibangun menggunakan React dan **Next.js 14** (App Router).
*   **Styling & UI:** Tailwind CSS, Framer Motion (untuk animasi transisi), dan komponen Radix UI.
*   **Backend & Database:** **Supabase** (PostgreSQL) digunakan untuk autentikasi, database, Remote Procedure Calls (RPC), dan komunikasi *real-time* via Supabase Channels.
*   **Minigame Balapan:** Menggunakan *iframe* yang menyematkan file game HTML5 independen (`v1.straight.html`, `v2.curves.html`, `v4.final.html`).

---
*Guide ini disusun berdasarkan struktur kode dan fungsionalitas utama yang terdapat pada repositori Crazy Race.*
