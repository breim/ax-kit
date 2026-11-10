import { isJsonObject } from '../json.mjs';

const METHODS = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'];

export const operationsOf = (document) =>
  Object.entries(document.paths).flatMap(([path, item]) =>
    METHODS.filter((method) => isJsonObject(item?.[method])).map((method) => ({ path, method, operation: item[method] })),
  );
