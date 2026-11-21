const MAX_WIDTH = 400;
const MAX_HEIGHT = 400;
const QUALITY = 0.8;

export async function makeThumbnail(url: string) {
  const img = new Image();
  await new Promise((res, rej) => {
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = url;
  });
  let { width, height } = img;
  if (width > height) {
    if (width > MAX_WIDTH) {
      height = Math.round((height * MAX_WIDTH) / width);
      width = MAX_WIDTH;
    }
  } else {
    if (height > MAX_HEIGHT) {
      width = Math.round((width * MAX_HEIGHT) / height);
      height = MAX_HEIGHT;
    }
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (ctx === null) {
    throw new Error("canvas context was null");
  }
  ctx.drawImage(img, 0, 0, width, height);
  const blob = await new Promise<Blob>((res, rej) => {
    canvas.toBlob(
      (blob) => {
        if (blob === null) return rej(new Error("canvas blob was null"));
        res(blob);
      },
      "image/jpeg",
      QUALITY,
    );
  });
  return { type: "image/jpeg", data: await blob.bytes() };
}
