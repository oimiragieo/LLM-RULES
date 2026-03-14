# tRPC Development Standards

## Router Organization

- Organize routers by domain: `server/routers/user.ts`, `server/routers/post.ts`
- Merge sub-routers into a root router in `server/routers/_app.ts`
- Export the `AppRouter` type from the root router — this is the contract the client uses
- Keep routers focused: one router per domain entity or feature, not one monolithic router

```typescript
// server/routers/_app.ts
export const appRouter = createTRPCRouter({
  user: userRouter,
  post: postRouter,
});
export type AppRouter = typeof appRouter;
```

## Procedures

- Use `publicProcedure` for unauthenticated endpoints; define `protectedProcedure` that checks session
- Always validate inputs with Zod schemas in `.input()` — never access `ctx.req.body` directly
- Return plain objects or Zod-parsed values from `.query()` and `.mutation()` — never return class instances
- Use `.output()` schema when the return type must be strict and validated on both sides
- Keep procedure handlers thin — delegate to service functions, not inline business logic

```typescript
export const userRouter = createTRPCRouter({
  byId: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.user.findUniqueOrThrow({ where: { id: input.id } });
    }),
});
```

## Context

- Build context in `server/context.ts` — include `db`, `session`, and request metadata
- Never put business logic in context creation — context is for dependency injection only
- Use `inferAsyncReturnType<typeof createContext>` to derive the `Context` type
- Separate `createInnerTRPCContext` (testable, no request object) from the outer context wrapper

## Client Usage

- Use the tRPC React Query integration (`@trpc/react-query`) — never call tRPC endpoints with fetch directly
- Access queries with `trpc.<router>.<procedure>.useQuery(input, options)`
- Use `trpc.<router>.<procedure>.useMutation()` for mutations; always handle `onSuccess` and `onError`
- Invalidate related queries after mutations: `utils.<router>.<procedure>.invalidate()`
- Use `getQueryKey` for manual cache manipulation — never hardcode query key strings

```typescript
const { data, isLoading } = trpc.user.byId.useQuery({ id: userId });

const mutation = trpc.user.update.useMutation({
  onSuccess: () => utils.user.byId.invalidate({ id: userId }),
});
```

## Error Handling

- Throw `TRPCError` with appropriate `code`: `NOT_FOUND`, `UNAUTHORIZED`, `BAD_REQUEST`, `INTERNAL_SERVER_ERROR`
- Never throw plain `Error` inside procedures — it will be converted to `INTERNAL_SERVER_ERROR` without detail
- Use `formatError` in tRPC config to sanitize error messages before they reach the client
- Handle `TRPCClientError` on the client; check `error.data?.code` for structured error handling

```typescript
throw new TRPCError({
  code: 'NOT_FOUND',
  message: `User ${input.id} not found`,
});
```

## Subscriptions

- Use subscriptions only for real-time data that cannot be polled — prefer queries with refetch intervals for low-frequency updates
- Always clean up subscription resources in the `unsubscribe` callback
- Use `observable` from `@trpc/server/observable` for subscription implementations
- Test subscriptions with `createCaller` in unit tests — avoid WebSocket setup in unit test suites

## Anti-Patterns

- Never import server-side router code into client components — only import `AppRouter` type
- Never skip `.input()` validation — even for procedures with no required fields, use `z.object({})`
- Never expose raw database errors to the client — catch Prisma/DB errors and rethrow as `TRPCError`
- Never use `any` as input or output type — defeats the purpose of end-to-end type safety
- Never mutate context inside a procedure — context is read-only shared state

## When to invoke

Use `nextjs-pro` skill for full tRPC + Next.js App Router integration patterns
