# shadcn/ui monorepo template

This is a Next.js monorepo template with shadcn/ui.

## Adding components

To add components to your app, run the following command at the root of your `web` app:

```bash
pnpm dlx shadcn@latest add button -c apps/web
```

This will place the ui components in the `packages/ui/src/components` directory.

## Using components

UI components come from the published [`bruv-ui`](https://www.npmjs.com/package/bruv-ui) package.

```tsx
import { Button } from "bruv-ui";
```

The local `@workspace/ui` package now only holds app-specific shell pieces
(`dual-sidebar`, `sidebar`, `sheet`, `field`, brand `icons`) plus shared
styles/config until they are upstreamed to `bruv-ui`.
