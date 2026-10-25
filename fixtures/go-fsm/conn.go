package fsm

// State of a Conn.
type State int

const (
	Idle State = iota
	Dialing
	Open
	Closed
)

// Conn walks Idle, Dialing, Open, Closed.
type Conn struct {
	state State
	tries int
}

func New() *Conn { return &Conn{state: Idle} }

func (c *Conn) Dial() {
	if c.state == Idle {
		c.state = Dialing
		c.tries++
	}
}

func (c *Conn) Event(ok bool) {
	switch c.state {
	case Dialing:
		if ok {
			c.state = Open
		} else if c.tries < 3 {
			c.state = Idle
		} else {
			c.state = Closed
		}
	case Open, Idle:
		if !ok {
			c.state = Closed
		}
	}
}

// Close jumps to a state only known at run time.
func (c *Conn) Close(next State) { c.state = next }

func (c *Conn) Reset() { c.state = Idle }

func (c *Conn) Live() bool { return c.state == Open }

// shut stores a state its callers pass in, except Idle.
func (c *Conn) shut(to State) {
	if to != Idle {
		c.state = to
	}
}

func (c *Conn) Hangup() { c.shut(Closed) }

func (c *Conn) Pause() { c.shut(Idle) }

// Words counts words with a state held in a local.
func Words(s string) int {
	const (
		space = iota
		word
	)
	state, n := space, 0
	for _, r := range s {
		switch state {
		case space:
			if r != ' ' {
				state = word
				n++
			}
		case word:
			if r == ' ' {
				state = space
			}
		}
	}
	return n
}
