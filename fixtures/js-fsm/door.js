// Door: closed, open, locked. A locked door opens only once unlocked.
export class Door {
  state = "closed";

  open() {
    if (this.state === "closed") this.state = "open";
  }

  close() {
    if (this.state === "open") {
      this.state = "closed";
    }
  }

  lock() {
    switch (this.state) {
      case "closed":
        this.state = "locked";
        break;
    }
  }

  unlock(key) {
    if (this.state === "locked" && key) this.state = "closed";
  }
}

// Counts words with a state held in a local.
export function words(s) {
  const SPACE = "space", WORD = "word";
  let state = SPACE, n = 0;
  for (const c of s) {
    if (state === SPACE && c !== " ") {
      state = WORD;
      n++;
    } else if (state === WORD && c === " ") {
      state = SPACE;
    }
  }
  return n;
}
