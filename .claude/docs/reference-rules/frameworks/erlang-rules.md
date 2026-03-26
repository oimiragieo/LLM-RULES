# Erlang/OTP Standards

Rules for building fault-tolerant, concurrent Erlang and Elixir applications using OTP principles.

## OTP Design Principles

- Model every stateful service as a `gen_server`, `gen_statem`, or `supervisor` — never roll your own process loop
- Use supervision trees as the primary fault-isolation mechanism: supervisor restarts broken children
- Follow the "let it crash" philosophy — write for the happy path; supervisors handle failures
- Design processes as single units of failure: each process owns one resource or responsibility
- Use `application` behavior to package deployable units; avoid loose scripts in production

## Supervision Trees

```erlang
%% supervisor.erl — OTP supervisor structure
-module(order_supervisor).
-behaviour(supervisor).

-export([start_link/0, init/1]).

start_link() ->
    supervisor:start_link({local, ?MODULE}, ?MODULE, []).

init([]) ->
    SupFlags = #{
        strategy  => one_for_one,   %% Restart only failed child
        intensity => 5,             %% Max 5 restarts
        period    => 60             %% within 60 seconds (else supervisor fails up)
    },
    ChildSpecs = [
        #{
            id       => order_worker,
            start    => {order_worker, start_link, []},
            restart  => permanent,
            shutdown => 5000,
            type     => worker,
            modules  => [order_worker]
        }
    ],
    {ok, {SupFlags, ChildSpecs}}.
```

## gen_server Pattern

```erlang
%% order_worker.erl
-module(order_worker).
-behaviour(gen_server).

-export([start_link/0, place_order/2]).
-export([init/1, handle_call/3, handle_cast/2, handle_info/2, terminate/2]).

-record(state, {db_conn, pending = #{}}).

start_link() ->
    gen_server:start_link({local, ?MODULE}, ?MODULE, [], []).

%% Public API — always go through gen_server calls, never direct state access
place_order(UserId, Items) ->
    gen_server:call(?MODULE, {place_order, UserId, Items}, 5000).

init([]) ->
    %% Trap exits to enable clean shutdown in terminate/2
    process_flag(trap_exit, true),
    {ok, Conn} = db:connect(),
    {ok, #state{db_conn = Conn}}.

handle_call({place_order, UserId, Items}, _From, State) ->
    case db:insert(State#state.db_conn, {UserId, Items}) of
        {ok, OrderId} ->
            {reply, {ok, OrderId}, State};
        {error, Reason} ->
            %% Log and return error — do NOT crash on expected errors
            error_logger:warning_msg("Order failed: ~p~n", [Reason]),
            {reply, {error, Reason}, State}
    end.

handle_cast(_Msg, State) -> {noreply, State}.
handle_info(_Info, State) -> {noreply, State}.

terminate(_Reason, State) ->
    db:close(State#state.db_conn),
    ok.
```

## Message Passing

- Use `gen_server:call/3` for synchronous operations that return a result
- Use `gen_server:cast/2` for fire-and-forget operations with no return value
- Always set a timeout on `call/3` — default `infinity` will hang if the server dies
- Use selective receive (`receive Ref -> ...`) to avoid mailbox flooding from old messages
- Monitor processes (`erlang:monitor/2`) rather than link when you need to handle failures without crashing

## Error Handling

```erlang
%% Use tagged tuples, not exceptions, for expected errors
{ok, Value} = risky_operation()  %% BAD: crashes on error

case risky_operation() of        %% GOOD: explicit error handling
    {ok, Value}    -> handle_success(Value);
    {error, Reason} -> handle_error(Reason)
end.

%% Use try/catch only for truly unexpected exceptions
try
    external_library:call(Data)
catch
    error:badarg  -> {error, invalid_input};
    _Class:Reason -> {error, {unexpected, Reason}}
end.
```

## ETS (Erlang Term Storage)

- Use `ets` for shared in-process caches (read-heavy, multiple readers)
- Use `ets:new/2` with `protected` (default) for single-writer, multi-reader
- Use `mnesia` for distributed persistent storage, not ETS
- Never store large binaries in ETS — they are copied on every read; use references instead
- Set `{heir, Pid, Data}` on ETS tables so they survive their owner's crash

## Process Naming

- Register important, long-lived processes with `{local, atom}` via `gen_server:start_link`
- Use `via` tuples (`{via, gproc, ...}`) for dynamic process discovery
- Never use global process registration (`global`) in production — creates cross-node bottlenecks

## Anti-Patterns (NEVER)

- Never spawn processes without a supervisor — orphaned processes leak memory
- Never use `receive` without a timeout in production — it blocks indefinitely on unexpected messages
- Never share mutable state between processes — pass messages instead
- Never use synchronous calls across node boundaries in hot paths — async messaging only
- Never ignore `DOWN` messages from monitored processes — they indicate resource leaks

## Testing with EUnit + Common Test

```erlang
%% order_worker_test.erl — EUnit
-module(order_worker_test).
-include_lib("eunit/include/eunit.hrl").

place_order_test_() ->
    {setup,
        fun() -> {ok, _} = order_worker:start_link(), ok end,
        fun(_) -> gen_server:stop(order_worker) end,
        [
            ?_assertMatch({ok, _}, order_worker:place_order(<<"user1">>, [item1])),
            ?_assertMatch({error, _}, order_worker:place_order(<<"">>, []))
        ]
    }.
```

## When to Invoke

`Skill({ skill: 'elixir-expert' })` for Elixir/Phoenix OTP applications.
Apply these rules for any Erlang/OTP module or process design.
