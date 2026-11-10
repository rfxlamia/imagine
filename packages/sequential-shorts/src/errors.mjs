export class UsageError extends Error {}

// code: HARD | HARD_NOT_RUN | BLOCKED | CONFLICT. `check` names the pipeline step; `item` the file or part.
export class ShortsError extends Error {
  constructor(code, message, { check = null, item = null, detail, notRun = [], warnings = [] } = {}) {
    super(message);
    this.code = code;
    this.check = check;
    this.item = item;
    this.detail = detail;
    this.notRun = notRun;
    this.warnings = warnings;
  }
}
