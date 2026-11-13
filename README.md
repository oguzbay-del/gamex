# Zirve Koşusu

Çift zıplamalı, üç seviyeli bir 2D platform oyunu. Koş, zıpla, hareketli platformlara bin, paraları topla ve zirvedeki bayrağa ulaş.

## Nasıl oynanır

| Tuş | İşlem |
| --- | --- |
| `A` / `←` | Sola koş |
| `D` / `→` | Sağa koş |
| `W` / `↑` / `Boşluk` | Zıpla. Havada bir kez daha basınca çift zıplama |
| `S` / `↓` | Tek yönlü platformdan aşağı geç |
| `Esc` | Duraklat / devam et |

Telefonda ekrandaki yön ve zıplama düğmeleri aynı işi görür.

## İçindekiler

- Koşma, değişken yükseklikli zıplama ve çift zıplama
- Yatay ve dikey hareketli platformlar
- Toplanan paralar ve ekrandaki sayaç
- Diken ve çukur tehlikeleri
- Kontrol noktası: ölünce son noktadan devam, toplanan paralar durur
- Seviyeyi bitiren hedef bayrağı
- Seviye seçimi, kilit açma ve ölümde yeniden başlatma
- En iyi süre ve para kaydı (tarayıcıda saklanır)

Kaynak: `src/game` (fizik, seviyeler, çizim, ses), arayüz `src/components/platform-game.tsx`.

## Çalıştırma

Node.js 22.

```bash
npm install
npm run dev
```

Oyun `http://localhost:8080` adresinde açılır.

```bash
npm run typecheck
npm run build
```

## Yığın

React, TanStack Start, Tailwind CSS ve Canvas 2D. Karakter, platformlar ve arka plan kodla çizilir; harici bir sprite paketi gerekmez.
