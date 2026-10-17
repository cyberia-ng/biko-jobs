import { updateCanvas } from "jdenticon";
import { useEffect, useRef } from "react";

export function Jdenticon({
  value,
  className,
  width,
  height,
}: {
  value: Uint8Array<ArrayBuffer>;
  className?: string;
  width?: number;
  height?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    crypto.subtle
      .digest("SHA-256", value)
      .then((hash) => new Uint8Array(hash).toHex())
      .then((hashStr) => canvasRef.current !== null && updateCanvas(canvasRef.current, hashStr));
  }, [canvasRef, value]);
  return <canvas ref={canvasRef} className={className} width={width} height={height} />;
}
