export function toResponseBody(input: ArrayBuffer | Uint8Array) {
  if (input instanceof ArrayBuffer) return input;

  const copy = new Uint8Array(input.byteLength);
  copy.set(input);
  return copy.buffer;
}
