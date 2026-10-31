import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import Ajv from "ajv";

const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "schemas");
const ajv = new Ajv({ allErrors: true, strict: true });
const cache = new Map();

export function loadValidator(name) {
  if (!cache.has(name)) {
    const schema = JSON.parse(readFileSync(join(dir, `${name}.schema.json`), "utf8"));
    cache.set(name, ajv.compile(schema));
  }
  const validate = cache.get(name);
  return (data) => {
    const valid = validate(data);
    return { valid, errors: valid ? [] : validate.errors.map((e) => `${e.instancePath || "/"} ${e.message}`) };
  };
}
