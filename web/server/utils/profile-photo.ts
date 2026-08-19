export const MAX_PHOTO_BYTES = 5 * 1024 * 1024

export function detectProfilePhoto(data: Uint8Array) {
  if (!data.length || data.length > MAX_PHOTO_BYTES) return null
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return 'image/jpeg'
  if (data.length >= 8 && data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47 && data[4] === 0x0d && data[5] === 0x0a && data[6] === 0x1a && data[7] === 0x0a) return 'image/png'
  const ascii = (start: number, end: number) => String.fromCharCode(...data.slice(start, end))
  if (data.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp'
  return null
}
