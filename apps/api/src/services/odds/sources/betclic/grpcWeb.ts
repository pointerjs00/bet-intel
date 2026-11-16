/**
 * gRPC-web framing (binary `application/grpc-web+proto`), pure.
 *
 * Every message is a frame: 1 flag byte, a 4-byte big-endian length, then the bytes.
 * Flag 0x00 is a data frame (protobuf); flag 0x80 is the trailer frame, whose body is
 * HTTP/1-style header lines (`grpc-status: 0\r\ngrpc-message: ...\r\n`).
 */

const HEADER = 5;
const TRAILER_FLAG = 0x80;

/** Prefixes protobuf bytes with the 5-byte data-frame header. */
export function encodeFrame(bytes: Uint8Array): Uint8Array {
  const out = new Uint8Array(HEADER + bytes.length);
  out[0] = 0;
  new DataView(out.buffer).setUint32(1, bytes.length, false);
  out.set(bytes, HEADER);
  return out;
}

export interface ReadFrames {
  /** Complete data frames, in order (bytes without the header). */
  data: Uint8Array[];
  /** Trailer headers (lower-case names), when the trailer frame is complete. */
  trailers: Record<string, string> | null;
  /** `grpc-status` from the trailer, when present. */
  grpcStatus: number | null;
  /** `grpc-message` from the trailer (percent-decoded), when present. */
  grpcMessage: string | null;
  /** Bytes of an incomplete frame at the end of the buffer (wait for more). */
  rest: Uint8Array;
}

/** Parses the trailer frame body into lower-case header names. */
function parseTrailers(body: Uint8Array): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of Buffer.from(body).toString('utf8').split(/\r?\n/)) {
    const i = line.indexOf(':');
    if (i <= 0) continue;
    out[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim();
  }
  return out;
}

function decodeMessage(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/** Splits a buffer into complete data frames and the trailer; an incomplete tail is returned in `rest`. */
export function readFrames(buffer: Uint8Array): ReadFrames {
  const data: Uint8Array[] = [];
  let trailers: Record<string, string> | null = null;
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  let pos = 0;
  while (buffer.length - pos >= HEADER) {
    const flag = buffer[pos]!;
    const len = view.getUint32(pos + 1, false);
    if (buffer.length - pos - HEADER < len) break;
    const body = buffer.subarray(pos + HEADER, pos + HEADER + len);
    if (flag & TRAILER_FLAG) trailers = { ...(trailers ?? {}), ...parseTrailers(body) };
    else data.push(body);
    pos += HEADER + len;
  }
  const status = trailers?.['grpc-status'];
  const message = trailers?.['grpc-message'];
  return {
    data,
    trailers,
    grpcStatus: status !== undefined && /^\d+$/.test(status) ? Number(status) : null,
    grpcMessage: message !== undefined ? decodeMessage(message) : null,
    rest: buffer.subarray(pos),
  };
}
