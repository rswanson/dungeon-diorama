// Writes the starter sprites to public/sprites/ as 16x24 PNGs.
// Each sprite is rows of palette characters. "." is a transparent pixel.
// Run it with `npm run sprites` after a change to the art.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const WIDTH = 16;
const HEIGHT = 24;
const OUT = join(dirname(fileURLToPath(import.meta.url)), "../public/sprites");

/** The colors that all sprites share. */
const BASE = {
  K: "#1b1410", // outline
  F: "#e0b48a", // skin
  b: "#6b4a2b", // wood and leather
};

const SPRITES = {
  fighter: {
    palette: {
      ...BASE,
      S: "#c9ced6", // steel
      s: "#8a919c", // steel shade
      R: "#a8322a", // red tabard and crest
      B: "#2f4f8f", // shield
      Y: "#d9b440", // gold
      W: "#eef1f5", // blade
    },
    rows: [
      "................",
      "......KKKK......",
      ".....KSSSSK.....",
      "....KSSRRSSK....",
      "....KSSSSSSK....",
      "....KSKKKKSK....",
      "..K.KSFFFFSK....",
      ".KWK.KSSSSK.....",
      ".KWK.KKSSKK.....",
      ".KWKKSSSSSSKKKKK",
      ".KWKSSSRRSSKBBBK",
      ".KWKSSRRRRSKBYBK",
      "KYYYKSSRRSSKYYYK",
      ".KFKKSSRRSSKBYBK",
      ".KYKKsYYYYsKBBBK",
      "..K.KSSRRSSKKBK.",
      "....KsSRRSsK.K..",
      "....KSSKKSSK....",
      "....KSSKKSSK....",
      "....KSSKKSSK....",
      "....KsSKKSsK....",
      "...KbbbKKbbbK...",
      "...KbbbKKbbbK...",
      "...KKKKKKKKKK...",
    ],
  },
  wizard: {
    palette: {
      ...BASE,
      H: "#2c3f7a", // hat
      P: "#4a3a8c", // robe
      p: "#33286a", // robe shade
      Y: "#e3c25a", // stars and trim
      W: "#e8e4dc", // beard
      O: "#7fe0ff", // orb
    },
    rows: [
      ".......K........",
      "......KHK.......",
      "......KHK...KKK.",
      ".....KHYHK.KOOOK",
      ".....KHHHK.KOOOK",
      "....KHHHHHK.KbK.",
      "..KKHHHHHHHKKbK.",
      "....KFKFKFK.KbK.",
      "....KFFFFFK.KbK.",
      "...KPWWWWWPKKFK.",
      "..KPPWWWWWPPKFK.",
      "..KPPPWWWPPPKbK.",
      "..KPPPPWPPPPKbK.",
      "..KPPYPPPPYPKbK.",
      "..KPpPPPPPpPKbK.",
      ".KPPpPPYPPpPKbK.",
      ".KPPpPPPPPpPKbK.",
      ".KPpPPPPPPPpKbK.",
      ".KPpPPPYPPPpKbK.",
      ".KPpPPPPPPPpKbK.",
      "KPPpPPPPPPPpKbK.",
      "KPpPPPPPPPPpKbK.",
      "KYYYYYYYYYYYKbK.",
      "KKKKKKKKKKKKKKK.",
    ],
  },
  rogue: {
    palette: {
      ...BASE,
      D: "#3b3f3a", // hood
      d: "#2a2d29", // hood shade
      E: "#e8d070", // eyes in the shadow of the hood
      M: "#6e2a2a", // mask
      L: "#7a5232", // leather
      l: "#563820", // leather shade
      B: "#3d2a1a", // boots
      W: "#dfe3e8", // dagger
      Y: "#c9a640", // buckle and guard
    },
    rows: [
      "................",
      "................",
      "......KKKK......",
      ".....KDDDDK.....",
      "....KDDDDDDK....",
      "....KDddddDK....",
      "....KDEddEDK....",
      "....KDMMMMDK....",
      "...KDDKMMKDDK...",
      "..KDDLLLLLLDDK..",
      ".KDDLLLLLLLLDDK.",
      "KWKDLlLLLLlLDdK.",
      "KWKDLLbYbbLLDdK.",
      "KWKDLLLLLLLLDdK.",
      "KYYKDLLLLLLLDdK.",
      ".KFKDlLLLLLlDdK.",
      "..KKDlLLLLLlDdK.",
      "...KdDlllllDdK..",
      "...KKKllKllKKK..",
      ".....KllKllK....",
      ".....KllKllK....",
      ".....KBBKBBK....",
      "....KBBBKBBBK...",
      "....KKKKKKKKK...",
    ],
  },
  cleric: {
    palette: {
      ...BASE,
      M: "#9aa0a6", // mail
      m: "#6c7178", // mail shade
      H: "#5a5f66", // mace head
      T: "#ece6d4", // tabard
      t: "#c4bca6", // tabard shade
      Y: "#c8962a", // holy symbol and belt buckle
    },
    rows: [
      "................",
      "................",
      "......KKKK......",
      ".....KMMMMK.....",
      ".KK.KMMMMMMK....",
      "KHHKKMFFFFMK....",
      "KHHKKMKFFKMK....",
      ".KbK.KMFFMK.....",
      ".KbK.KMMMMK.....",
      ".KbKKMMMMMMMK...",
      ".KFMMTTTTTTMMK..",
      "...KMTTYYTTKMK..",
      "...KMTYYYYTKMK..",
      "...KMTTYYTTKMK..",
      "...KMTTTTTTKFK..",
      "...KKbbYbbbKK...",
      "....KTTTTTTK....",
      "....KtTTTTtK....",
      "....KMMKKMMK....",
      "....KMMKKMMK....",
      "....KmMKKMmK....",
      "...KbbbKKbbbK...",
      "...KbbbKKbbbK...",
      "...KKKKKKKKKK...",
    ],
  },
  goblin: {
    palette: {
      ...BASE,
      G: "#6aa23a", // skin
      g: "#4a7a28", // skin shade
      E: "#f0d040", // eyes
      T: "#f4f0e0", // teeth
      L: "#7a5a36", // rags
      l: "#5a3f24", // rags shade
      W: "#b8b8b0", // spear tip
    },
    // The rows above the spear are empty, so the goblin stands shorter.
    rows: [
      "................",
      "................",
      "................",
      "................",
      "................",
      "..............K.",
      ".............KWK",
      ".............KWK",
      ".............KbK",
      "....KKKKK....KbK",
      "KK.KGGGGGK.KKKbK",
      "KGGGEGGGEGGGKKbK",
      ".KGGKTTTKGGK.KbK",
      "...KgGGGgK...KbK",
      "....KgGgK....KbK",
      "..KKLLLLLLKK.KbK",
      ".KGKLlLLlLKGGKFK",
      ".KGKLLLLLLKKKKbK",
      ".KFKLlLLlLK..KbK",
      "..K.KLLLLK...KbK",
      "....KGKKGK...KbK",
      "....KGKKGK...KbK",
      "...KGGKKGGK..KbK",
      "...KKKKKKKK..KKK",
    ],
  },
  orc: {
    palette: {
      ...BASE,
      O: "#7d8c5c", // skin
      o: "#5b6a42", // skin shade
      D: "#2a2420", // hair
      E: "#c83a2a", // eyes
      T: "#f0ead8", // tusks
      A: "#a8acb0", // axe head and shoulder plates
      L: "#5a3c24", // leather
      l: "#3d2818", // leather shade
      Y: "#b08a3a", // buckle
    },
    rows: [
      "................",
      "................",
      "...K...KKKKK....",
      "..KbK.KDDDDDK...",
      ".KAbK.KOOOOOK...",
      "KAAbK.KOEOEOK...",
      "KAAbK.KOOOOOK...",
      "KAAbK.KTOOOTK...",
      ".KAbKKKoOOOoKKK.",
      "..KbKAAKOOOKAAK.",
      "..KFKAAOOOOOAAK.",
      "..KbKOOoOOOoOOK.",
      "..KbKOOOoOoOOOK.",
      "..KbKLLLLLLLLLK.",
      "..KbKLlLLYLLlLK.",
      "..KKKLLLLLLLLLK.",
      "....KlLLLLLLlK..",
      "....KlLlLLlLlK..",
      "....KOOOKKOOOK..",
      "....KOOOKKOOOK..",
      "....KoOOKKOOoK..",
      "...KLLLLKKLLLLK.",
      "...KlllLKKLlllK.",
      "...KKKKKKKKKKKK.",
    ],
  },
};

/** The RGBA bytes of a sprite. It throws on a row of the wrong size or an unknown character. */
function pixels(name, { palette, rows }) {
  if (rows.length !== HEIGHT) {
    throw new Error(`${name}: ${rows.length} rows, not ${HEIGHT}.`);
  }
  const rgba = Buffer.alloc(WIDTH * HEIGHT * 4);
  rows.forEach((row, y) => {
    if (row.length !== WIDTH) {
      throw new Error(`${name} row ${y}: ${row.length} pixels, not ${WIDTH}.`);
    }
    [...row].forEach((ch, x) => {
      if (ch === ".") return;
      const hex = palette[ch];
      if (!hex) throw new Error(`${name} row ${y}: no color for "${ch}".`);
      const i = (y * WIDTH + x) * 4;
      rgba.writeUIntBE(parseInt(hex.slice(1), 16), i, 3);
      rgba[i + 3] = 255;
    });
  });
  return rgba;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes) {
  let c = 0xffffffff;
  for (const byte of bytes) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** A PNG of 8-bit RGBA pixels, with no filter on each row. */
function encodePng(width, height, rgba) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bits per channel
  header[9] = 6; // RGBA
  const raw = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) {
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

mkdirSync(OUT, { recursive: true });
for (const [name, sprite] of Object.entries(SPRITES)) {
  const file = join(OUT, `${name}.png`);
  writeFileSync(file, encodePng(WIDTH, HEIGHT, pixels(name, sprite)));
  console.log(`Wrote ${file}`);
}
