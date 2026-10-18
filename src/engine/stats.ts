/**
 * Two-proportion z-test with pooled proportion.
 * @param p1 Proportion 1 (0 to 1, calculated from weighted percentage)
 * @param n1 Unweighted base 1
 * @param p2 Proportion 2 (0 to 1, calculated from weighted percentage)
 * @param n2 Unweighted base 2
 * @returns +1 if p1 significantly > p2, -1 if p1 significantly < p2, 0 otherwise (|z| > 1.96)
 */
export function twoProportionZTest(
  p1: number,
  n1: number,
  p2: number,
  n2: number
): -1 | 0 | 1 {
  if (n1 <= 0 || n2 <= 0) return 0

  const pooledP = (p1 * n1 + p2 * n2) / (n1 + n2)
  if (pooledP <= 0 || pooledP >= 1) return 0

  const se = Math.sqrt(pooledP * (1 - pooledP) * (1 / n1 + 1 / n2))
  if (se === 0 || isNaN(se)) return 0

  const z = (p1 - p2) / se
  if (z > 1.96) return 1
  if (z < -1.96) return -1
  return 0
}
