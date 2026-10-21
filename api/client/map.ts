export function mapMapValues<K, VI, VO>(m: Map<K, VI>, fn: (vi: VI) => VO): Map<K, VO> {
  return mapMapKeyValues(m, (ki, vi) => [ki, fn(vi)]);
}

export function mapMapKeyValues<KI, KO, VI, VO>(m: Map<KI, VI>, fn: (ki: KI, vi: VI) => [KO, VO]) {
  return new Map(m.entries().map(([ki, vi]) => fn(ki, vi)));
}
