// State of a Conn.
#[derive(Clone, Copy, PartialEq)]
pub enum State {
    Idle,
    Dialing,
    Open,
    Closed,
}

// Conn walks Idle, Dialing, Open, Closed.
pub struct Conn {
    state: State,
    tries: u32,
}

impl Conn {
    pub fn new() -> Conn {
        Conn { state: State::Idle, tries: 0 }
    }

    pub fn dial(&mut self) {
        if self.state == State::Idle {
            self.state = State::Dialing;
            self.tries += 1;
        }
    }

    pub fn event(&mut self, ok: bool) {
        match self.state {
            State::Dialing => {
                if ok {
                    self.state = State::Open;
                } else if self.tries < 3 {
                    self.state = State::Idle;
                } else {
                    self.state = State::Closed;
                }
            }
            State::Open | State::Idle => {
                if !ok {
                    self.state = State::Closed;
                }
            }
            _ => {}
        }
    }

    // Close jumps to a state only known at run time.
    pub fn close(&mut self, next: State) {
        self.state = next;
    }

    pub fn reset(&mut self) {
        self.state = State::Idle;
    }

    pub fn live(&self) -> bool {
        self.state == State::Open
    }

    // shut stores a state its callers pass in, except Idle.
    fn shut(&mut self, to: State) {
        if to != State::Idle {
            self.state = to;
        }
    }

    pub fn hangup(&mut self) {
        self.shut(State::Closed);
    }

    pub fn pause(&mut self) {
        self.shut(State::Idle);
    }
}

// Words counts words with a state held in a local.
pub fn words(s: &str) -> usize {
    const SPACE: u8 = 0;
    const WORD: u8 = 1;
    let mut state = SPACE;
    let mut n = 0;
    for r in s.chars() {
        match state {
            SPACE => {
                if r != ' ' {
                    state = WORD;
                    n += 1;
                }
            }
            WORD => {
                if r == ' ' {
                    state = SPACE;
                }
            }
            _ => {}
        }
    }
    n
}
