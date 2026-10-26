namespace Fsm;

// State of a Conn.
public enum State { Idle, Dialing, Open, Closed }

// Conn walks Idle, Dialing, Open, Closed.
public class Conn
{
    State state = State.Idle;
    int tries;

    public void Dial()
    {
        if (state == State.Idle)
        {
            state = State.Dialing;
            tries++;
        }
    }

    public void Event(bool ok)
    {
        switch (state)
        {
            case State.Dialing:
                if (ok) state = State.Open;
                else if (tries < 3) state = State.Idle;
                else state = State.Closed;
                break;
            case State.Open:
            case State.Idle:
                if (!ok) state = State.Closed;
                break;
        }
    }

    // Close jumps to a state only known at run time.
    public void Close(State next) { state = next; }

    public void Reset() { state = State.Idle; }

    public bool Live() { return state == State.Open; }

    // Shut stores a state its callers pass in, except Idle.
    void Shut(State to)
    {
        if (to != State.Idle) state = to;
    }

    public void Hangup() { Shut(State.Closed); }

    public void Pause() { Shut(State.Idle); }
}

public static class Text
{
    // Words counts words with a state held in a local.
    public static int Words(string s)
    {
        const int space = 0, word = 1;
        int state = space, n = 0;
        foreach (var r in s)
        {
            switch (state)
            {
                case space:
                    if (r != ' ') { state = word; n++; }
                    break;
                case word:
                    if (r == ' ') state = space;
                    break;
            }
        }
        return n;
    }
}
