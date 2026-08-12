/**
 * Dependency-free ZIP writer.
 *
 * Files are stored uncompressed (method 0) with a classic central
 * directory, so the exact bytes round-trip. Good enough for the small
 * file sets we ship (a scaffolded codebase).
 */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const u16 = (v) => [v & 0xff, (v >>> 8) & 0xff];
const u32 = (v) => [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff];

/**
 * `files` is `{ 'path/to/file.ext': 'contents' }`. Returns a Blob you
 * can hand to `URL.createObjectURL`.
 */
export function zipFiles(files) {
  const enc = new TextEncoder();
  const entries = Object.entries(files);

  const now = new Date();
  const time = ((now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)) & 0xffff;
  const date =
    ((((now.getFullYear() - 1980) & 0x7f) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()) &
    0xffff;

  const local = [];
  const central = [];
  let offset = 0;

  const flags = 0x0800; // UTF-8 encoded names & content flags

  for (const [name, content] of entries) {
    const data = enc.encode(content);
    const nameBytes = enc.encode(name);
    const crc = crc32(data);
    const size = data.length;

    local.push(
      ...u32(0x04034b50),
      ...u16(20), // version needed
      ...u16(flags), // general purpose flags
      ...u16(0), // method: stored
      ...u16(time),
      ...u16(date),
      ...u32(crc),
      ...u32(size),
      ...u32(size),
      ...u16(nameBytes.length),
      ...u16(0) // extra length
    );
    local.push(...nameBytes);
    local.push(...data);

    central.push(
      ...u32(0x02014b50),
      ...u16(20), // version made by
      ...u16(20), // version needed
      ...u16(flags), // general purpose flags
      ...u16(0), // method: stored
      ...u16(time),
      ...u16(date),
      ...u32(crc),
      ...u32(size),
      ...u32(size),
      ...u16(nameBytes.length),
      ...u16(0), // extra length
      ...u16(0), // comment length
      ...u16(0), // disk number
      ...u16(0), // internal attributes
      ...u32(0), // external attributes
      ...u32(offset)
    );
    central.push(...nameBytes);

    offset += 30 + nameBytes.length + size;
  }

  const eocd = [
    ...u32(0x06054b50),
    ...u16(0), // this disk
    ...u16(0), // central dir disk
    ...u16(entries.length),
    ...u16(entries.length),
    ...u32(central.length),
    ...u32(local.length),
    ...u16(0), // comment length
  ];

  const all = new Uint8Array(local.length + central.length + eocd.length);
  all.set(local, 0);
  all.set(central, local.length);
  all.set(eocd, local.length + central.length);

  return new Blob([all], { type: 'application/zip' });
}