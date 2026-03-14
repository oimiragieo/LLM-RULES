# Next.js App Router Standards

## Architecture: Server vs Client Components

- Default to Server Components — they run only on the server, have zero client JS, and can `await` directly
- Add `'use client'` only when the component needs browser APIs, React state (`useState`), or event handlers
- Place `'use client'` boundaries as deep in the tree as possible — never at the page level unless unavoidable
- Server Components can import and render Client Components, but Client Components cannot import Server Components
- Use `Suspense` boundaries around async Server Components to enable streaming and avoid blocking the entire page

## Data Fetching in Server Components

- Fetch data directly in Server Components with `async/await` — no `useEffect`, no loading state boilerplate

```typescript
// app/users/page.tsx
export default async function UsersPage() {
  const users = await db.user.findMany(); // runs on server
  return <UserList users={users} />;
}
```

- Use `fetch()` with Next.js cache options when calling external APIs — Next.js extends the native `fetch`
- Colocate data fetching with the component that needs the data — avoid prop drilling fetched data

## Caching Strategy

- Static (default): `fetch(url)` — cached indefinitely, revalidated at build
- Time-based ISR: `fetch(url, { next: { revalidate: 60 } })` — revalidates every 60 seconds
- On-demand ISR: use `revalidatePath('/path')` or `revalidateTag('tag')` from Server Actions or route handlers
- No cache (dynamic): `fetch(url, { cache: 'no-store' })` — fetches fresh on every request
- Apply `export const dynamic = 'force-dynamic'` at the page level to opt the entire route out of static generation

```typescript
// Revalidate by tag
const data = await fetch('/api/posts', { next: { tags: ['posts'] } });

// Invalidate from a Server Action
'use server';
import { revalidateTag } from 'next/cache';
export async function deletePost(id: string) {
  await db.post.delete({ where: { id } });
  revalidateTag('posts');
}
```

## Server Actions

- Mark files or functions with `'use server'` to create Server Actions — they run on the server but can be called from the client
- Validate all Server Action inputs with Zod before processing — never trust client-supplied data

```typescript
'use server';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';

const schema = z.object({ title: z.string().min(1), body: z.string() });

export async function createPost(formData: FormData) {
  const input = schema.parse({
    title: formData.get('title'),
    body: formData.get('body'),
  });
  await db.post.create({ data: input });
  revalidatePath('/posts');
}
```

- Use Server Actions with `<form action={action}>` for progressive enhancement — works without JavaScript
- Return structured error objects from Server Actions; use `useFormState` / `useActionState` on the client to display them
- Never expose sensitive logic (private keys, DB queries with raw SQL) in Server Actions without input validation

## Routing Conventions

- Use **dynamic segments** with `[param]` folders: `app/posts/[id]/page.tsx` → `/posts/123`
- Use **route groups** with `(group)` folders to organize routes without affecting the URL: `app/(auth)/login/page.tsx`
- Use **parallel routes** with `@slot` folders for simultaneous rendering of multiple pages in a layout
- Use **intercepting routes** with `(..)` folders for modal-style navigation patterns (e.g., photo lightboxes)
- Place `loading.tsx` alongside `page.tsx` to show a Suspense fallback automatically during navigation
- Place `error.tsx` as a Client Component (`'use client'`) to catch errors in the subtree

## Metadata

- Export `metadata` for static metadata or `generateMetadata` for dynamic metadata — never use `<Head>` from `next/head`

```typescript
// Static
export const metadata = { title: 'Home', description: 'Welcome' };

// Dynamic
export async function generateMetadata({ params }: { params: { id: string } }) {
  const post = await db.post.findUnique({ where: { id: params.id } });
  return { title: post?.title };
}
```

## Image and Font Optimization

- Always use `<Image>` from `next/image` — never raw `<img>` for content images
- Provide `width` and `height` props or use `fill` with a positioned container to prevent CLS
- Use `next/font` to self-host Google Fonts or local fonts — never load fonts via `<link>` in the document head
- Assign font variables via `className` on `<html>` in `app/layout.tsx` and reference them in CSS with `var(--font-sans)`

## Anti-Patterns

- Never fetch data in Client Components with `useEffect` when the data can be fetched in a Server Component
- Never put secrets or database connections in Client Components — they are included in the client bundle
- Never use `cookies()` or `headers()` from `next/headers` without opting the route into dynamic rendering (`no-store` or `force-dynamic`)
- Never import a Server Component into a Client Component — use the `children` prop pattern or composition instead
- Never use `router.refresh()` as a substitute for `revalidatePath` / `revalidateTag` — it is a client-only soft refresh with no cache invalidation

## When to invoke

`Skill({ skill: 'nextjs-expert' })` for Next.js App Router architecture, Server Actions, and caching strategy
