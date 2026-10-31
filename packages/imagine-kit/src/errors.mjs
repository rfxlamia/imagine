export class UsageError extends Error {}

export class KitError extends Error {
  constructor(code, message, { rule, item, detail } = {}) {
    super(message);
    this.code = code;
    this.rule = rule;
    this.item = item;
    this.detail = detail;
  }
}
