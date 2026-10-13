import { useEffect, useState } from "react";

export function TimeAgo({
  time,
  largestUnit = "days",
  smallestUnit = "minutes",
}: {
  time: Temporal.Instant;
  largestUnit?: Temporal.DurationRoundingOptions["largestUnit"];
  smallestUnit?: Temporal.DurationRoundingOptions["smallestUnit"];
}) {
  const [now, setNow] = useState(Temporal.Now.instant());
  const delta = now.since(time).round({ largestUnit, smallestUnit });
  useEffect(() => {
    const interval = Math.max(
      Temporal.Duration.from({ [smallestUnit]: 1 }).total("milliseconds"),
      1000,
    );
    const intervalId = setInterval(() => setNow(Temporal.Now.instant()), interval);
    return () => clearInterval(intervalId);
  }, [setNow, smallestUnit]);
  if (delta.total("minutes") === 0) {
    return <>just now</>;
  } else {
    return <>{delta.toLocaleString()} ago</>;
  }
}
