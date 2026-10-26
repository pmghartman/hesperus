// State of a Conn.
enum State { idle, dialing, open, closed }

// Conn walks idle, dialing, open, closed.
class Conn {
  State state = State.idle;
  int tries = 0;

  void dial() {
    if (state == State.idle) {
      state = State.dialing;
      tries++;
    }
  }

  void event(bool ok) {
    switch (state) {
      case State.dialing:
        if (ok) {
          state = State.open;
        } else if (tries < 3) {
          state = State.idle;
        } else {
          state = State.closed;
        }
        break;
      case State.open:
      case State.idle:
        if (!ok) {
          state = State.closed;
        }
        break;
      default:
        break;
    }
  }

  // close jumps to a state only known at run time.
  void close(State next) {
    state = next;
  }

  void reset() {
    state = State.idle;
  }

  bool live() {
    return state == State.open;
  }

  // shut stores a state its callers pass in, except idle.
  void shut(State to) {
    if (to != State.idle) {
      state = to;
    }
  }

  void hangup() {
    shut(State.closed);
  }

  void pause() {
    shut(State.idle);
  }
}

// words counts words with a state held in a local.
int words(String s) {
  const space = 0, word = 1;
  var state = space, n = 0;
  for (final r in s.split('')) {
    switch (state) {
      case space:
        if (r != ' ') {
          state = word;
          n++;
        }
        break;
      case word:
        if (r == ' ') {
          state = space;
        }
        break;
    }
  }
  return n;
}
