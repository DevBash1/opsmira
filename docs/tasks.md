# Tasks and triggers

A task is something the agent does on its own, without you asking each time. Ask for one in chat:

- "Check disk space every morning at 7 and tell me if anything is over 80%."
- "Watch /etc/nginx/nginx.conf and tell me when it changes."
- "If memory use goes above 90%, find out what is using it."
- "Tell me if the `api` container stops."

The agent sets it up with the `manage_tasks` tool and says what it made and when it will run. Open **Tasks** in the top bar to see them all, run one now, pause it, remove it, or switch whether it may act without asking.

## Two kinds

**Schedule**: runs at set times. A cron expression (`0 7 * * *`, five fields, in the server's time zone, which is UTC in Docker) or an interval (`every 30m`, `6h`, `1d`). The minimum is 5 minutes. A run missed while the server was down is not replayed.

**Trigger**: runs a read-only check command on a timer (30 seconds to 24 hours, default 1 minute) and wakes the agent when the result crosses a line:

| `fires` | Wakes the agent when |
|---|---|
| `above:N` / `below:N` | the first number the check prints is above or below N |
| `changed` | the output differs from last time (the first reading is the baseline) |
| `zero` / `nonzero` | the exit code is 0 or not 0 |
| `contains:TEXT` | the output contains the text |

Triggers fire when the condition *starts* being true, not on every check while it holds. After a wake-up the task waits for its cooldown (default 10 minutes) before it can fire again, and it rearms once the condition clears. Good checks print one number or a short stable line, for example:

```
free | awk '/Mem/{printf "%d", $3/$2*100}'     # memory used, percent
stat -c %Y /etc/nginx/nginx.conf               # file modification time
pgrep -c nginx                                  # how many nginx processes
```

## What happens when it wakes

Each task has a chat of its own, named after the task (it shows in History). When the task fires, the agent gets a message saying why, takes one turn, and writes a short report there. Only the last three turns are kept before each wake-up, so a task that runs hourly does not grow without bound.

- **Ask first** (the default for a task made in Ask mode): the agent can look around with read-only commands, but anything that changes the server becomes an approval card in the task's chat. A dot appears on the Tasks button while one is waiting, and the panel shows how many.
- **Acts without asking**: a task made while you were in Full access mode carries that over, so it runs changes with nobody watching. The panel marks it in red and you can turn it off at any time.
- A task run cannot create, change or remove tasks.

## Limits and costs

- Every wake-up is a paid model turn, and a trigger's checks are free. Prefer the slowest schedule or interval that does the job.
- At most 20 tasks. Wake-ups run one at a time, and a turn is stopped after 30 minutes.
- A check must pass the same read-only test as the agent's `inspect` command (no redirects to files, no command substitution, only known diagnostic programs). It is checked again every time it runs.
- A task is tied to the server it was made for. Windows servers can run schedules but not checks yet.
- What a check prints is shown to the model. Do not make it print secrets, and remember that the contents of files and logs come from outside: that is why tasks ask before changing anything unless you allow it.
