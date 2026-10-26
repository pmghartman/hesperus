namespace fsm {

// State of a Conn.
enum State { Idle, Dialing, Open, Closed };

// Conn walks Idle, Dialing, Open, Closed.
class Conn {
 public:
  Conn() : state_(Idle), tries_(0) {}

  void Dial() {
    if (state_ == Idle) {
      state_ = Dialing;
      tries_++;
    }
  }

  void Event(bool ok) {
    switch (state_) {
      case Dialing:
        if (ok) {
          state_ = Open;
        } else if (tries_ < 3) {
          state_ = Idle;
        } else {
          state_ = Closed;
        }
        break;
      case Open:
      case Idle:
        if (!ok) {
          state_ = Closed;
        }
        break;
      default:
        break;
    }
  }

  // Close jumps to a state only known at run time.
  void Close(State next) { state_ = next; }

  void Reset() { state_ = Idle; }

  bool Live() const { return state_ == Open; }

  void Hangup() { Shut(Closed); }

  void Pause() { Shut(Idle); }

 private:
  // Shut stores a state its callers pass in, except Idle.
  void Shut(State to) {
    if (to != Idle) {
      state_ = to;
    }
  }

  State state_;
  int tries_;
};

// Words counts words with a state held in a local.
int Words(const char* s) {
  const int space = 0, word = 1;
  int state = space, n = 0;
  for (; *s; s++) {
    char r = *s;
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

}  // namespace fsm
