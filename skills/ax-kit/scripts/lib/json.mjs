export function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export const isJsonObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
