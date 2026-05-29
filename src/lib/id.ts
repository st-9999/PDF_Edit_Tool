let counter = 0;

/**
 * 一意な ID を生成する。crypto.randomUUID があれば使用し、
 * 無い環境ではプレフィックス付きの連番にフォールバックする。
 */
export function createId(prefix = "id"): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  counter += 1;
  return `${prefix}-${counter}`;
}
